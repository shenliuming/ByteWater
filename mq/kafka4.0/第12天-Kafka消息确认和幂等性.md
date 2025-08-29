# 第12天：Kafka消息确认和幂等性

## 学习目标
- 深入理解Kafka的消息确认机制（ACK机制）
- 掌握生产者和消费者的幂等性保证
- 学会使用Kafka事务消息确保数据一致性
- 了解重复消费的处理策略和最佳实践
- 掌握Exactly-Once语义的实现原理和应用

## 课程内容

### 上午内容

#### 1. Kafka消息确认机制深入

##### 1.1 生产者ACK机制

```
┌─────────────────────────────────────────────────────────────┐
│                    Producer ACK Levels                     │
├─────────────────────────────────────────────────────────────┤
│  acks=0 (Fire and Forget)                                  │
│  ┌─────────────┐    ┌─────────────┐                       │
│  │  Producer   │ -> │   Broker    │                       │
│  │             │    │             │                       │
│  └─────────────┘    └─────────────┘                       │
│  No acknowledgment required                                 │
│                                                             │
│  acks=1 (Leader Acknowledgment)                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Producer   │ -> │   Leader    │ -> │  Follower   │     │
│  │             │ <- │             │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│  Leader confirms write                                      │
│                                                             │
│  acks=all/-1 (All ISR Acknowledgment)                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Producer   │ -> │   Leader    │ -> │  Follower1  │     │
│  │             │    │             │ -> │  Follower2  │     │
│  │             │ <- │             │ <- │     ...     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│  All ISR replicas confirm write                             │
└─────────────────────────────────────────────────────────────┘
```

**ACK级别详解**：
- **acks=0**: 生产者不等待任何确认，最高性能但可能丢失数据
- **acks=1**: 等待Leader确认，平衡性能和可靠性
- **acks=all**: 等待所有ISR副本确认，最高可靠性但性能较低

##### 1.2 生产者确认配置示例

```java
/**
 * 不同ACK级别的生产者配置
 */
public class ProducerAckExamples {
    
    // 高性能配置（acks=0）
    public static KafkaProducer<String, String> createFireAndForgetProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 高性能设置
        props.put("acks", "0");                    // 不等待确认
        props.put("retries", 0);                   // 不重试
        props.put("batch.size", 65536);            // 64KB批次大小
        props.put("linger.ms", 5);                 // 5ms延迟
        props.put("buffer.memory", 67108864);      // 64MB缓冲区
        
        return new KafkaProducer<>(props);
    }
    
    // 平衡配置（acks=1）
    public static KafkaProducer<String, String> createBalancedProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 平衡设置
        props.put("acks", "1");                    // Leader确认
        props.put("retries", 3);                   // 重试3次
        props.put("retry.backoff.ms", 1000);       // 重试间隔1秒
        props.put("batch.size", 32768);            // 32KB批次大小
        props.put("linger.ms", 10);                // 10ms延迟
        props.put("request.timeout.ms", 30000);    // 30秒请求超时
        
        return new KafkaProducer<>(props);
    }
    
    // 高可靠性配置（acks=all）
    public static KafkaProducer<String, String> createReliableProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 高可靠性设置
        props.put("acks", "all");                  // 所有ISR确认
        props.put("retries", Integer.MAX_VALUE);   // 无限重试
        props.put("retry.backoff.ms", 1000);       // 重试间隔1秒
        props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
        props.put("enable.idempotence", true);     // 启用幂等性
        props.put("batch.size", 16384);            // 16KB批次大小
        props.put("linger.ms", 20);                // 20ms延迟
        props.put("request.timeout.ms", 60000);    // 60秒请求超时
        props.put("delivery.timeout.ms", 120000);  // 120秒交付超时
        
        return new KafkaProducer<>(props);
    }
    
    // 测试不同ACK级别的性能和可靠性
    public static void testAckLevels() {
        String topic = "ack-test-topic";
        int messageCount = 10000;
        
        // 测试acks=0
        System.out.println("Testing acks=0 (Fire and Forget)");
        testProducerPerformance(createFireAndForgetProducer(), topic, messageCount, "acks=0");
        
        // 测试acks=1
        System.out.println("\nTesting acks=1 (Leader Acknowledgment)");
        testProducerPerformance(createBalancedProducer(), topic, messageCount, "acks=1");
        
        // 测试acks=all
        System.out.println("\nTesting acks=all (All ISR Acknowledgment)");
        testProducerPerformance(createReliableProducer(), topic, messageCount, "acks=all");
    }
    
    private static void testProducerPerformance(KafkaProducer<String, String> producer, 
                                               String topic, int messageCount, String ackLevel) {
        long startTime = System.currentTimeMillis();
        int successCount = 0;
        int failureCount = 0;
        
        for (int i = 0; i < messageCount; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                topic, "key-" + i, "message-" + i + "-" + ackLevel);
            
            try {
                RecordMetadata metadata = producer.send(record).get(5, TimeUnit.SECONDS);
                successCount++;
                
                if (i % 1000 == 0) {
                    System.out.printf("Sent %d messages, latest offset: %d%n", i + 1, metadata.offset());
                }
            } catch (Exception e) {
                failureCount++;
                if (failureCount <= 10) {  // 只打印前10个错误
                    System.err.println("Send failed: " + e.getMessage());
                }
            }
        }
        
        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        
        System.out.printf("Results for %s:%n", ackLevel);
        System.out.printf("  Total time: %d ms%n", duration);
        System.out.printf("  Success: %d messages%n", successCount);
        System.out.printf("  Failures: %d messages%n", failureCount);
        System.out.printf("  Throughput: %.2f messages/sec%n", 
            (double) successCount / duration * 1000);
        
        producer.close();
    }
}
```

