# 第14天：Spring Kafka高级特性

## 课程目标
- 掌握Spring Kafka事务消息的实现
- 理解错误处理和重试机制
- 学会配置和使用死信队列
- 掌握消息过滤和路由策略
- 了解Spring Kafka监控和指标收集

## 1. Spring Kafka事务消息

### 1.1 事务消息概述

事务消息确保消息发送和业务操作的原子性：
- 要么都成功，要么都失败
- 避免数据不一致问题
- 支持跨多个Topic的事务

### 1.2 事务配置

#### Producer事务配置

```yaml
# application.yml
spring:
  kafka:
    producer:
      # 启用事务
      transaction-id-prefix: tx-
      # 事务超时时间
      properties:
        transaction.timeout.ms: 60000
        # 幂等性配置
        enable.idempotence: true
        # 确认级别
        acks: all
        # 重试次数
        retries: 3
```

#### 事务管理器配置

```java
@Configuration
@EnableKafka
@EnableTransactionManagement
public class KafkaTransactionConfig {

    @Bean
    public KafkaTransactionManager kafkaTransactionManager(
            ProducerFactory<String, Object> producerFactory) {
        return new KafkaTransactionManager<>(producerFactory);
    }

    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 事务配置
        props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "tx-producer");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.RETRIES_CONFIG, 3);
        
        return new DefaultKafkaProducerFactory<>(props);
    }
}
```

### 1.3 事务消息实现

#### 事务服务类

```java
@Service
@Transactional
public class TransactionalOrderService {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private PaymentService paymentService;
    
    /**
     * 事务性订单处理
     */
    @KafkaTransactional
    public void processOrder(Order order) {
        try {
            // 1. 保存订单到数据库
            Order savedOrder = orderRepository.save(order);
            
            // 2. 发送订单创建事件
            OrderCreatedEvent orderEvent = new OrderCreatedEvent(
                savedOrder.getId(), 
                savedOrder.getUserId(), 
                savedOrder.getAmount()
            );
            kafkaTemplate.send("order-created", orderEvent);
            
            // 3. 处理支付
            PaymentResult paymentResult = paymentService.processPayment(
                savedOrder.getId(), 
                savedOrder.getAmount()
            );
            
            if (paymentResult.isSuccess()) {
                // 4. 发送支付成功事件
                PaymentSuccessEvent paymentEvent = new PaymentSuccessEvent(
                    savedOrder.getId(), 
                    paymentResult.getTransactionId()
                );
                kafkaTemplate.send("payment-success", paymentEvent);
                
                // 5. 更新订单状态
                savedOrder.setStatus(OrderStatus.PAID);
                orderRepository.save(savedOrder);
            } else {
                // 支付失败，抛出异常触发回滚
                throw new PaymentException("Payment failed: " + paymentResult.getErrorMessage());
            }
            
        } catch (Exception e) {
            // 事务会自动回滚，包括Kafka消息
            throw new OrderProcessingException("Order processing failed", e);
        }
    }
}
```

#### 事务监听器

```java
@Component
public class TransactionalEventListener {
    
    @Autowired
    private InventoryService inventoryService;
    
    @KafkaListener(topics = "order-created")
    @KafkaTransactional
    public void handleOrderCreated(OrderCreatedEvent event) {
        try {
            // 扣减库存
            inventoryService.decreaseStock(event.getProductId(), event.getQuantity());
            
            // 发送库存扣减事件
            InventoryDecreasedEvent inventoryEvent = new InventoryDecreasedEvent(
                event.getOrderId(), 
                event.getProductId(), 
                event.getQuantity()
            );
            
            kafkaTemplate.send("inventory-decreased", inventoryEvent);
            
        } catch (InsufficientStockException e) {
            // 库存不足，发送订单取消事件
            OrderCancelledEvent cancelEvent = new OrderCancelledEvent(
                event.getOrderId(), 
                "Insufficient stock"
            );
            kafkaTemplate.send("order-cancelled", cancelEvent);
        }
    }
}
```

## 2. 错误处理和重试机制

### 2.1 消费者错误处理配置

```yaml
spring:
  kafka:
    consumer:
      # 错误处理配置
      properties:
        # 会话超时时间
        session.timeout.ms: 30000
        # 心跳间隔
        heartbeat.interval.ms: 10000
        # 最大轮询间隔
        max.poll.interval.ms: 300000
        # 最大轮询记录数
        max.poll.records: 100
      # 监听器配置
      listener:
        # 确认模式
        ack-mode: manual_immediate
        # 并发数
        concurrency: 3
        # 轮询超时
        poll-timeout: 3000
```

### 2.2 自定义错误处理器

```java
@Component
public class CustomErrorHandler implements ConsumerAwareListenerErrorHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(CustomErrorHandler.class);
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Override
    public Object handleError(Message<?> message, ListenerExecutionFailedException exception,
                            Consumer<?, ?> consumer) {
        
        logger.error("Message processing failed: {}", message.getPayload(), exception);
        
        // 获取消息头信息
        KafkaMessageHeaderAccessor accessor = KafkaMessageHeaderAccessor.wrap(message);
        String topic = accessor.getReceivedTopic();
        Integer partition = accessor.getReceivedPartition();
        Long offset = accessor.getOffset();
        
        // 获取重试次数
        Integer retryCount = getRetryCount(message);
        
        if (retryCount < 3) {
            // 重试处理
            handleRetry(message, retryCount + 1);
        } else {
            // 发送到死信队列
            sendToDeadLetterQueue(message, exception);
        }
        
        return null;
    }
    
    private Integer getRetryCount(Message<?> message) {
        Object retryHeader = message.getHeaders().get("retry-count");
        return retryHeader != null ? (Integer) retryHeader : 0;
    }
    
    private void handleRetry(Message<?> message, int retryCount) {
        try {
            // 添加重试计数头
            MessageHeaders headers = new MessageHeaders(Map.of(
                "retry-count", retryCount,
                "original-topic", message.getHeaders().get(KafkaHeaders.RECEIVED_TOPIC),
                "retry-timestamp", System.currentTimeMillis()
            ));
            
            // 发送到重试Topic
            String retryTopic = message.getHeaders().get(KafkaHeaders.RECEIVED_TOPIC) + "-retry";
            
            Message<Object> retryMessage = MessageBuilder
                .withPayload(message.getPayload())
                .copyHeaders(headers)
                .build();
                
            kafkaTemplate.send(retryTopic, retryMessage);
            
            logger.info("Message sent to retry topic: {}, retry count: {}", retryTopic, retryCount);
            
        } catch (Exception e) {
            logger.error("Failed to send message to retry topic", e);
            sendToDeadLetterQueue(message, e);
        }
    }
    
    private void sendToDeadLetterQueue(Message<?> message, Exception exception) {
        try {
            String dlqTopic = message.getHeaders().get(KafkaHeaders.RECEIVED_TOPIC) + "-dlq";
            
            DeadLetterMessage dlqMessage = new DeadLetterMessage(
                message.getPayload(),
                exception.getMessage(),
                System.currentTimeMillis(),
                message.getHeaders()
            );
            
            kafkaTemplate.send(dlqTopic, dlqMessage);
            
            logger.error("Message sent to dead letter queue: {}", dlqTopic);
            
        } catch (Exception e) {
            logger.error("Failed to send message to dead letter queue", e);
        }
    }
}
```

### 2.3 重试监听器配置

```java
@Configuration
public class RetryListenerConfig {
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> 
            retryKafkaListenerContainerFactory() {
        
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        
        // 配置重试
        factory.setRetryTemplate(retryTemplate());
        factory.setRecoveryCallback(recoveryCallback());
        
        // 配置错误处理器
        factory.setErrorHandler(new SeekToCurrentErrorHandler(
            new FixedBackOff(1000L, 3L)
        ));
        
        return factory;
    }
    
    @Bean
    public RetryTemplate retryTemplate() {
        RetryTemplate retryTemplate = new RetryTemplate();
        
        // 重试策略
        FixedBackOffPolicy backOffPolicy = new FixedBackOffPolicy();
        backOffPolicy.setBackOffPeriod(2000L); // 2秒间隔
        retryTemplate.setBackOffPolicy(backOffPolicy);
        
        // 重试次数
        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy();
        retryPolicy.setMaxAttempts(3);
        retryTemplate.setRetryPolicy(retryPolicy);
        
        return retryTemplate;
    }
    
    @Bean
    public RecoveryCallback<Void> recoveryCallback() {
        return context -> {
            logger.error("Recovery callback triggered after {} attempts", 
                context.getRetryCount());
            
            // 发送到死信队列或进行其他恢复操作
            Exception lastException = (Exception) context.getAttribute("lastException");
            handleRecovery(context, lastException);
            
            return null;
        };
    }
}
```