#### 2. 生产者幂等性机制

##### 2.1 幂等性原理

```
┌─────────────────────────────────────────────────────────────┐
│                Producer Idempotence Mechanism               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Producer                    Broker                         │
│  ┌─────────────┐            ┌─────────────┐                │
│  │ PID: 12345  │            │             │                │
│  │ Seq: 0      │ ────────>  │ PID: 12345  │                │
│  │ Message A   │            │ Seq: 0 ✓    │                │
│  └─────────────┘            │ Message A   │                │
│                              └─────────────┘                │
│                                                             │
│  ┌─────────────┐            ┌─────────────┐                │
│  │ PID: 12345  │            │             │                │
│  │ Seq: 1      │ ────────>  │ PID: 12345  │                │
│  │ Message B   │            │ Seq: 1 ✓    │                │
│  └─────────────┘            │ Message B   │                │
│                              └─────────────┘                │
│                                                             │
│  ┌─────────────┐            ┌─────────────┐                │
│  │ PID: 12345  │            │             │                │
│  │ Seq: 1      │ ────────>  │ PID: 12345  │                │
│  │ Message B   │  (Retry)   │ Seq: 1 ✗    │ (Duplicate)    │
│  └─────────────┘            │ Ignored     │                │
│                              └─────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**幂等性关键概念**：
- **Producer ID (PID)**: 每个生产者实例的唯一标识
- **Sequence Number**: 每个分区的消息序列号
- **Epoch**: 生产者会话标识，防止僵尸生产者

##### 2.2 幂等性生产者实现

```java
/**
 * 幂等性生产者示例
 */
public class IdempotentProducerExample {
    
    public static void main(String[] args) {
        // 创建幂等性生产者
        KafkaProducer<String, String> producer = createIdempotentProducer();
        
        String topic = "idempotent-test-topic";
        
        // 测试正常发送
        testNormalSend(producer, topic);
        
        // 测试重复发送检测
        testDuplicateDetection(producer, topic);
        
        // 测试网络故障恢复
        testNetworkFailureRecovery(producer, topic);
        
        producer.close();
    }
    
    private static KafkaProducer<String, String> createIdempotentProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 幂等性配置
        props.put("enable.idempotence", true);     // 启用幂等性
        props.put("acks", "all");                  // 必须设置为all
        props.put("retries", Integer.MAX_VALUE);   // 允许重试
        props.put("max.in.flight.requests.per.connection", 5);  // 最多5个未确认请求
        
        // 其他配置
        props.put("batch.size", 16384);
        props.put("linger.ms", 10);
        props.put("request.timeout.ms", 30000);
        props.put("delivery.timeout.ms", 120000);
        
        return new KafkaProducer<>(props);
    }
    
    private static void testNormalSend(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Normal Send ===");
        
        for (int i = 0; i < 10; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                topic, "key-" + i, "normal-message-" + i);
            
            producer.send(record, (metadata, exception) -> {
                if (exception == null) {
                    System.out.printf("Normal send - Topic: %s, Partition: %d, Offset: %d%n",
                        metadata.topic(), metadata.partition(), metadata.offset());
                } else {
                    System.err.println("Normal send failed: " + exception.getMessage());
                }
            });
        }
        
        producer.flush();
        System.out.println("Normal send completed\n");
    }
    
    private static void testDuplicateDetection(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Duplicate Detection ===");
        
        String key = "duplicate-test-key";
        String value = "duplicate-test-message";
        
        // 发送相同的消息多次（模拟重试场景）
        for (int i = 0; i < 3; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(topic, key, value);
            
            producer.send(record, (metadata, exception) -> {
                if (exception == null) {
                    System.out.printf("Duplicate test - Attempt, Topic: %s, Partition: %d, Offset: %d%n",
                        metadata.topic(), metadata.partition(), metadata.offset());
                } else {
                    System.err.println("Duplicate test failed: " + exception.getMessage());
                }
            });
        }
        
        producer.flush();
        System.out.println("Duplicate detection test completed\n");
    }
    
    private static void testNetworkFailureRecovery(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Network Failure Recovery ===");
        
        // 模拟网络不稳定情况下的消息发送
        for (int i = 0; i < 5; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                topic, "recovery-key-" + i, "recovery-message-" + i);
            
            producer.send(record, (metadata, exception) -> {
                if (exception == null) {
                    System.out.printf("Recovery test - Topic: %s, Partition: %d, Offset: %d%n",
                        metadata.topic(), metadata.partition(), metadata.offset());
                } else {
                    System.err.println("Recovery test failed: " + exception.getMessage());
                    // 在实际应用中，幂等性生产者会自动重试
                }
            });
            
            // 模拟网络延迟
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        producer.flush();
        System.out.println("Network failure recovery test completed\n");
    }
}
```

#### 3. Kafka事务消息

##### 3.1 事务消息原理

```
┌─────────────────────────────────────────────────────────────┐
│                 Kafka Transaction Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Producer              Transaction Coordinator    Broker    │
│  ┌─────────────┐       ┌─────────────┐          ┌─────────┐ │
│  │             │ ───1──>│             │          │         │ │
│  │ initTxns()  │       │ Register    │          │         │ │
│  │             │ <──2───│ Producer    │          │         │ │
│  └─────────────┘       └─────────────┘          └─────────┘ │
│                                                             │
│  ┌─────────────┐       ┌─────────────┐          ┌─────────┐ │
│  │             │ ───3──>│             │          │         │ │
│  │ beginTxn()  │       │ Begin Txn   │          │         │ │
│  │             │ <──4───│             │          │         │ │
│  └─────────────┘       └─────────────┘          └─────────┘ │
│                                                             │
│  ┌─────────────┐                                ┌─────────┐ │
│  │             │ ───5──────────────────────────>│         │ │
│  │ send()      │                                │ Write   │ │
│  │ send()      │ ───6──────────────────────────>│ Messages│ │
│  │ send()      │                                │         │ │
│  └─────────────┘                                └─────────┘ │
│                                                             │
│  ┌─────────────┐       ┌─────────────┐          ┌─────────┐ │
│  │             │ ───7──>│             │          │         │ │
│  │ commitTxn() │       │ Commit Txn  │ ────8───>│ Commit  │ │
│  │             │ <──9───│             │ <───10───│ Markers │ │
│  └─────────────┘       └─────────────┘          └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

##### 3.2 事务生产者实现

```java
/**
 * 事务生产者示例
 */
public class TransactionalProducerExample {
    
    public static void main(String[] args) {
        // 创建事务生产者
        KafkaProducer<String, String> producer = createTransactionalProducer();
        
        String topic = "transactional-test-topic";
        
        // 测试成功事务
        testSuccessfulTransaction(producer, topic);
        
        // 测试事务回滚
        testTransactionRollback(producer, topic);
        
        // 测试批量事务处理
        testBatchTransactionProcessing(producer, topic);
        
        producer.close();
    }
    
    private static KafkaProducer<String, String> createTransactionalProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 事务配置
        props.put("transactional.id", "txn-producer-" + UUID.randomUUID().toString());
        props.put("enable.idempotence", true);     // 事务需要幂等性
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("max.in.flight.requests.per.connection", 5);
        
        // 事务超时配置
        props.put("transaction.timeout.ms", 60000);  // 60秒事务超时
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 初始化事务
        producer.initTransactions();
        
        return producer;
    }
    
    private static void testSuccessfulTransaction(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Successful Transaction ===");
        
        try {
            // 开始事务
            producer.beginTransaction();
            
            // 发送多条消息
            for (int i = 0; i < 5; i++) {
                ProducerRecord<String, String> record = new ProducerRecord<>(
                    topic, "txn-key-" + i, "txn-message-" + i);
                
                producer.send(record, (metadata, exception) -> {
                    if (exception == null) {
                        System.out.printf("Txn message sent - Partition: %d, Offset: %d%n",
                            metadata.partition(), metadata.offset());
                    } else {
                        System.err.println("Txn message failed: " + exception.getMessage());
                    }
                });
            }
            
            // 提交事务
            producer.commitTransaction();
            System.out.println("Transaction committed successfully\n");
            
        } catch (Exception e) {
            System.err.println("Transaction failed: " + e.getMessage());
            producer.abortTransaction();
        }
    }
    
    private static void testTransactionRollback(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Transaction Rollback ===");
        
        try {
            // 开始事务
            producer.beginTransaction();
            
            // 发送一些消息
            for (int i = 0; i < 3; i++) {
                ProducerRecord<String, String> record = new ProducerRecord<>(
                    topic, "rollback-key-" + i, "rollback-message-" + i);
                
                producer.send(record);
            }
            
            // 模拟业务逻辑错误
            boolean businessLogicFailed = true;
            if (businessLogicFailed) {
                throw new RuntimeException("Business logic failed");
            }
            
            // 这行不会执行
            producer.commitTransaction();
            
        } catch (Exception e) {
            System.err.println("Transaction error: " + e.getMessage());
            // 回滚事务
            producer.abortTransaction();
            System.out.println("Transaction aborted\n");
        }
    }
    
    private static void testBatchTransactionProcessing(KafkaProducer<String, String> producer, String topic) {
        System.out.println("=== Testing Batch Transaction Processing ===");
        
        int batchSize = 10;
        int totalMessages = 50;
        
        for (int batch = 0; batch < totalMessages / batchSize; batch++) {
            try {
                // 开始新事务
                producer.beginTransaction();
                
                // 批量发送消息
                for (int i = 0; i < batchSize; i++) {
                    int messageId = batch * batchSize + i;
                    ProducerRecord<String, String> record = new ProducerRecord<>(
                        topic, "batch-key-" + messageId, "batch-message-" + messageId);
                    
                    producer.send(record);
                }
                
                // 模拟随机失败
                if (Math.random() < 0.2) {  // 20%概率失败
                    throw new RuntimeException("Random batch failure");
                }
                
                // 提交事务
                producer.commitTransaction();
                System.out.println("Batch " + (batch + 1) + " committed successfully");
                
            } catch (Exception e) {
                System.err.println("Batch " + (batch + 1) + " failed: " + e.getMessage());
                producer.abortTransaction();
                System.out.println("Batch " + (batch + 1) + " aborted");
            }
        }
        
        System.out.println("Batch transaction processing completed\n");
    }
}
```

### 下午内容

#### 4. 消费者幂等性和重复处理

##### 4.1 消费者重复消费场景