## 3. 死信队列(DLQ)实现

### 3.1 死信队列配置

```java
@Configuration
public class DeadLetterQueueConfig {
    
    @Bean
    public NewTopic orderDlqTopic() {
        return TopicBuilder.name("order-processing-dlq")
            .partitions(3)
            .replicas(1)
            .config(TopicConfig.RETENTION_MS_CONFIG, "604800000") // 7天保留
            .build();
    }
    
    @Bean
    public NewTopic paymentDlqTopic() {
        return TopicBuilder.name("payment-processing-dlq")
            .partitions(3)
            .replicas(1)
            .build();
    }
}
```

### 3.2 死信消息处理

```java
@Component
public class DeadLetterQueueHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(DeadLetterQueueHandler.class);
    
    @Autowired
    private AlertService alertService;
    
    @Autowired
    private MessageRepository messageRepository;
    
    @KafkaListener(topics = "#{T(java.util.Arrays).asList('order-processing-dlq', 'payment-processing-dlq')}")
    public void handleDeadLetterMessage(
            @Payload DeadLetterMessage message,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
            @Header(KafkaHeaders.OFFSET) long offset) {
        
        logger.error("Received dead letter message from topic: {}, partition: {}, offset: {}", 
            topic, partition, offset);
        
        try {
            // 1. 保存死信消息到数据库
            DeadLetterRecord record = new DeadLetterRecord(
                topic,
                partition,
                offset,
                message.getOriginalPayload(),
                message.getErrorMessage(),
                message.getTimestamp(),
                message.getOriginalHeaders()
            );
            
            messageRepository.save(record);
            
            // 2. 发送告警
            alertService.sendAlert(
                "Dead Letter Message Received",
                String.format("Topic: %s, Error: %s", topic, message.getErrorMessage())
            );
            
            // 3. 根据消息类型进行特殊处理
            handleSpecificDeadLetterMessage(message, topic);
            
        } catch (Exception e) {
            logger.error("Failed to handle dead letter message", e);
        }
    }
    
    private void handleSpecificDeadLetterMessage(DeadLetterMessage message, String topic) {
        if (topic.contains("order")) {
            handleOrderDeadLetter(message);
        } else if (topic.contains("payment")) {
            handlePaymentDeadLetter(message);
        }
    }
    
    private void handleOrderDeadLetter(DeadLetterMessage message) {
        // 订单相关死信处理逻辑
        logger.info("Handling order dead letter message: {}", message.getOriginalPayload());
        
        // 可以触发人工干预流程
        // 或者尝试修复数据后重新处理
    }
    
    private void handlePaymentDeadLetter(DeadLetterMessage message) {
        // 支付相关死信处理逻辑
        logger.info("Handling payment dead letter message: {}", message.getOriginalPayload());
        
        // 支付失败可能需要退款或者通知用户
    }
}
```

### 3.3 死信消息重处理