```java
/**
 * 消费者重复消费处理示例
 */
public class DuplicateConsumptionHandler {
    
    // 使用内存缓存检测重复
    private static class MemoryBasedDeduplication {
        private final Set<String> processedMessages = ConcurrentHashMap.newKeySet();
        private final int maxCacheSize = 10000;
        
        public boolean isDuplicate(String messageId) {
            if (processedMessages.size() >= maxCacheSize) {
                // 简单的LRU清理策略
                processedMessages.clear();
            }
            
            return !processedMessages.add(messageId);
        }
    }
    
    // 使用数据库检测重复
    private static class DatabaseBasedDeduplication {
        // 模拟数据库操作
        private final Set<String> database = ConcurrentHashMap.newKeySet();
        
        public boolean isDuplicate(String messageId) {
            // 在实际应用中，这里应该是数据库查询
            return !database.add(messageId);
        }
        
        public void markAsProcessed(String messageId) {
            database.add(messageId);
        }
    }
    
    // 使用Redis检测重复
    private static class RedisBasedDeduplication {
        // 模拟Redis操作
        private final Map<String, Long> redisCache = new ConcurrentHashMap<>();
        private final long ttlMs = 3600000; // 1小时TTL
        
        public boolean isDuplicate(String messageId) {
            Long timestamp = redisCache.get(messageId);
            if (timestamp != null) {
                // 检查是否过期
                if (System.currentTimeMillis() - timestamp < ttlMs) {
                    return true;
                } else {
                    redisCache.remove(messageId);
                }
            }
            return false;
        }
        
        public void markAsProcessed(String messageId) {
            redisCache.put(messageId, System.currentTimeMillis());
        }
    }
    
    public static void main(String[] args) {
        // 测试不同的去重策略
        testMemoryBasedDeduplication();
        testDatabaseBasedDeduplication();
        testRedisBasedDeduplication();
    }
    
    private static void testMemoryBasedDeduplication() {
        System.out.println("=== Testing Memory-Based Deduplication ===");
        
        MemoryBasedDeduplication dedup = new MemoryBasedDeduplication();
        
        // 模拟消息处理
        String[] messages = {"msg1", "msg2", "msg1", "msg3", "msg2", "msg4"};
        
        for (String messageId : messages) {
            if (dedup.isDuplicate(messageId)) {
                System.out.println("Duplicate message detected: " + messageId);
            } else {
                System.out.println("Processing new message: " + messageId);
                // 处理消息逻辑
                processMessage(messageId);
            }
        }
        
        System.out.println();
    }
    
    private static void testDatabaseBasedDeduplication() {
        System.out.println("=== Testing Database-Based Deduplication ===");
        
        DatabaseBasedDeduplication dedup = new DatabaseBasedDeduplication();
        
        String[] messages = {"db-msg1", "db-msg2", "db-msg1", "db-msg3", "db-msg2"};
        
        for (String messageId : messages) {
            if (dedup.isDuplicate(messageId)) {
                System.out.println("Duplicate message detected: " + messageId);
            } else {
                System.out.println("Processing new message: " + messageId);
                // 处理消息逻辑
                processMessage(messageId);
                // 标记为已处理
                dedup.markAsProcessed(messageId);
            }
        }
        
        System.out.println();
    }
    
    private static void testRedisBasedDeduplication() {
        System.out.println("=== Testing Redis-Based Deduplication ===");
        
        RedisBasedDeduplication dedup = new RedisBasedDeduplication();
        
        String[] messages = {"redis-msg1", "redis-msg2", "redis-msg1", "redis-msg3"};
        
        for (String messageId : messages) {
            if (dedup.isDuplicate(messageId)) {
                System.out.println("Duplicate message detected: " + messageId);
            } else {
                System.out.println("Processing new message: " + messageId);
                // 处理消息逻辑
                processMessage(messageId);
                // 标记为已处理
                dedup.markAsProcessed(messageId);
            }
        }
        
        System.out.println();
    }
    
    private static void processMessage(String messageId) {
        // 模拟消息处理
        System.out.println("  -> Message processed: " + messageId);
    }
}
```

##### 4.2 幂等性消费者实现

```java
/**
 * 幂等性消费者实现
 */
public class IdempotentConsumerExample {
    
    private final KafkaConsumer<String, String> consumer;
    private final DatabaseBasedDeduplication deduplication;
    private final MessageProcessor messageProcessor;
    
    public IdempotentConsumerExample() {
        this.consumer = createConsumer();
        this.deduplication = new DatabaseBasedDeduplication();
        this.messageProcessor = new MessageProcessor();
    }
    
    private KafkaConsumer<String, String> createConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "idempotent-consumer-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 消费者配置
        props.put("enable.auto.commit", "false");  // 手动提交偏移量
        props.put("isolation.level", "read_committed");  // 只读已提交的消息
        props.put("max.poll.records", 100);        // 每次拉取100条消息
        
        return new KafkaConsumer<>(props);
    }
    
    public void consume() {
        consumer.subscribe(Arrays.asList("idempotent-topic"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    processRecordIdempotently(record);
                }
                
                // 批量提交偏移量
                if (!records.isEmpty()) {
                    consumer.commitSync();
                }
            }
        } catch (Exception e) {
            System.err.println("Consumer error: " + e.getMessage());
        } finally {
            consumer.close();
        }
    }
    
    private void processRecordIdempotently(ConsumerRecord<String, String> record) {
        // 生成消息唯一标识
        String messageId = generateMessageId(record);
        
        try {
            // 检查是否已处理过
            if (deduplication.isAlreadyProcessed(messageId)) {
                System.out.println("Skipping duplicate message: " + messageId);
                return;
            }
            
            // 开始事务处理
            deduplication.beginTransaction();
            
            try {
                // 处理消息
                messageProcessor.process(record);
                
                // 标记为已处理
                deduplication.markAsProcessed(messageId);
                
                // 提交事务
                deduplication.commitTransaction();
                
                System.out.println("Successfully processed message: " + messageId);
                
            } catch (Exception e) {
                // 回滚事务
                deduplication.rollbackTransaction();
                throw e;
            }
            
        } catch (Exception e) {
            System.err.println("Failed to process message " + messageId + ": " + e.getMessage());
            // 可以选择重试或发送到死信队列
        }
    }
    
    private String generateMessageId(ConsumerRecord<String, String> record) {
        // 使用topic、partition、offset生成唯一ID
        return String.format("%s-%d-%d", record.topic(), record.partition(), record.offset());
    }
    
    // 数据库去重实现
    private static class DatabaseBasedDeduplication {
        private final Set<String> processedMessages = ConcurrentHashMap.newKeySet();
        private boolean inTransaction = false;
        private String currentMessageId;
        
        public boolean isAlreadyProcessed(String messageId) {
            // 在实际应用中，这里应该查询数据库
            return processedMessages.contains(messageId);
        }
        
        public void beginTransaction() {
            inTransaction = true;
        }
        
        public void markAsProcessed(String messageId) {
            if (inTransaction) {
                currentMessageId = messageId;
            }
        }
        
        public void commitTransaction() {
            if (inTransaction && currentMessageId != null) {
                processedMessages.add(currentMessageId);
                inTransaction = false;
                currentMessageId = null;
            }
        }
        
        public void rollbackTransaction() {
            inTransaction = false;
            currentMessageId = null;
        }
    }
    
    // 消息处理器
    private static class MessageProcessor {
        public void process(ConsumerRecord<String, String> record) throws Exception {
            // 模拟消息处理逻辑
            System.out.printf("Processing message: Topic=%s, Partition=%d, Offset=%d, Value=%s%n",
                record.topic(), record.partition(), record.offset(), record.value());
            
            // 模拟处理时间
            Thread.sleep(10);
            
            // 模拟随机失败
            if (Math.random() < 0.1) {  // 10%概率失败
                throw new RuntimeException("Random processing failure");
            }
        }
    }
}
```

#### 5. Exactly-Once语义实现

##### 5.1 端到端Exactly-Once实现

```java
/**
 * 端到端Exactly-Once语义实现
 */
public class ExactlyOnceProcessor {
    
    private final KafkaConsumer<String, String> consumer;
    private final KafkaProducer<String, String> producer;
    private final String inputTopic;
    private final String outputTopic;
    
    public ExactlyOnceProcessor(String inputTopic, String outputTopic) {
        this.inputTopic = inputTopic;
        this.outputTopic = outputTopic;
        this.consumer = createConsumer();
        this.producer = createTransactionalProducer();
    }
    
    private KafkaConsumer<String, String> createConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "exactly-once-processor-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // Exactly-Once消费者配置
        props.put("enable.auto.commit", "false");
        props.put("isolation.level", "read_committed");
        
        return new KafkaConsumer<>(props);
    }
    
    private KafkaProducer<String, String> createTransactionalProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 事务生产者配置
        props.put("transactional.id", "exactly-once-processor-" + UUID.randomUUID());
        props.put("enable.idempotence", true);
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("max.in.flight.requests.per.connection", 5);
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        producer.initTransactions();
        
        return producer;
    }
    
    public void processExactlyOnce() {
        consumer.subscribe(Arrays.asList(inputTopic));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                if (!records.isEmpty()) {
                    processRecordsBatch(records);
                }
            }
        } catch (Exception e) {
            System.err.println("Exactly-once processing error: " + e.getMessage());
        } finally {
            consumer.close();
            producer.close();
        }
    }
    
    private void processRecordsBatch(ConsumerRecords<String, String> records) {
        try {
            // 开始事务
            producer.beginTransaction();
            
            // 处理每条消息并发送到输出主题
            for (ConsumerRecord<String, String> record : records) {
                // 处理消息
                String processedValue = processMessage(record.value());
                
                // 发送处理后的消息
                ProducerRecord<String, String> outputRecord = new ProducerRecord<>(
                    outputTopic, record.key(), processedValue);
                
                producer.send(outputRecord);
                
                System.out.printf("Processed and sent: %s -> %s%n", 
                    record.value(), processedValue);
            }
            
            // 将消费者偏移量作为事务的一部分提交
            Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
            for (ConsumerRecord<String, String> record : records) {
                TopicPartition tp = new TopicPartition(record.topic(), record.partition());
                offsets.put(tp, new OffsetAndMetadata(record.offset() + 1));
            }
            
            producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
            
            // 提交事务
            producer.commitTransaction();
            
            System.out.println("Batch processed successfully with exactly-once semantics");
            
        } catch (Exception e) {
            System.err.println("Batch processing failed: " + e.getMessage());
            // 回滚事务
            producer.abortTransaction();
        }
    }
    
    private String processMessage(String input) {
        // 模拟消息处理逻辑
        return "PROCESSED-" + input.toUpperCase();
    }
    
    public static void main(String[] args) {
        ExactlyOnceProcessor processor = new ExactlyOnceProcessor(
            "input-topic", "output-topic");
        
        processor.processExactlyOnce();
    }
}
```