```java
@RestController
@RequestMapping("/api/dlq")
public class DeadLetterQueueController {
    
    @Autowired
    private MessageRepository messageRepository;
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    /**
     * 查询死信消息
     */
    @GetMapping("/messages")
    public ResponseEntity<Page<DeadLetterRecord>> getDeadLetterMessages(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String topic) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<DeadLetterRecord> messages;
        
        if (topic != null) {
            messages = messageRepository.findByTopicContaining(topic, pageable);
        } else {
            messages = messageRepository.findAll(pageable);
        }
        
        return ResponseEntity.ok(messages);
    }
    
    /**
     * 重新处理死信消息
     */
    @PostMapping("/reprocess/{messageId}")
    public ResponseEntity<String> reprocessMessage(@PathVariable Long messageId) {
        try {
            Optional<DeadLetterRecord> recordOpt = messageRepository.findById(messageId);
            
            if (recordOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            DeadLetterRecord record = recordOpt.get();
            
            // 获取原始Topic名称（去掉-dlq后缀）
            String originalTopic = record.getTopic().replace("-dlq", "");
            
            // 重新发送到原始Topic
            kafkaTemplate.send(originalTopic, record.getPayload());
            
            // 标记为已重处理
            record.setReprocessed(true);
            record.setReprocessedAt(LocalDateTime.now());
            messageRepository.save(record);
            
            return ResponseEntity.ok("Message reprocessed successfully");
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Failed to reprocess message: " + e.getMessage());
        }
    }
    
    /**
     * 批量重处理
     */
    @PostMapping("/reprocess/batch")
    public ResponseEntity<String> reprocessMessages(@RequestBody List<Long> messageIds) {
        try {
            int successCount = 0;
            int failCount = 0;
            
            for (Long messageId : messageIds) {
                try {
                    reprocessMessage(messageId);
                    successCount++;
                } catch (Exception e) {
                    failCount++;
                    logger.error("Failed to reprocess message {}", messageId, e);
                }
            }
            
            return ResponseEntity.ok(
                String.format("Batch reprocess completed. Success: %d, Failed: %d", 
                    successCount, failCount)
            );
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Batch reprocess failed: " + e.getMessage());
        }
    }
}
```

## 4. 消息过滤和路由

### 4.1 消息过滤器

```java
@Component
public class MessageFilter {
    
    /**
     * 基于消息头的过滤
     */
    @KafkaListener(
        topics = "user-events",
        containerFactory = "filterKafkaListenerContainerFactory"
    )
    public void handleFilteredUserEvents(
            @Payload UserEvent event,
            @Header Map<String, Object> headers) {
        
        // 只处理VIP用户事件
        if ("VIP".equals(headers.get("user-type"))) {
            processVipUserEvent(event);
        }
    }
    
    /**
     * 基于消息内容的过滤
     */
    @KafkaListener(
        topics = "order-events",
        filter = "orderAmountFilter"
    )
    public void handleHighValueOrders(@Payload OrderEvent event) {
        // 只处理高价值订单
        if (event.getAmount().compareTo(new BigDecimal("1000")) > 0) {
            processHighValueOrder(event);
        }
    }
}
```

### 4.2 过滤器配置

```java
@Configuration
public class MessageFilterConfig {
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> 
            filterKafkaListenerContainerFactory() {
        
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        
        // 设置记录过滤策略
        factory.setRecordFilterStrategy(record -> {
            // 过滤掉测试消息
            return record.value().toString().contains("test");
        });
        
        return factory;
    }
    
    @Bean("orderAmountFilter")
    public RecordFilterStrategy<String, OrderEvent> orderAmountFilter() {
        return record -> {
            OrderEvent event = record.value();
            // 过滤掉小额订单
            return event.getAmount().compareTo(new BigDecimal("100")) < 0;
        };
    }
}
```

### 4.3 消息路由