##### 5.2 Kafka Streams的Exactly-Once

```java
/**
 * 使用Kafka Streams实现Exactly-Once处理
 */
public class ExactlyOnceStreamsExample {
    
    public static void main(String[] args) {
        // 创建Streams配置
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "exactly-once-streams-app");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        
        // 启用Exactly-Once语义
        props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);
        
        // 创建拓扑
        StreamsBuilder builder = new StreamsBuilder();
        
        // 简单的流处理
        KStream<String, String> inputStream = builder.stream("input-topic");
        
        KStream<String, String> processedStream = inputStream
            .filter((key, value) -> value != null && !value.isEmpty())
            .mapValues(value -> "PROCESSED-" + value.toUpperCase())
            .peek((key, value) -> System.out.println("Processed: " + key + " -> " + value));
        
        processedStream.to("output-topic");
        
        // 聚合处理示例
        KTable<String, Long> wordCounts = inputStream
            .flatMapValues(value -> Arrays.asList(value.toLowerCase().split("\\s+")))
            .groupBy((key, word) -> word)
            .count();
        
        wordCounts.toStream().to("word-count-topic", 
            Produced.with(Serdes.String(), Serdes.Long()));
        
        // 构建并启动流应用
        KafkaStreams streams = new KafkaStreams(builder.build(), props);
        
        // 添加关闭钩子
        Runtime.getRuntime().addShutdownHook(new Thread(streams::close));
        
        // 启动流处理
        streams.start();
        
        System.out.println("Exactly-Once Streams application started");
    }
}
```

## 实战案例

### 案例1：金融交易系统的Exactly-Once处理

```java
/**
 * 金融交易系统的Exactly-Once处理实现
 */
public class FinancialTransactionProcessor {
    
    private final KafkaConsumer<String, String> consumer;
    private final KafkaProducer<String, String> producer;
    private final TransactionDatabase database;
    
    public FinancialTransactionProcessor() {
        this.consumer = createConsumer();
        this.producer = createTransactionalProducer();
        this.database = new TransactionDatabase();
    }
    
    private KafkaConsumer<String, String> createConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "financial-transaction-processor");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 高可靠性配置
        props.put("enable.auto.commit", "false");
        props.put("isolation.level", "read_committed");
        props.put("max.poll.records", 10);  // 小批次处理
        
        return new KafkaConsumer<>(props);
    }
    
    private KafkaProducer<String, String> createTransactionalProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 事务配置
        props.put("transactional.id", "financial-txn-processor");
        props.put("enable.idempotence", true);
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        producer.initTransactions();
        
        return producer;
    }
    
    public void processTransactions() {
        consumer.subscribe(Arrays.asList("financial-transactions"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    processTransactionExactlyOnce(record);
                }
            }
        } catch (Exception e) {
            System.err.println("Transaction processing error: " + e.getMessage());
        } finally {
            consumer.close();
            producer.close();
        }
    }
    
    private void processTransactionExactlyOnce(ConsumerRecord<String, String> record) {
        String transactionId = record.key();
        String transactionData = record.value();
        
        try {
            // 开始Kafka事务
            producer.beginTransaction();
            
            // 开始数据库事务
            database.beginTransaction();
            
            try {
                // 检查交易是否已处理
                if (database.isTransactionProcessed(transactionId)) {
                    System.out.println("Transaction already processed: " + transactionId);
                    return;
                }
                
                // 处理交易
                TransactionResult result = processFinancialTransaction(transactionData);
                
                // 保存到数据库
                database.saveTransaction(transactionId, result);
                
                // 发送结果到下游系统
                ProducerRecord<String, String> resultRecord = new ProducerRecord<>(
                    "transaction-results", transactionId, result.toJson());
                producer.send(resultRecord);
                
                // 提交偏移量
                Map<TopicPartition, OffsetAndMetadata> offsets = Collections.singletonMap(
                    new TopicPartition(record.topic(), record.partition()),
                    new OffsetAndMetadata(record.offset() + 1)
                );
                producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
                
                // 提交所有事务
                database.commitTransaction();
                producer.commitTransaction();
                
                System.out.println("Transaction processed successfully: " + transactionId);
                
            } catch (Exception e) {
                // 回滚所有事务
                database.rollbackTransaction();
                producer.abortTransaction();
                throw e;
            }
            
        } catch (Exception e) {
            System.err.println("Failed to process transaction " + transactionId + ": " + e.getMessage());
        }
    }
    
    private TransactionResult processFinancialTransaction(String transactionData) {
        // 模拟金融交易处理
        System.out.println("Processing financial transaction: " + transactionData);
        
        // 模拟处理时间
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        // 返回处理结果
        return new TransactionResult("SUCCESS", "Transaction processed successfully");
    }
    
    // 交易结果类
    private static class TransactionResult {
        private final String status;
        private final String message;
        
        public TransactionResult(String status, String message) {
            this.status = status;
            this.message = message;
        }
        
        public String toJson() {
            return String.format("{\"status\":\"%s\",\"message\":\"%s\"}", status, message);
        }
    }
    
    // 模拟数据库操作
    private static class TransactionDatabase {
        private final Set<String> processedTransactions = ConcurrentHashMap.newKeySet();
        private boolean inTransaction = false;
        private final Set<String> pendingTransactions = new HashSet<>();
        
        public void beginTransaction() {
            inTransaction = true;
            pendingTransactions.clear();
        }
        
        public boolean isTransactionProcessed(String transactionId) {
            return processedTransactions.contains(transactionId);
        }
        
        public void saveTransaction(String transactionId, TransactionResult result) {
            if (inTransaction) {
                pendingTransactions.add(transactionId);
            }
        }
        
        public void commitTransaction() {
            if (inTransaction) {
                processedTransactions.addAll(pendingTransactions);
                inTransaction = false;
                pendingTransactions.clear();
            }
        }
        
        public void rollbackTransaction() {
            inTransaction = false;
            pendingTransactions.clear();
        }
    }
}
```

### 案例2：电商订单处理的幂等性保证

```java
/**
 * 电商订单处理的幂等性实现
 */
public class ECommerceOrderProcessor {
    
    private final KafkaConsumer<String, String> consumer;
    private final OrderService orderService;
    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    
    public ECommerceOrderProcessor() {
        this.consumer = createConsumer();
        this.orderService = new OrderService();
        this.inventoryService = new InventoryService();
        this.paymentService = new PaymentService();
    }
    
    private KafkaConsumer<String, String> createConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "ecommerce-order-processor");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        props.put("enable.auto.commit", "false");
        props.put("max.poll.records", 50);
        
        return new KafkaConsumer<>(props);
    }
    
    public void processOrders() {
        consumer.subscribe(Arrays.asList("order-events"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    processOrderIdempotently(record);
                }
                
                if (!records.isEmpty()) {
                    consumer.commitSync();
                }
            }
        } catch (Exception e) {
            System.err.println("Order processing error: " + e.getMessage());
        } finally {
            consumer.close();
        }
    }
    
    private void processOrderIdempotently(ConsumerRecord<String, String> record) {
        String orderId = record.key();
        String orderData = record.value();
        
        try {
            // 检查订单是否已处理
            if (orderService.isOrderProcessed(orderId)) {
                System.out.println("Order already processed: " + orderId);
                return;
            }
            
            // 开始分布式事务
            String transactionId = "txn-" + orderId + "-" + System.currentTimeMillis();
            
            orderService.beginTransaction(transactionId);
            inventoryService.beginTransaction(transactionId);
            paymentService.beginTransaction(transactionId);
            
            try {
                // 解析订单数据
                Order order = parseOrder(orderData);
                
                // 1. 创建订单
                orderService.createOrder(order);
                
                // 2. 扣减库存
                inventoryService.reserveInventory(order.getProductId(), order.getQuantity());
                
                // 3. 处理支付
                paymentService.processPayment(order.getCustomerId(), order.getAmount());
                
                // 提交所有事务
                orderService.commitTransaction(transactionId);
                inventoryService.commitTransaction(transactionId);
                paymentService.commitTransaction(transactionId);
                
                System.out.println("Order processed successfully: " + orderId);
                
            } catch (Exception e) {
                // 回滚所有事务
                orderService.rollbackTransaction(transactionId);
                inventoryService.rollbackTransaction(transactionId);
                paymentService.rollbackTransaction(transactionId);
                
                throw new RuntimeException("Order processing failed: " + e.getMessage(), e);
            }
            
        } catch (Exception e) {
            System.err.println("Failed to process order " + orderId + ": " + e.getMessage());
            // 可以发送到死信队列或重试队列
        }
    }
    
    private Order parseOrder(String orderData) {
        // 简单的订单解析
        String[] parts = orderData.split(",");
        return new Order(
            parts[0],  // orderId
            parts[1],  // customerId
            parts[2],  // productId
            Integer.parseInt(parts[3]),  // quantity
            Double.parseDouble(parts[4])  // amount
        );
    }
    
    // 订单类
    private static class Order {
        private final String orderId;
        private final String customerId;
        private final String productId;
        private final int quantity;
        private final double amount;
        
        public Order(String orderId, String customerId, String productId, int quantity, double amount) {
            this.orderId = orderId;
            this.customerId = customerId;
            this.productId = productId;
            this.quantity = quantity;
            this.amount = amount;
        }
        
        // Getters
        public String getOrderId() { return orderId; }
        public String getCustomerId() { return customerId; }
        public String getProductId() { return productId; }
        public int getQuantity() { return quantity; }
        public double getAmount() { return amount; }
    }
    
    // 订单服务
    private static class OrderService {
        private final Set<String> processedOrders = ConcurrentHashMap.newKeySet();
        private final Map<String, Set<String>> transactionOrders = new ConcurrentHashMap<>();
        
        public boolean isOrderProcessed(String orderId) {
            return processedOrders.contains(orderId);
        }
        
        public void beginTransaction(String transactionId) {
            transactionOrders.put(transactionId, new HashSet<>());
        }
        
        public void createOrder(Order order) {
            System.out.println("Creating order: " + order.getOrderId());
            // 模拟订单创建逻辑
        }
        
        public void commitTransaction(String transactionId) {
            Set<String> orders = transactionOrders.get(transactionId);
            if (orders != null) {
                processedOrders.addAll(orders);
                transactionOrders.remove(transactionId);
            }
        }
        
        public void rollbackTransaction(String transactionId) {
            transactionOrders.remove(transactionId);
        }
    }
    
    // 库存服务
    private static class InventoryService {
        private final Map<String, Integer> inventory = new ConcurrentHashMap<>();
        private final Map<String, Map<String, Integer>> transactionReservations = new ConcurrentHashMap<>();
        
        public InventoryService() {
            // 初始化库存
            inventory.put("product1", 1000);
            inventory.put("product2", 500);
        }
        
        public void beginTransaction(String transactionId) {
            transactionReservations.put(transactionId, new HashMap<>());
        }
        
        public void reserveInventory(String productId, int quantity) throws Exception {
            Integer currentStock = inventory.get(productId);
            if (currentStock == null || currentStock < quantity) {
                throw new Exception("Insufficient inventory for product: " + productId);
            }
            
            System.out.println("Reserving inventory: " + productId + ", quantity: " + quantity);
            // 模拟库存扣减
        }
        
        public void commitTransaction(String transactionId) {
            Map<String, Integer> reservations = transactionReservations.get(transactionId);
            if (reservations != null) {
                for (Map.Entry<String, Integer> entry : reservations.entrySet()) {
                    String productId = entry.getKey();
                    Integer quantity = entry.getValue();
                    inventory.put(productId, inventory.get(productId) - quantity);
                }
                transactionReservations.remove(transactionId);
            }
        }
        
        public void rollbackTransaction(String transactionId) {
            transactionReservations.remove(transactionId);
        }
    }
    
    // 支付服务
    private static class PaymentService {
        private final Map<String, Set<String>> transactionPayments = new ConcurrentHashMap<>();
        
        public void beginTransaction(String transactionId) {
            transactionPayments.put(transactionId, new HashSet<>());
        }
        
        public void processPayment(String customerId, double amount) throws Exception {
            System.out.println("Processing payment for customer: " + customerId + ", amount: " + amount);
            
            // 模拟支付处理
            if (Math.random() < 0.1) {  // 10%概率支付失败
                throw new Exception("Payment failed for customer: " + customerId);
            }
        }
        
        public void commitTransaction(String transactionId) {
            transactionPayments.remove(transactionId);
        }
        
        public void rollbackTransaction(String transactionId) {
            transactionPayments.remove(transactionId);
        }
    }
}
```