```java
@Component
public class MessageRouter {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @KafkaListener(topics = "user-registration")
    public void routeUserRegistration(@Payload UserRegistrationEvent event) {
        
        // 根据用户类型路由到不同Topic
        String routingTopic = determineRoutingTopic(event);
        
        // 添加路由信息到消息头
        ProducerRecord<String, Object> record = new ProducerRecord<>(
            routingTopic, 
            event.getUserId(), 
            event
        );
        
        record.headers().add("routing-source", "user-registration".getBytes());
        record.headers().add("routing-timestamp", 
            String.valueOf(System.currentTimeMillis()).getBytes());
        
        kafkaTemplate.send(record);
    }
    
    private String determineRoutingTopic(UserRegistrationEvent event) {
        if (event.getUserType() == UserType.ENTERPRISE) {
            return "enterprise-users";
        } else if (event.getUserType() == UserType.VIP) {
            return "vip-users";
        } else {
            return "regular-users";
        }
    }
    
    @KafkaListener(topics = "order-events")
    public void routeOrderEvents(@Payload OrderEvent event) {
        
        // 根据订单金额和地区路由
        List<String> targetTopics = new ArrayList<>();
        
        // 高价值订单
        if (event.getAmount().compareTo(new BigDecimal("1000")) > 0) {
            targetTopics.add("high-value-orders");
        }
        
        // 国际订单
        if (!"CN".equals(event.getCountryCode())) {
            targetTopics.add("international-orders");
        }
        
        // 特定地区订单
        if (Arrays.asList("US", "EU", "JP").contains(event.getCountryCode())) {
            targetTopics.add("priority-region-orders");
        }
        
        // 发送到所有目标Topic
        for (String topic : targetTopics) {
            kafkaTemplate.send(topic, event.getOrderId(), event);
        }
    }
}
```

## 5. 监控和指标收集

### 5.1 JMX监控配置

```yaml
spring:
  kafka:
    producer:
      properties:
        # 启用JMX
        jmx.reporting.enabled: true
        # 指标报告间隔
        metrics.sample.window.ms: 30000
        metrics.num.samples: 2
    consumer:
      properties:
        jmx.reporting.enabled: true
        metrics.sample.window.ms: 30000
        metrics.num.samples: 2

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: always
  metrics:
    export:
      prometheus:
        enabled: true
```

### 5.2 自定义指标收集

```java
@Component
public class KafkaMetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final Counter messagesSentCounter;
    private final Counter messagesReceivedCounter;
    private final Counter messagesFailedCounter;
    private final Timer messageProcessingTimer;
    
    public KafkaMetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        
        this.messagesSentCounter = Counter.builder("kafka.messages.sent")
            .description("Number of messages sent to Kafka")
            .register(meterRegistry);
            
        this.messagesReceivedCounter = Counter.builder("kafka.messages.received")
            .description("Number of messages received from Kafka")
            .register(meterRegistry);
            
        this.messagesFailedCounter = Counter.builder("kafka.messages.failed")
            .description("Number of failed message processing")
            .register(meterRegistry);
            
        this.messageProcessingTimer = Timer.builder("kafka.message.processing.time")
            .description("Time taken to process messages")
            .register(meterRegistry);
    }
    
    public void recordMessageSent(String topic) {
        messagesSentCounter.increment(
            Tags.of("topic", topic)
        );
    }
    
    public void recordMessageReceived(String topic) {
        messagesReceivedCounter.increment(
            Tags.of("topic", topic)
        );
    }
    
    public void recordMessageFailed(String topic, String errorType) {
        messagesFailedCounter.increment(
            Tags.of("topic", topic, "error.type", errorType)
        );
    }
    
    public Timer.Sample startProcessingTimer() {
        return Timer.start(meterRegistry);
    }
    
    public void recordProcessingTime(Timer.Sample sample, String topic) {
        sample.stop(messageProcessingTimer.tag("topic", topic));
    }
}
```

### 5.3 监控拦截器

```java
@Component
public class MetricsProducerInterceptor implements ProducerInterceptor<String, Object> {
    
    @Autowired
    private KafkaMetricsCollector metricsCollector;
    
    @Override
    public ProducerRecord<String, Object> onSend(ProducerRecord<String, Object> record) {
        metricsCollector.recordMessageSent(record.topic());
        return record;
    }
    
    @Override
    public void onAcknowledgement(RecordMetadata metadata, Exception exception) {
        if (exception != null) {
            metricsCollector.recordMessageFailed(metadata.topic(), exception.getClass().getSimpleName());
        }
    }
    
    @Override
    public void close() {
        // 清理资源
    }
    
    @Override
    public void configure(Map<String, ?> configs) {
        // 配置初始化
    }
}

@Component
public class MetricsConsumerInterceptor implements ConsumerInterceptor<String, Object> {
    
    @Autowired
    private KafkaMetricsCollector metricsCollector;
    
    @Override
    public ConsumerRecords<String, Object> onConsume(ConsumerRecords<String, Object> records) {
        for (ConsumerRecord<String, Object> record : records) {
            metricsCollector.recordMessageReceived(record.topic());
        }
        return records;
    }
    
    @Override
    public void onCommit(Map<TopicPartition, OffsetAndMetadata> offsets) {
        // 提交偏移量时的处理
    }
    
    @Override
    public void close() {
        // 清理资源
    }
    
    @Override
    public void configure(Map<String, ?> configs) {
        // 配置初始化
    }
}
```

## 实战案例：电商订单处理系统

### 案例背景
构建一个完整的电商订单处理系统，包含事务消息、错误处理、死信队列等高级特性。

### 系统架构
```
订单服务 -> Kafka -> [库存服务, 支付服务, 物流服务]
    ↓
事务消息确保一致性
    ↓
错误重试 -> 死信队列 -> 人工处理
```

### 核心实现

```java
@Service
@Transactional
public class OrderProcessingService {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Autowired
    private KafkaMetricsCollector metricsCollector;
    
    @KafkaTransactional
    public void processCompleteOrder(CompleteOrderRequest request) {
        Timer.Sample sample = metricsCollector.startProcessingTimer();
        
        try {
            // 1. 创建订单
            Order order = createOrder(request);
            
            // 2. 发送订单事件（事务性）
            OrderCreatedEvent orderEvent = new OrderCreatedEvent(order);
            kafkaTemplate.send("order-created", order.getId(), orderEvent);
            
            // 3. 发送库存检查事件
            InventoryCheckEvent inventoryEvent = new InventoryCheckEvent(
                order.getId(), order.getItems()
            );
            kafkaTemplate.send("inventory-check", order.getId(), inventoryEvent);
            
            // 4. 发送支付事件
            PaymentRequestEvent paymentEvent = new PaymentRequestEvent(
                order.getId(), order.getTotalAmount(), request.getPaymentMethod()
            );
            kafkaTemplate.send("payment-request", order.getId(), paymentEvent);
            
            metricsCollector.recordProcessingTime(sample, "order-processing");
            
        } catch (Exception e) {
            metricsCollector.recordMessageFailed("order-processing", e.getClass().getSimpleName());
            throw new OrderProcessingException("Failed to process order", e);
        }
    }
}
```

## 实战练习

### 练习1：实现事务消息
1. 配置Kafka事务
2. 实现订单和支付的事务性处理
3. 测试事务回滚场景

### 练习2：配置错误处理和重试
1. 实现自定义错误处理器
2. 配置重试策略
3. 测试重试和恢复机制

### 练习3：实现死信队列
1. 配置死信队列Topic
2. 实现死信消息处理
3. 开发死信消息重处理功能

### 练习4：消息过滤和路由
1. 实现基于消息头的过滤
2. 实现基于消息内容的路由
3. 测试不同路由策略

## 课后作业

### 作业1：完整的事务消息系统
设计并实现一个包含以下功能的事务消息系统：
- 订单创建事务
- 库存扣减事务
- 支付处理事务
- 事务失败回滚

### 作业2：高可用错误处理系统
实现一个高可用的错误处理系统：
- 多级重试策略
- 智能死信队列
- 自动恢复机制
- 监控和告警

### 作业3：性能监控和优化
开发Kafka性能监控系统：
- 自定义指标收集
- Prometheus集成
- Grafana仪表板
- 性能优化建议

## 课程总结

### 关键知识点回顾
1. **事务消息**：确保消息发送和业务操作的原子性
2. **错误处理**：多级重试和恢复策略
3. **死信队列**：处理无法正常消费的消息
4. **消息过滤**：基于条件的消息筛选
5. **监控指标**：全面的性能监控和告警

### 最佳实践
1. 合理配置事务超时时间
2. 设计有效的重试策略
3. 及时处理死信消息
4. 实施全面的监控
5. 定期进行性能优化

### 下节预告
下一节课我们将学习**Kafka Stream流处理基础**，包括：
- Stream处理概念
- KStream和KTable
- 流处理拓扑
- 窗口操作
- 状态存储