## 实战练习

### 练习1：实现消息去重机制

**任务**：实现一个基于Redis的消息去重机制

```java
// 请实现RedisDeduplicationService类
public class RedisDeduplicationService {
    // TODO: 实现基于Redis的消息去重逻辑
    // 1. 检查消息是否已处理
    // 2. 标记消息为已处理
    // 3. 设置合适的TTL
}
```

### 练习2：配置幂等性生产者

**任务**：配置一个具有最高可靠性的幂等性生产者

```java
// 请完善生产者配置
Properties props = new Properties();
// TODO: 添加必要的幂等性配置
// 要求：启用幂等性、最高可靠性、保证消息顺序
```

### 练习3：实现事务消息处理

**任务**：实现一个事务消息处理器，确保消息处理和数据库操作的原子性

```java
// 请实现TransactionalMessageProcessor类
public class TransactionalMessageProcessor {
    // TODO: 实现事务消息处理逻辑
    // 1. 开始Kafka事务
    // 2. 处理消息并更新数据库
    // 3. 提交或回滚事务
}
```

## 课后作业

### 作业1：设计消息确认策略

设计一个适合以下场景的消息确认策略：
- 金融支付系统
- 日志收集系统
- 实时推荐系统

分析每种场景下应该选择什么样的ACK级别，并说明原因。

### 作业2：实现端到端幂等性

实现一个完整的端到端幂等性处理系统，包括：
1. 幂等性生产者
2. 消息去重机制
3. 幂等性消费者
4. 数据库事务集成

### 作业3：性能测试和优化

对不同的消息确认配置进行性能测试：
1. 测试不同ACK级别的吞吐量和延迟
2. 测试幂等性对性能的影响
3. 测试事务消息的性能特征
4. 提出优化建议

## 课程总结

### 关键知识点回顾

1. **消息确认机制**
   - acks=0：最高性能，可能丢失数据
   - acks=1：平衡性能和可靠性
   - acks=all：最高可靠性，性能较低

2. **幂等性保证**
   - Producer ID和Sequence Number机制
   - 自动重复检测和去重
   - 配置要求：enable.idempotence=true

3. **事务消息**
   - 跨分区的原子性保证
   - 事务协调器的作用
   - 消费者偏移量的事务性提交

4. **Exactly-Once语义**
   - 端到端的精确一次处理
   - Kafka Streams的内置支持
   - 生产者和消费者的协同配置

5. **重复消费处理**
   - 消息去重策略
   - 幂等性消费者实现
   - 分布式事务集成

### 最佳实践总结

1. **选择合适的确认级别**
   - 根据业务需求平衡性能和可靠性
   - 关键业务使用acks=all
   - 日志类应用可使用acks=1

2. **启用幂等性**
   - 生产环境建议启用幂等性
   - 配合适当的重试策略
   - 注意性能影响

3. **实现消息去重**
   - 使用唯一消息ID
   - 选择合适的去重存储
   - 设置合理的TTL

4. **事务使用场景**
   - 需要跨分区原子性时使用
   - 注意事务超时配置
   - 监控事务性能

### 下节预告

下一节课我们将学习**Spring Boot与Kafka集成基础**，包括：
- Spring Kafka配置和使用
- 消息发送和接收
- 序列化和反序列化配置
- Spring Boot自动配置
- 集成测试方法