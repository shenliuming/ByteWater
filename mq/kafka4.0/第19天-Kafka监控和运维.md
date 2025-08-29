# 第19天：Kafka监控和运维

## 课程目标
- 掌握Kafka监控指标体系和监控工具
- 学会设计和实现告警机制
- 了解运维自动化的最佳实践
- 掌握常见故障的排查和处理方法

## 1. Kafka监控指标体系

### 1.1 核心监控指标

#### Broker级别指标
```java
@Component
public class KafkaBrokerMetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final AdminClient adminClient;
    
    public KafkaBrokerMetricsCollector(MeterRegistry meterRegistry, AdminClient adminClient) {
        this.meterRegistry = meterRegistry;
        this.adminClient = adminClient;
    }
    
    @Scheduled(fixedRate = 30000) // 每30秒收集一次
    public void collectBrokerMetrics() {
        try {
            // 收集集群元数据
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            Collection<Node> nodes = clusterResult.nodes().get();
            
            for (Node node : nodes) {
                collectNodeMetrics(node);
            }
            
            // 收集Topic指标
            collectTopicMetrics();
            
            // 收集Consumer Group指标
            collectConsumerGroupMetrics();
            
        } catch (Exception e) {
            log.error("Failed to collect broker metrics", e);
        }
    }
    
    private void collectNodeMetrics(Node node) {
        String brokerId = String.valueOf(node.id());
        
        // 模拟收集JMX指标
        Map<String, Double> jmxMetrics = collectJMXMetrics(node);
        
        // 记录关键指标
        meterRegistry.gauge("kafka.broker.bytes.in.rate", 
            Tags.of("broker", brokerId), 
            jmxMetrics.getOrDefault("BytesInPerSec", 0.0));
            
        meterRegistry.gauge("kafka.broker.bytes.out.rate", 
            Tags.of("broker", brokerId), 
            jmxMetrics.getOrDefault("BytesOutPerSec", 0.0));
            
        meterRegistry.gauge("kafka.broker.messages.in.rate", 
            Tags.of("broker", brokerId), 
            jmxMetrics.getOrDefault("MessagesInPerSec", 0.0));
            
        meterRegistry.gauge("kafka.broker.request.handler.avg.idle.percent", 
            Tags.of("broker", brokerId), 
            jmxMetrics.getOrDefault("RequestHandlerAvgIdlePercent", 0.0));
            
        meterRegistry.gauge("kafka.broker.network.processor.avg.idle.percent", 
            Tags.of("broker", brokerId), 
            jmxMetrics.getOrDefault("NetworkProcessorAvgIdlePercent", 0.0));
    }
    
    private void collectTopicMetrics() {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get();
            
            for (String topicName : topicNames) {
                // 收集Topic级别指标
                Map<String, Double> topicMetrics = collectTopicJMXMetrics(topicName);
                
                meterRegistry.gauge("kafka.topic.bytes.in.rate", 
                    Tags.of("topic", topicName), 
                    topicMetrics.getOrDefault("BytesInPerSec", 0.0));
                    
                meterRegistry.gauge("kafka.topic.bytes.out.rate", 
                    Tags.of("topic", topicName), 
                    topicMetrics.getOrDefault("BytesOutPerSec", 0.0));
                    
                meterRegistry.gauge("kafka.topic.messages.in.rate", 
                    Tags.of("topic", topicName), 
                    topicMetrics.getOrDefault("MessagesInPerSec", 0.0));
            }
        } catch (Exception e) {
            log.error("Failed to collect topic metrics", e);
        }
    }
    
    private void collectConsumerGroupMetrics() {
        try {
            ListConsumerGroupsResult groupsResult = adminClient.listConsumerGroups();
            Collection<ConsumerGroupListing> groups = groupsResult.all().get();
            
            for (ConsumerGroupListing group : groups) {
                String groupId = group.groupId();
                
                // 获取Consumer Group详细信息
                DescribeConsumerGroupsResult groupDetails = adminClient
                    .describeConsumerGroups(Collections.singleton(groupId));
                    
                ConsumerGroupDescription description = groupDetails.all().get().get(groupId);
                
                // 记录Consumer Group状态
                meterRegistry.gauge("kafka.consumer.group.members", 
                    Tags.of("group", groupId), 
                    description.members().size());
                    
                // 收集Lag信息
                collectConsumerLag(groupId);
            }
        } catch (Exception e) {
            log.error("Failed to collect consumer group metrics", e);
        }
    }
    
    private void collectConsumerLag(String groupId) {
        try {
            ListConsumerGroupOffsetsResult offsetsResult = adminClient
                .listConsumerGroupOffsets(groupId);
            Map<TopicPartition, OffsetAndMetadata> offsets = offsetsResult.partitionsToOffsetAndMetadata().get();
            
            // 获取最新偏移量
            Map<TopicPartition, OffsetSpec> latestOffsetSpecs = offsets.keySet().stream()
                .collect(Collectors.toMap(
                    tp -> tp,
                    tp -> OffsetSpec.latest()
                ));
                
            ListOffsetsResult latestOffsetsResult = adminClient.listOffsets(latestOffsetSpecs);
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = 
                latestOffsetsResult.all().get();
            
            // 计算Lag
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : offsets.entrySet()) {
                TopicPartition tp = entry.getKey();
                long consumerOffset = entry.getValue().offset();
                long latestOffset = latestOffsets.get(tp).offset();
                long lag = latestOffset - consumerOffset;
                
                meterRegistry.gauge("kafka.consumer.lag", 
                    Tags.of("group", groupId, "topic", tp.topic(), "partition", String.valueOf(tp.partition())), 
                    lag);
            }
        } catch (Exception e) {
            log.error("Failed to collect consumer lag for group: " + groupId, e);
        }
    }
    
    private Map<String, Double> collectJMXMetrics(Node node) {
        // 实际实现中需要通过JMX连接收集指标
        // 这里返回模拟数据
        Map<String, Double> metrics = new HashMap<>();
        metrics.put("BytesInPerSec", Math.random() * 1000000);
        metrics.put("BytesOutPerSec", Math.random() * 1000000);
        metrics.put("MessagesInPerSec", Math.random() * 10000);
        metrics.put("RequestHandlerAvgIdlePercent", Math.random() * 100);
        metrics.put("NetworkProcessorAvgIdlePercent", Math.random() * 100);
        return metrics;
    }
    
    private Map<String, Double> collectTopicJMXMetrics(String topicName) {
        // 实际实现中需要通过JMX连接收集Topic指标
        Map<String, Double> metrics = new HashMap<>();
        metrics.put("BytesInPerSec", Math.random() * 100000);
        metrics.put("BytesOutPerSec", Math.random() * 100000);
        metrics.put("MessagesInPerSec", Math.random() * 1000);
        return metrics;
    }
}
```

#### JMX指标收集器
```java
@Component
public class KafkaJMXMetricsCollector {
    
    private final MBeanServerConnection mBeanServerConnection;
    private final MeterRegistry meterRegistry;
    
    public KafkaJMXMetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.mBeanServerConnection = initJMXConnection();
    }
    
    private MBeanServerConnection initJMXConnection() {
        try {
            String jmxUrl = "service:jmx:rmi:///jndi/rmi://localhost:9999/jmxrmi";
            JMXServiceURL serviceURL = new JMXServiceURL(jmxUrl);
            JMXConnector connector = JMXConnectorFactory.connect(serviceURL);
            return connector.getMBeanServerConnection();
        } catch (Exception e) {
            log.error("Failed to initialize JMX connection", e);
            return null;
        }
    }
    
    @Scheduled(fixedRate = 15000) // 每15秒收集一次
    public void collectJMXMetrics() {
        if (mBeanServerConnection == null) {
            return;
        }
        
        try {
            // 收集Broker指标
            collectBrokerJMXMetrics();
            
            // 收集Producer指标
            collectProducerJMXMetrics();
            
            // 收集Consumer指标
            collectConsumerJMXMetrics();
            
        } catch (Exception e) {
            log.error("Failed to collect JMX metrics", e);
        }
    }
    
    private void collectBrokerJMXMetrics() throws Exception {
        // Broker网络指标
        ObjectName networkRequestMetrics = new ObjectName(
            "kafka.network:type=RequestMetrics,name=RequestsPerSec,request=*");
        Set<ObjectInstance> networkInstances = mBeanServerConnection.queryMBeans(networkRequestMetrics, null);
        
        for (ObjectInstance instance : networkInstances) {
            ObjectName objectName = instance.getObjectName();
            String requestType = objectName.getKeyProperty("request");
            
            Double rate = (Double) mBeanServerConnection.getAttribute(objectName, "OneMinuteRate");
            meterRegistry.gauge("kafka.network.request.rate", 
                Tags.of("request_type", requestType), rate);
        }
        
        // Broker日志指标
        ObjectName logSizeMetrics = new ObjectName(
            "kafka.log:type=Size,name=Size,topic=*,partition=*");
        Set<ObjectInstance> logInstances = mBeanServerConnection.queryMBeans(logSizeMetrics, null);
        
        for (ObjectInstance instance : logInstances) {
            ObjectName objectName = instance.getObjectName();
            String topic = objectName.getKeyProperty("topic");
            String partition = objectName.getKeyProperty("partition");
            
            Long size = (Long) mBeanServerConnection.getAttribute(objectName, "Value");
            meterRegistry.gauge("kafka.log.size", 
                Tags.of("topic", topic, "partition", partition), size);
        }
    }
    
    private void collectProducerJMXMetrics() throws Exception {
        // Producer指标
        ObjectName producerMetrics = new ObjectName(
            "kafka.producer:type=producer-metrics,client-id=*");
        Set<ObjectInstance> producerInstances = mBeanServerConnection.queryMBeans(producerMetrics, null);
        
        for (ObjectInstance instance : producerInstances) {
            ObjectName objectName = instance.getObjectName();
            String clientId = objectName.getKeyProperty("client-id");
            
            try {
                Double recordSendRate = (Double) mBeanServerConnection
                    .getAttribute(objectName, "record-send-rate");
                meterRegistry.gauge("kafka.producer.record.send.rate", 
                    Tags.of("client_id", clientId), recordSendRate);
                    
                Double batchSizeAvg = (Double) mBeanServerConnection
                    .getAttribute(objectName, "batch-size-avg");
                meterRegistry.gauge("kafka.producer.batch.size.avg", 
                    Tags.of("client_id", clientId), batchSizeAvg);
                    
            } catch (AttributeNotFoundException e) {
                // 某些属性可能不存在，忽略
            }
        }
    }
    
    private void collectConsumerJMXMetrics() throws Exception {
        // Consumer指标
        ObjectName consumerMetrics = new ObjectName(
            "kafka.consumer:type=consumer-metrics,client-id=*");
        Set<ObjectInstance> consumerInstances = mBeanServerConnection.queryMBeans(consumerMetrics, null);
        
        for (ObjectInstance instance : consumerInstances) {
            ObjectName objectName = instance.getObjectName();
            String clientId = objectName.getKeyProperty("client-id");
            
            try {
                Double recordsConsumedRate = (Double) mBeanServerConnection
                    .getAttribute(objectName, "records-consumed-rate");
                meterRegistry.gauge("kafka.consumer.records.consumed.rate", 
                    Tags.of("client_id", clientId), recordsConsumedRate);
                    
                Double fetchSizeAvg = (Double) mBeanServerConnection
                    .getAttribute(objectName, "fetch-size-avg");
                meterRegistry.gauge("kafka.consumer.fetch.size.avg", 
                    Tags.of("client_id", clientId), fetchSizeAvg);
                    
            } catch (AttributeNotFoundException e) {
                // 某些属性可能不存在，忽略
            }
        }
    }
}
```

### 1.2 自定义监控指标

#### 业务指标监控
```java
@Component
public class BusinessMetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // 消息处理计数器
    private final Counter messageProcessedCounter;
    private final Counter messageFailedCounter;
    
    // 消息处理时间分布
    private final Timer messageProcessingTimer;
    
    // 消息大小分布
    private final DistributionSummary messageSizeDistribution;
    
    public BusinessMetricsCollector(MeterRegistry meterRegistry, 
                                   KafkaTemplate<String, Object> kafkaTemplate) {
        this.meterRegistry = meterRegistry;
        this.kafkaTemplate = kafkaTemplate;
        
        this.messageProcessedCounter = Counter.builder("kafka.message.processed")
            .description("Total number of processed messages")
            .register(meterRegistry);
            
        this.messageFailedCounter = Counter.builder("kafka.message.failed")
            .description("Total number of failed messages")
            .register(meterRegistry);
            
        this.messageProcessingTimer = Timer.builder("kafka.message.processing.time")
            .description("Message processing time")
            .register(meterRegistry);
            
        this.messageSizeDistribution = DistributionSummary.builder("kafka.message.size")
            .description("Message size distribution")
            .baseUnit("bytes")
            .register(meterRegistry);
    }
    
    public void recordMessageProcessed(String topic, String consumerGroup) {
        messageProcessedCounter.increment(
            Tags.of("topic", topic, "consumer_group", consumerGroup)
        );
    }
    
    public void recordMessageFailed(String topic, String consumerGroup, String errorType) {
        messageFailedCounter.increment(
            Tags.of("topic", topic, "consumer_group", consumerGroup, "error_type", errorType)
        );
    }
    
    public Timer.Sample startMessageProcessingTimer() {
        return Timer.start(meterRegistry);
    }
    
    public void recordMessageProcessingTime(Timer.Sample sample, String topic, String consumerGroup) {
        sample.stop(Timer.builder("kafka.message.processing.time")
            .tags("topic", topic, "consumer_group", consumerGroup)
            .register(meterRegistry));
    }
    
    public void recordMessageSize(long sizeInBytes, String topic) {
        messageSizeDistribution.record(sizeInBytes, Tags.of("topic", topic));
    }
    
    // 自定义Gauge指标
    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        // 注册自定义Gauge
        Gauge.builder("kafka.active.connections")
            .description("Number of active Kafka connections")
            .register(meterRegistry, this, BusinessMetricsCollector::getActiveConnections);
            
        Gauge.builder("kafka.pending.messages")
            .description("Number of pending messages")
            .register(meterRegistry, this, BusinessMetricsCollector::getPendingMessages);
    }
    
    private double getActiveConnections(BusinessMetricsCollector collector) {
        // 实际实现中获取活跃连接数
        return Math.random() * 100;
    }
    
    private double getPendingMessages(BusinessMetricsCollector collector) {
        // 实际实现中获取待处理消息数
        return Math.random() * 1000;
    }
}
```

## 2. 告警机制设计

### 2.1 告警规则引擎

```java
@Component
public class KafkaAlertEngine {
    
    private final MeterRegistry meterRegistry;
    private final AlertNotificationService alertNotificationService;
    private final List<AlertRule> alertRules;
    
    public KafkaAlertEngine(MeterRegistry meterRegistry, 
                           AlertNotificationService alertNotificationService) {
        this.meterRegistry = meterRegistry;
        this.alertNotificationService = alertNotificationService;
        this.alertRules = initializeAlertRules();
    }
    
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void checkAlerts() {
        for (AlertRule rule : alertRules) {
            try {
                boolean triggered = evaluateRule(rule);
                if (triggered) {
                    handleAlert(rule);
                }
            } catch (Exception e) {
                log.error("Failed to evaluate alert rule: " + rule.getName(), e);
            }
        }
    }
    
    private List<AlertRule> initializeAlertRules() {
        List<AlertRule> rules = new ArrayList<>();
        
        // Broker离线告警
        rules.add(AlertRule.builder()
            .name("broker-offline")
            .description("Kafka Broker离线")
            .metricName("kafka.broker.online")
            .condition(AlertCondition.LESS_THAN)
            .threshold(1.0)
            .severity(AlertSeverity.CRITICAL)
            .duration(Duration.ofMinutes(2))
            .build());
            
        // Consumer Lag告警
        rules.add(AlertRule.builder()
            .name("consumer-lag-high")
            .description("Consumer Lag过高")
            .metricName("kafka.consumer.lag")
            .condition(AlertCondition.GREATER_THAN)
            .threshold(10000.0)
            .severity(AlertSeverity.WARNING)
            .duration(Duration.ofMinutes(5))
            .build());
            
        // 磁盘使用率告警
        rules.add(AlertRule.builder()
            .name("disk-usage-high")
            .description("磁盘使用率过高")
            .metricName("kafka.disk.usage.percent")
            .condition(AlertCondition.GREATER_THAN)
            .threshold(85.0)
            .severity(AlertSeverity.WARNING)
            .duration(Duration.ofMinutes(3))
            .build());
            
        // 消息处理失败率告警
        rules.add(AlertRule.builder()
            .name("message-failure-rate-high")
            .description("消息处理失败率过高")
            .metricName("kafka.message.failure.rate")
            .condition(AlertCondition.GREATER_THAN)
            .threshold(5.0)
            .severity(AlertSeverity.CRITICAL)
            .duration(Duration.ofMinutes(2))
            .build());
            
        return rules;
    }
    
    private boolean evaluateRule(AlertRule rule) {
        // 获取指标值
        Double currentValue = getCurrentMetricValue(rule.getMetricName(), rule.getTags());
        if (currentValue == null) {
            return false;
        }
        
        // 评估条件
        boolean conditionMet = false;
        switch (rule.getCondition()) {
            case GREATER_THAN:
                conditionMet = currentValue > rule.getThreshold();
                break;
            case LESS_THAN:
                conditionMet = currentValue < rule.getThreshold();
                break;
            case EQUALS:
                conditionMet = Math.abs(currentValue - rule.getThreshold()) < 0.001;
                break;
        }
        
        if (conditionMet) {
            // 检查持续时间
            return checkDuration(rule, currentValue);
        } else {
            // 重置状态
            resetRuleState(rule);
            return false;
        }
    }
    
    private Double getCurrentMetricValue(String metricName, Tags tags) {
        try {
            Meter meter = meterRegistry.find(metricName).tags(tags).meter();
            if (meter instanceof Gauge) {
                return ((Gauge) meter).value();
            } else if (meter instanceof Counter) {
                return ((Counter) meter).count();
            } else if (meter instanceof Timer) {
                return ((Timer) meter).mean(TimeUnit.MILLISECONDS);
            }
        } catch (Exception e) {
            log.warn("Failed to get metric value for: " + metricName, e);
        }
        return null;
    }
    
    private boolean checkDuration(AlertRule rule, Double currentValue) {
        String ruleKey = rule.getName();
        AlertState state = getOrCreateAlertState(ruleKey);
        
        if (state.getFirstTriggeredTime() == null) {
            state.setFirstTriggeredTime(Instant.now());
            state.setLastValue(currentValue);
            return false;
        }
        
        Duration elapsed = Duration.between(state.getFirstTriggeredTime(), Instant.now());
        if (elapsed.compareTo(rule.getDuration()) >= 0) {
            return true;
        }
        
        state.setLastValue(currentValue);
        return false;
    }
    
    private void resetRuleState(AlertRule rule) {
        String ruleKey = rule.getName();
        AlertState state = getOrCreateAlertState(ruleKey);
        state.reset();
    }
    
    private AlertState getOrCreateAlertState(String ruleKey) {
        // 实际实现中应该使用缓存或数据库存储状态
        return alertStates.computeIfAbsent(ruleKey, k -> new AlertState());
    }
    
    private final Map<String, AlertState> alertStates = new ConcurrentHashMap<>();
    
    private void handleAlert(AlertRule rule) {
        Alert alert = Alert.builder()
            .ruleName(rule.getName())
            .description(rule.getDescription())
            .severity(rule.getSeverity())
            .timestamp(Instant.now())
            .metricName(rule.getMetricName())
            .currentValue(getCurrentMetricValue(rule.getMetricName(), rule.getTags()))
            .threshold(rule.getThreshold())
            .build();
            
        alertNotificationService.sendAlert(alert);
        
        // 记录告警指标
        meterRegistry.counter("kafka.alerts.triggered", 
            "rule", rule.getName(), 
            "severity", rule.getSeverity().name())
            .increment();
    }
}
```

### 2.2 告警通知服务

```java
@Service
public class AlertNotificationService {
    
    private final List<AlertNotifier> notifiers;
    
    public AlertNotificationService(List<AlertNotifier> notifiers) {
        this.notifiers = notifiers;
    }
    
    public void sendAlert(Alert alert) {
        for (AlertNotifier notifier : notifiers) {
            try {
                if (notifier.shouldNotify(alert)) {
                    notifier.notify(alert);
                }
            } catch (Exception e) {
                log.error("Failed to send alert via notifier: " + notifier.getClass().getSimpleName(), e);
            }
        }
    }
}

// 邮件通知器
@Component
public class EmailAlertNotifier implements AlertNotifier {
    
    private final JavaMailSender mailSender;
    private final AlertNotificationConfig config;
    
    public EmailAlertNotifier(JavaMailSender mailSender, AlertNotificationConfig config) {
        this.mailSender = mailSender;
        this.config = config;
    }
    
    @Override
    public boolean shouldNotify(Alert alert) {
        // 根据告警级别决定是否发送邮件
        return alert.getSeverity() == AlertSeverity.CRITICAL || 
               alert.getSeverity() == AlertSeverity.WARNING;
    }
    
    @Override
    public void notify(Alert alert) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            
            helper.setTo(config.getEmailRecipients().toArray(new String[0]));
            helper.setSubject("[Kafka Alert] " + alert.getRuleName());
            helper.setText(buildEmailContent(alert), true);
            
            mailSender.send(message);
            log.info("Alert email sent for rule: " + alert.getRuleName());
            
        } catch (Exception e) {
            log.error("Failed to send alert email", e);
        }
    }
    
    private String buildEmailContent(Alert alert) {
        StringBuilder content = new StringBuilder();
        content.append("<html><body>");
        content.append("<h2>Kafka Alert Notification</h2>");
        content.append("<table border='1' cellpadding='5' cellspacing='0'>");
        content.append("<tr><td><b>Rule Name</b></td><td>").append(alert.getRuleName()).append("</td></tr>");
        content.append("<tr><td><b>Description</b></td><td>").append(alert.getDescription()).append("</td></tr>");
        content.append("<tr><td><b>Severity</b></td><td>").append(alert.getSeverity()).append("</td></tr>");
        content.append("<tr><td><b>Metric</b></td><td>").append(alert.getMetricName()).append("</td></tr>");
        content.append("<tr><td><b>Current Value</b></td><td>").append(alert.getCurrentValue()).append("</td></tr>");
        content.append("<tr><td><b>Threshold</b></td><td>").append(alert.getThreshold()).append("</td></tr>");
        content.append("<tr><td><b>Timestamp</b></td><td>").append(alert.getTimestamp()).append("</td></tr>");
        content.append("</table>");
        content.append("</body></html>");
        return content.toString();
    }
}

// 钉钉通知器
@Component
public class DingTalkAlertNotifier implements AlertNotifier {
    
    private final RestTemplate restTemplate;
    private final AlertNotificationConfig config;
    
    public DingTalkAlertNotifier(RestTemplate restTemplate, AlertNotificationConfig config) {
        this.restTemplate = restTemplate;
        this.config = config;
    }
    
    @Override
    public boolean shouldNotify(Alert alert) {
        return config.isDingTalkEnabled();
    }
    
    @Override
    public void notify(Alert alert) {
        try {
            String webhook = config.getDingTalkWebhook();
            if (webhook == null || webhook.isEmpty()) {
                return;
            }
            
            DingTalkMessage message = buildDingTalkMessage(alert);
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            HttpEntity<DingTalkMessage> request = new HttpEntity<>(message, headers);
            restTemplate.postForObject(webhook, request, String.class);
            
            log.info("DingTalk alert sent for rule: " + alert.getRuleName());
            
        } catch (Exception e) {
            log.error("Failed to send DingTalk alert", e);
        }
    }
    
    private DingTalkMessage buildDingTalkMessage(Alert alert) {
        StringBuilder content = new StringBuilder();
        content.append("## Kafka Alert Notification\n\n");
        content.append("**Rule Name:** ").append(alert.getRuleName()).append("\n\n");
        content.append("**Description:** ").append(alert.getDescription()).append("\n\n");
        content.append("**Severity:** ").append(alert.getSeverity()).append("\n\n");
        content.append("**Metric:** ").append(alert.getMetricName()).append("\n\n");
        content.append("**Current Value:** ").append(alert.getCurrentValue()).append("\n\n");
        content.append("**Threshold:** ").append(alert.getThreshold()).append("\n\n");
        content.append("**Timestamp:** ").append(alert.getTimestamp()).append("\n\n");
        
        DingTalkMessage message = new DingTalkMessage();
        message.setMsgtype("markdown");
        
        DingTalkMessage.Markdown markdown = new DingTalkMessage.Markdown();
        markdown.setTitle("Kafka Alert: " + alert.getRuleName());
        markdown.setText(content.toString());
        message.setMarkdown(markdown);
        
        return message;
    }
}
```

## 3. 运维自动化

### 3.1 自动化运维服务

```java
@Service
public class KafkaAutomationService {
    
    private final AdminClient adminClient;
    private final MeterRegistry meterRegistry;
    private final KafkaOperationsConfig operationsConfig;
    
    public KafkaAutomationService(AdminClient adminClient, 
                                 MeterRegistry meterRegistry,
                                 KafkaOperationsConfig operationsConfig) {
        this.adminClient = adminClient;
        this.meterRegistry = meterRegistry;
        this.operationsConfig = operationsConfig;
    }
    
    @Scheduled(fixedRate = 300000) // 每5分钟执行一次
    public void performAutomatedOperations() {
        try {
            // 自动清理过期Topic
            if (operationsConfig.isAutoCleanupEnabled()) {
                cleanupExpiredTopics();
            }
            
            // 自动调整分区数
            if (operationsConfig.isAutoPartitionAdjustmentEnabled()) {
                adjustPartitions();
            }
            
            // 自动重启失败的Consumer
            if (operationsConfig.isAutoConsumerRestartEnabled()) {
                restartFailedConsumers();
            }
            
        } catch (Exception e) {
            log.error("Failed to perform automated operations", e);
        }
    }
    
    private void cleanupExpiredTopics() {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get();
            
            List<String> topicsToDelete = new ArrayList<>();
            
            for (String topicName : topicNames) {
                if (shouldDeleteTopic(topicName)) {
                    topicsToDelete.add(topicName);
                }
            }
            
            if (!topicsToDelete.isEmpty()) {
                DeleteTopicsResult deleteResult = adminClient.deleteTopics(topicsToDelete);
                deleteResult.all().get();
                
                log.info("Automatically deleted expired topics: " + topicsToDelete);
                
                meterRegistry.counter("kafka.automation.topics.deleted")
                    .increment(topicsToDelete.size());
            }
            
        } catch (Exception e) {
            log.error("Failed to cleanup expired topics", e);
        }
    }
    
    private boolean shouldDeleteTopic(String topicName) {
        // 检查Topic是否符合删除条件
        // 1. 是否为临时Topic
        if (topicName.startsWith("temp-") || topicName.startsWith("test-")) {
            return isTopicInactive(topicName);
        }
        
        // 2. 检查Topic的最后活动时间
        return isTopicExpired(topicName);
    }
    
    private boolean isTopicInactive(String topicName) {
        // 检查Topic是否长时间无活动
        try {
            // 获取Topic的最新偏移量
            DescribeTopicsResult topicResult = adminClient.describeTopics(Collections.singleton(topicName));
            TopicDescription description = topicResult.all().get().get(topicName);
            
            Map<TopicPartition, OffsetSpec> offsetSpecs = description.partitions().stream()
                .collect(Collectors.toMap(
                    partition -> new TopicPartition(topicName, partition.partition()),
                    partition -> OffsetSpec.latest()
                ));
                
            ListOffsetsResult offsetsResult = adminClient.listOffsets(offsetSpecs);
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> offsets = offsetsResult.all().get();
            
            // 检查是否有消息
            return offsets.values().stream().allMatch(info -> info.offset() == 0);
            
        } catch (Exception e) {
            log.warn("Failed to check topic activity for: " + topicName, e);
            return false;
        }
    }
    
    private boolean isTopicExpired(String topicName) {
        // 实际实现中需要检查Topic的创建时间和最后活动时间
        // 这里返回模拟结果
        return false;
    }
    
    private void adjustPartitions() {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get();
            
            for (String topicName : topicNames) {
                if (shouldAdjustPartitions(topicName)) {
                    int newPartitionCount = calculateOptimalPartitionCount(topicName);
                    adjustTopicPartitions(topicName, newPartitionCount);
                }
            }
            
        } catch (Exception e) {
            log.error("Failed to adjust partitions", e);
        }
    }
    
    private boolean shouldAdjustPartitions(String topicName) {
        // 检查是否需要调整分区数
        try {
            DescribeTopicsResult topicResult = adminClient.describeTopics(Collections.singleton(topicName));
            TopicDescription description = topicResult.all().get().get(topicName);
            
            int currentPartitions = description.partitions().size();
            double throughput = getTopicThroughput(topicName);
            
            // 如果吞吐量过高且分区数较少，建议增加分区
            return throughput > 1000 && currentPartitions < 10;
            
        } catch (Exception e) {
            log.warn("Failed to check partition adjustment for: " + topicName, e);
            return false;
        }
    }
    
    private double getTopicThroughput(String topicName) {
        // 获取Topic的吞吐量指标
        Meter meter = meterRegistry.find("kafka.topic.messages.in.rate")
            .tag("topic", topicName)
            .meter();
            
        if (meter instanceof Gauge) {
            return ((Gauge) meter).value();
        }
        
        return 0.0;
    }
    
    private int calculateOptimalPartitionCount(String topicName) {
        double throughput = getTopicThroughput(topicName);
        
        // 简单的分区数计算逻辑
        if (throughput > 10000) {
            return 20;
        } else if (throughput > 5000) {
            return 15;
        } else if (throughput > 1000) {
            return 10;
        } else {
            return 5;
        }
    }
    
    private void adjustTopicPartitions(String topicName, int newPartitionCount) {
        try {
            Map<String, NewPartitions> partitionsToCreate = new HashMap<>();
            partitionsToCreate.put(topicName, NewPartitions.increaseTo(newPartitionCount));
            
            CreatePartitionsResult result = adminClient.createPartitions(partitionsToCreate);
            result.all().get();
            
            log.info("Automatically adjusted partitions for topic: {} to {}", topicName, newPartitionCount);
            
            meterRegistry.counter("kafka.automation.partitions.adjusted")
                .increment();
                
        } catch (Exception e) {
            log.error("Failed to adjust partitions for topic: " + topicName, e);
        }
    }
    
    private void restartFailedConsumers() {
        try {
            ListConsumerGroupsResult groupsResult = adminClient.listConsumerGroups();
            Collection<ConsumerGroupListing> groups = groupsResult.all().get();
            
            for (ConsumerGroupListing group : groups) {
                if (isConsumerGroupFailed(group.groupId())) {
                    restartConsumerGroup(group.groupId());
                }
            }
            
        } catch (Exception e) {
            log.error("Failed to restart failed consumers", e);
        }
    }
    
    private boolean isConsumerGroupFailed(String groupId) {
        try {
            DescribeConsumerGroupsResult groupResult = adminClient
                .describeConsumerGroups(Collections.singleton(groupId));
            ConsumerGroupDescription description = groupResult.all().get().get(groupId);
            
            // 检查Consumer Group状态
            return description.state() == ConsumerGroupState.DEAD || 
                   description.members().isEmpty();
                   
        } catch (Exception e) {
            log.warn("Failed to check consumer group status: " + groupId, e);
            return false;
        }
    }
    
    private void restartConsumerGroup(String groupId) {
        // 实际实现中需要重启Consumer应用
        // 这里只是记录日志和指标
        log.info("Attempting to restart consumer group: " + groupId);
        
        meterRegistry.counter("kafka.automation.consumers.restarted")
            .increment();
    }
}
```

### 3.2 健康检查服务

```java
@Component
public class KafkaHealthCheckService {
    
    private final AdminClient adminClient;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final MeterRegistry meterRegistry;
    
    public KafkaHealthCheckService(AdminClient adminClient, 
                                  KafkaTemplate<String, String> kafkaTemplate,
                                  MeterRegistry meterRegistry) {
        this.adminClient = adminClient;
        this.kafkaTemplate = kafkaTemplate;
        this.meterRegistry = meterRegistry;
    }
    
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void performHealthCheck() {
        HealthCheckResult result = new HealthCheckResult();
        
        try {
            // 检查集群连接
            checkClusterConnection(result);
            
            // 检查Broker状态
            checkBrokerStatus(result);
            
            // 检查Topic状态
            checkTopicStatus(result);
            
            // 检查Consumer Group状态
            checkConsumerGroupStatus(result);
            
            // 执行端到端测试
            performEndToEndTest(result);
            
            // 记录健康检查结果
            recordHealthCheckMetrics(result);
            
        } catch (Exception e) {
            log.error("Health check failed", e);
            result.setOverallHealth(HealthStatus.UNHEALTHY);
            result.addError("Health check execution failed: " + e.getMessage());
        }
        
        log.info("Health check completed: {}", result.getOverallHealth());
    }
    
    private void checkClusterConnection(HealthCheckResult result) {
        try {
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            String clusterId = clusterResult.clusterId().get(5, TimeUnit.SECONDS);
            
            if (clusterId != null && !clusterId.isEmpty()) {
                result.addCheck("cluster-connection", HealthStatus.HEALTHY, "Connected to cluster: " + clusterId);
            } else {
                result.addCheck("cluster-connection", HealthStatus.UNHEALTHY, "Failed to get cluster ID");
            }
            
        } catch (Exception e) {
            result.addCheck("cluster-connection", HealthStatus.UNHEALTHY, "Connection failed: " + e.getMessage());
        }
    }
    
    private void checkBrokerStatus(HealthCheckResult result) {
        try {
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            Collection<Node> nodes = clusterResult.nodes().get(5, TimeUnit.SECONDS);
            
            int totalBrokers = nodes.size();
            int healthyBrokers = 0;
            
            for (Node node : nodes) {
                if (isBrokerHealthy(node)) {
                    healthyBrokers++;
                }
            }
            
            if (healthyBrokers == totalBrokers) {
                result.addCheck("broker-status", HealthStatus.HEALTHY, 
                    String.format("All %d brokers are healthy", totalBrokers));
            } else {
                result.addCheck("broker-status", HealthStatus.DEGRADED, 
                    String.format("%d/%d brokers are healthy", healthyBrokers, totalBrokers));
            }
            
        } catch (Exception e) {
            result.addCheck("broker-status", HealthStatus.UNHEALTHY, "Failed to check broker status: " + e.getMessage());
        }
    }
    
    private boolean isBrokerHealthy(Node node) {
        // 实际实现中需要检查Broker的各项指标
        // 这里返回模拟结果
        return Math.random() > 0.1; // 90%的概率认为Broker健康
    }
    
    private void checkTopicStatus(HealthCheckResult result) {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get(5, TimeUnit.SECONDS);
            
            int totalTopics = topicNames.size();
            int healthyTopics = 0;
            
            for (String topicName : topicNames) {
                if (isTopicHealthy(topicName)) {
                    healthyTopics++;
                }
            }
            
            if (healthyTopics == totalTopics) {
                result.addCheck("topic-status", HealthStatus.HEALTHY, 
                    String.format("All %d topics are healthy", totalTopics));
            } else {
                result.addCheck("topic-status", HealthStatus.DEGRADED, 
                    String.format("%d/%d topics are healthy", healthyTopics, totalTopics));
            }
            
        } catch (Exception e) {
            result.addCheck("topic-status", HealthStatus.UNHEALTHY, "Failed to check topic status: " + e.getMessage());
        }
    }
    
    private boolean isTopicHealthy(String topicName) {
        try {
            DescribeTopicsResult topicResult = adminClient.describeTopics(Collections.singleton(topicName));
            TopicDescription description = topicResult.all().get(3, TimeUnit.SECONDS).get(topicName);
            
            // 检查是否有足够的副本
            for (TopicPartitionInfo partition : description.partitions()) {
                if (partition.replicas().size() < 2) {
                    return false;
                }
                if (partition.isr().size() < partition.replicas().size()) {
                    return false;
                }
            }
            
            return true;
            
        } catch (Exception e) {
            log.warn("Failed to check topic health: " + topicName, e);
            return false;
        }
    }
    
    private void checkConsumerGroupStatus(HealthCheckResult result) {
        try {
            ListConsumerGroupsResult groupsResult = adminClient.listConsumerGroups();
            Collection<ConsumerGroupListing> groups = groupsResult.all().get(5, TimeUnit.SECONDS);
            
            int totalGroups = groups.size();
            int healthyGroups = 0;
            
            for (ConsumerGroupListing group : groups) {
                if (isConsumerGroupHealthy(group.groupId())) {
                    healthyGroups++;
                }
            }
            
            if (healthyGroups == totalGroups) {
                result.addCheck("consumer-group-status", HealthStatus.HEALTHY, 
                    String.format("All %d consumer groups are healthy", totalGroups));
            } else {
                result.addCheck("consumer-group-status", HealthStatus.DEGRADED, 
                    String.format("%d/%d consumer groups are healthy", healthyGroups, totalGroups));
            }
            
        } catch (Exception e) {
            result.addCheck("consumer-group-status", HealthStatus.UNHEALTHY, 
                "Failed to check consumer group status: " + e.getMessage());
        }
    }
    
    private boolean isConsumerGroupHealthy(String groupId) {
        try {
            DescribeConsumerGroupsResult groupResult = adminClient
                .describeConsumerGroups(Collections.singleton(groupId));
            ConsumerGroupDescription description = groupResult.all().get(3, TimeUnit.SECONDS).get(groupId);
            
            // 检查Consumer Group状态
            return description.state() == ConsumerGroupState.STABLE && 
                   !description.members().isEmpty();
                   
        } catch (Exception e) {
            log.warn("Failed to check consumer group health: " + groupId, e);
            return false;
        }
    }
    
    private void performEndToEndTest(HealthCheckResult result) {
        String testTopic = "health-check-topic";
        String testMessage = "health-check-" + System.currentTimeMillis();
        
        try {
            // 发送测试消息
            ListenableFuture<SendResult<String, String>> future = 
                kafkaTemplate.send(testTopic, testMessage);
            SendResult<String, String> sendResult = future.get(5, TimeUnit.SECONDS);
            
            if (sendResult != null) {
                result.addCheck("end-to-end-test", HealthStatus.HEALTHY, 
                    "Successfully sent and received test message");
            } else {
                result.addCheck("end-to-end-test", HealthStatus.UNHEALTHY, 
                    "Failed to send test message");
            }
            
        } catch (Exception e) {
            result.addCheck("end-to-end-test", HealthStatus.UNHEALTHY, 
                "End-to-end test failed: " + e.getMessage());
        }
    }
    
    private void recordHealthCheckMetrics(HealthCheckResult result) {
        // 记录整体健康状态
        meterRegistry.gauge("kafka.health.overall", 
            result.getOverallHealth() == HealthStatus.HEALTHY ? 1.0 : 0.0);
            
        // 记录各项检查结果
        for (Map.Entry<String, HealthCheck> entry : result.getChecks().entrySet()) {
            String checkName = entry.getKey();
            HealthCheck check = entry.getValue();
            
            double value = 0.0;
            switch (check.getStatus()) {
                case HEALTHY:
                    value = 1.0;
                    break;
                case DEGRADED:
                    value = 0.5;
                    break;
                case UNHEALTHY:
                    value = 0.0;
                    break;
            }
            
            meterRegistry.gauge("kafka.health.check", 
                Tags.of("check", checkName), value);
        }
    }
}
```

## 4. 故障排查和处理

### 4.1 故障诊断服务

```java
@Service
public class KafkaTroubleshootingService {
    
    private final AdminClient adminClient;
    private final MeterRegistry meterRegistry;
    
    public KafkaTroubleshootingService(AdminClient adminClient, MeterRegistry meterRegistry) {
        this.adminClient = adminClient;
        this.meterRegistry = meterRegistry;
    }
    
    public TroubleshootingReport diagnoseCluster() {
        TroubleshootingReport report = new TroubleshootingReport();
        
        try {
            // 诊断集群连接问题
            diagnoseClusterConnectivity(report);
            
            // 诊断Broker问题
            diagnoseBrokerIssues(report);
            
            // 诊断Topic问题
            diagnoseTopicIssues(report);
            
            // 诊断Consumer问题
            diagnoseConsumerIssues(report);
            
            // 诊断性能问题
            diagnosePerformanceIssues(report);
            
        } catch (Exception e) {
            log.error("Failed to diagnose cluster", e);
            report.addIssue(IssueSeverity.CRITICAL, "Diagnosis failed", e.getMessage(), null);
        }
        
        return report;
    }
    
    private void diagnoseClusterConnectivity(TroubleshootingReport report) {
        try {
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            
            // 检查集群ID
            String clusterId = clusterResult.clusterId().get(10, TimeUnit.SECONDS);
            if (clusterId == null || clusterId.isEmpty()) {
                report.addIssue(IssueSeverity.CRITICAL, 
                    "Cluster connectivity", 
                    "Unable to retrieve cluster ID", 
                    "Check network connectivity and Kafka broker status");
                return;
            }
            
            // 检查Controller
            Node controller = clusterResult.controller().get(10, TimeUnit.SECONDS);
            if (controller == null) {
                report.addIssue(IssueSeverity.CRITICAL, 
                    "Controller availability", 
                    "No active controller found", 
                    "Check controller logs and ensure at least one broker is running");
            }
            
            // 检查节点数量
            Collection<Node> nodes = clusterResult.nodes().get(10, TimeUnit.SECONDS);
            if (nodes.size() < 3) {
                report.addIssue(IssueSeverity.WARNING, 
                    "Cluster size", 
                    "Cluster has fewer than 3 brokers (" + nodes.size() + ")", 
                    "Consider adding more brokers for better fault tolerance");
            }
            
        } catch (TimeoutException e) {
            report.addIssue(IssueSeverity.CRITICAL, 
                "Cluster connectivity", 
                "Timeout while connecting to cluster", 
                "Check network connectivity and broker availability");
        } catch (Exception e) {
            report.addIssue(IssueSeverity.CRITICAL, 
                "Cluster connectivity", 
                "Failed to connect to cluster: " + e.getMessage(), 
                "Check Kafka configuration and broker status");
        }
    }
    
    private void diagnoseBrokerIssues(TroubleshootingReport report) {
        try {
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            Collection<Node> nodes = clusterResult.nodes().get(10, TimeUnit.SECONDS);
            
            for (Node node : nodes) {
                diagnoseBrokerNode(node, report);
            }
            
        } catch (Exception e) {
            report.addIssue(IssueSeverity.HIGH, 
                "Broker diagnosis", 
                "Failed to diagnose brokers: " + e.getMessage(), 
                "Check broker logs and status");
        }
    }
    
    private void diagnoseBrokerNode(Node node, TroubleshootingReport report) {
        String brokerId = String.valueOf(node.id());
        
        // 检查Broker指标
        checkBrokerMetrics(node, report);
        
        // 检查Broker负载
        checkBrokerLoad(node, report);
        
        // 检查Broker磁盘使用
        checkBrokerDiskUsage(node, report);
    }
    
    private void checkBrokerMetrics(Node node, TroubleshootingReport report) {
        String brokerId = String.valueOf(node.id());
        
        try {
            // 检查请求处理器空闲率
            Meter idleMeter = meterRegistry.find("kafka.broker.request.handler.avg.idle.percent")
                .tag("broker", brokerId)
                .meter();
                
            if (idleMeter instanceof Gauge) {
                double idlePercent = ((Gauge) idleMeter).value();
                if (idlePercent < 10) {
                    report.addIssue(IssueSeverity.HIGH, 
                        "Broker overload", 
                        String.format("Broker %s request handler idle rate is low (%.2f%%)", brokerId, idlePercent), 
                        "Consider adding more brokers or optimizing client requests");
                }
            }
            
            // 检查网络处理器空闲率
            Meter networkIdleMeter = meterRegistry.find("kafka.broker.network.processor.avg.idle.percent")
                .tag("broker", brokerId)
                .meter();
                
            if (networkIdleMeter instanceof Gauge) {
                double networkIdlePercent = ((Gauge) networkIdleMeter).value();
                if (networkIdlePercent < 10) {
                    report.addIssue(IssueSeverity.HIGH, 
                        "Network overload", 
                        String.format("Broker %s network processor idle rate is low (%.2f%%)", brokerId, networkIdlePercent), 
                        "Check network configuration and consider tuning network threads");
                }
            }
            
        } catch (Exception e) {
            log.warn("Failed to check broker metrics for broker: " + brokerId, e);
        }
    }
    
    private void checkBrokerLoad(Node node, TroubleshootingReport report) {
        String brokerId = String.valueOf(node.id());
        
        try {
            // 检查消息吞吐量
            Meter throughputMeter = meterRegistry.find("kafka.broker.messages.in.rate")
                .tag("broker", brokerId)
                .meter();
                
            if (throughputMeter instanceof Gauge) {
                double throughput = ((Gauge) throughputMeter).value();
                if (throughput > 100000) {
                    report.addIssue(IssueSeverity.WARNING, 
                        "High throughput", 
                        String.format("Broker %s has high message throughput (%.0f msg/s)", brokerId, throughput), 
                        "Monitor broker performance and consider load balancing");
                }
            }
            
        } catch (Exception e) {
            log.warn("Failed to check broker load for broker: " + brokerId, e);
        }
    }
    
    private void checkBrokerDiskUsage(Node node, TroubleshootingReport report) {
        String brokerId = String.valueOf(node.id());
        
        try {
            // 检查磁盘使用率（模拟）
            double diskUsage = Math.random() * 100;
            
            if (diskUsage > 90) {
                report.addIssue(IssueSeverity.CRITICAL, 
                    "Disk space critical", 
                    String.format("Broker %s disk usage is critical (%.1f%%)", brokerId, diskUsage), 
                    "Clean up old log files or add more disk space");
            } else if (diskUsage > 80) {
                report.addIssue(IssueSeverity.WARNING, 
                    "Disk space warning", 
                    String.format("Broker %s disk usage is high (%.1f%%)", brokerId, diskUsage), 
                    "Monitor disk usage and plan for cleanup or expansion");
            }
            
        } catch (Exception e) {
            log.warn("Failed to check broker disk usage for broker: " + brokerId, e);
        }
    }
    
    private void diagnoseTopicIssues(TroubleshootingReport report) {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get(10, TimeUnit.SECONDS);
            
            for (String topicName : topicNames) {
                diagnoseTopicHealth(topicName, report);
            }
            
        } catch (Exception e) {
            report.addIssue(IssueSeverity.HIGH, 
                "Topic diagnosis", 
                "Failed to diagnose topics: " + e.getMessage(), 
                "Check topic configuration and broker status");
        }
    }
    
    private void diagnoseTopicHealth(String topicName, TroubleshootingReport report) {
        try {
            DescribeTopicsResult topicResult = adminClient.describeTopics(Collections.singleton(topicName));
            TopicDescription description = topicResult.all().get(5, TimeUnit.SECONDS).get(topicName);
            
            // 检查副本配置
            for (TopicPartitionInfo partition : description.partitions()) {
                int replicationFactor = partition.replicas().size();
                int inSyncReplicas = partition.isr().size();
                
                if (replicationFactor < 2) {
                    report.addIssue(IssueSeverity.HIGH, 
                        "Low replication factor", 
                        String.format("Topic %s partition %d has replication factor %d", 
                            topicName, partition.partition(), replicationFactor), 
                        "Increase replication factor for better fault tolerance");
                }
                
                if (inSyncReplicas < replicationFactor) {
                    report.addIssue(IssueSeverity.WARNING, 
                        "Out of sync replicas", 
                        String.format("Topic %s partition %d has %d out of %d replicas in sync", 
                            topicName, partition.partition(), inSyncReplicas, replicationFactor), 
                        "Check broker health and network connectivity");
                }
            }
            
        } catch (Exception e) {
            log.warn("Failed to diagnose topic: " + topicName, e);
        }
    }
    
    private void diagnoseConsumerIssues(TroubleshootingReport report) {
        try {
            ListConsumerGroupsResult groupsResult = adminClient.listConsumerGroups();
            Collection<ConsumerGroupListing> groups = groupsResult.all().get(10, TimeUnit.SECONDS);
            
            for (ConsumerGroupListing group : groups) {
                diagnoseConsumerGroup(group.groupId(), report);
            }
            
        } catch (Exception e) {
            report.addIssue(IssueSeverity.HIGH, 
                "Consumer diagnosis", 
                "Failed to diagnose consumer groups: " + e.getMessage(), 
                "Check consumer group status and configuration");
        }
    }
    
    private void diagnoseConsumerGroup(String groupId, TroubleshootingReport report) {
        try {
            // 检查Consumer Group状态
            DescribeConsumerGroupsResult groupResult = adminClient
                .describeConsumerGroups(Collections.singleton(groupId));
            ConsumerGroupDescription description = groupResult.all().get(5, TimeUnit.SECONDS).get(groupId);
            
            if (description.state() == ConsumerGroupState.DEAD) {
                report.addIssue(IssueSeverity.HIGH, 
                    "Dead consumer group", 
                    String.format("Consumer group %s is in DEAD state", groupId), 
                    "Restart consumer applications or clean up the consumer group");
            }
            
            if (description.members().isEmpty()) {
                report.addIssue(IssueSeverity.WARNING, 
                    "Empty consumer group", 
                    String.format("Consumer group %s has no active members", groupId), 
                    "Check if consumer applications are running");
            }
            
            // 检查Consumer Lag
            checkConsumerLag(groupId, report);
            
        } catch (Exception e) {
            log.warn("Failed to diagnose consumer group: " + groupId, e);
        }
    }
    
    private void checkConsumerLag(String groupId, TroubleshootingReport report) {
        try {
            ListConsumerGroupOffsetsResult offsetsResult = adminClient
                .listConsumerGroupOffsets(groupId);
            Map<TopicPartition, OffsetAndMetadata> offsets = offsetsResult.partitionsToOffsetAndMetadata().get(5, TimeUnit.SECONDS);
            
            if (offsets.isEmpty()) {
                return;
            }
            
            // 获取最新偏移量
            Map<TopicPartition, OffsetSpec> latestOffsetSpecs = offsets.keySet().stream()
                .collect(Collectors.toMap(
                    tp -> tp,
                    tp -> OffsetSpec.latest()
                ));
                
            ListOffsetsResult latestOffsetsResult = adminClient.listOffsets(latestOffsetSpecs);
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = 
                latestOffsetsResult.all().get(5, TimeUnit.SECONDS);
            
            // 检查Lag
            long totalLag = 0;
            long maxLag = 0;
            
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : offsets.entrySet()) {
                TopicPartition tp = entry.getKey();
                long consumerOffset = entry.getValue().offset();
                long latestOffset = latestOffsets.get(tp).offset();
                long lag = latestOffset - consumerOffset;
                
                totalLag += lag;
                maxLag = Math.max(maxLag, lag);
            }
            
            if (maxLag > 100000) {
                report.addIssue(IssueSeverity.CRITICAL, 
                    "High consumer lag", 
                    String.format("Consumer group %s has high lag (max: %d, total: %d)", groupId, maxLag, totalLag), 
                    "Scale up consumers or optimize message processing");
            } else if (maxLag > 10000) {
                report.addIssue(IssueSeverity.WARNING, 
                    "Moderate consumer lag", 
                    String.format("Consumer group %s has moderate lag (max: %d, total: %d)", groupId, maxLag, totalLag), 
                    "Monitor consumer performance and consider optimization");
            }
            
        } catch (Exception e) {
            log.warn("Failed to check consumer lag for group: " + groupId, e);
        }
    }
    
    private void diagnosePerformanceIssues(TroubleshootingReport report) {
        try {
            // 检查整体集群性能
            checkClusterPerformance(report);
            
            // 检查内存使用
            checkMemoryUsage(report);
            
            // 检查网络性能
            checkNetworkPerformance(report);
            
        } catch (Exception e) {
            report.addIssue(IssueSeverity.HIGH, 
                "Performance diagnosis", 
                "Failed to diagnose performance issues: " + e.getMessage(), 
                "Check system resources and Kafka configuration");
        }
    }
    
    private void checkClusterPerformance(TroubleshootingReport report) {
        try {
            // 检查整体吞吐量
            Meter throughputMeter = meterRegistry.find("kafka.broker.messages.in.rate").meter();
            if (throughputMeter instanceof Gauge) {
                double totalThroughput = ((Gauge) throughputMeter).value();
                if (totalThroughput < 1000) {
                    report.addIssue(IssueSeverity.WARNING, 
                        "Low cluster throughput", 
                        String.format("Cluster throughput is low (%.0f msg/s)", totalThroughput), 
                        "Check producer configuration and network connectivity");
                }
            }
            
        } catch (Exception e) {
            log.warn("Failed to check cluster performance", e);
        }
    }
    
    private void checkMemoryUsage(TroubleshootingReport report) {
        // 检查JVM内存使用（模拟）
        double memoryUsage = Math.random() * 100;
        
        if (memoryUsage > 90) {
            report.addIssue(IssueSeverity.CRITICAL, 
                "High memory usage", 
                String.format("JVM memory usage is critical (%.1f%%)", memoryUsage), 
                "Increase heap size or optimize memory usage");
        } else if (memoryUsage > 80) {
            report.addIssue(IssueSeverity.WARNING, 
                "High memory usage", 
                String.format("JVM memory usage is high (%.1f%%)", memoryUsage), 
                "Monitor memory usage and consider tuning");
        }
    }
    
    private void checkNetworkPerformance(TroubleshootingReport report) {
        // 检查网络延迟（模拟）
        double networkLatency = Math.random() * 100;
        
        if (networkLatency > 50) {
            report.addIssue(IssueSeverity.WARNING, 
                "High network latency", 
                String.format("Network latency is high (%.1f ms)", networkLatency), 
                "Check network configuration and connectivity");
        }
    }
}
```

### 4.2 故障恢复服务

```java
@Service
public class KafkaRecoveryService {
    
    private final AdminClient adminClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final MeterRegistry meterRegistry;
    
    public KafkaRecoveryService(AdminClient adminClient, 
                               KafkaTemplate<String, Object> kafkaTemplate,
                               MeterRegistry meterRegistry) {
        this.adminClient = adminClient;
        this.kafkaTemplate = kafkaTemplate;
        this.meterRegistry = meterRegistry;
    }
    
    public RecoveryResult performRecovery(TroubleshootingReport report) {
        RecoveryResult result = new RecoveryResult();
        
        try {
            // 自动修复可修复的问题
            for (Issue issue : report.getIssues()) {
                if (canAutoRecover(issue)) {
                    RecoveryAction action = performRecoveryAction(issue);
                    result.addAction(action);
                }
            }
            
        } catch (Exception e) {
            log.error("Failed to perform recovery", e);
            result.addError("Recovery failed: " + e.getMessage());
        }
        
        return result;
    }
    
    private boolean canAutoRecover(Issue issue) {
        // 定义可以自动恢复的问题类型
        switch (issue.getCategory()) {
            case "Dead consumer group":
            case "Empty consumer group":
            case "Out of sync replicas":
                return true;
            default:
                return false;
        }
    }
    
    private RecoveryAction performRecoveryAction(Issue issue) {
        RecoveryAction action = new RecoveryAction();
        action.setIssue(issue);
        action.setStartTime(Instant.now());
        
        try {
            switch (issue.getCategory()) {
                case "Dead consumer group":
                    action = recoverDeadConsumerGroup(issue, action);
                    break;
                case "Empty consumer group":
                    action = recoverEmptyConsumerGroup(issue, action);
                    break;
                case "Out of sync replicas":
                    action = recoverOutOfSyncReplicas(issue, action);
                    break;
                default:
                    action.setStatus(RecoveryStatus.NOT_SUPPORTED);
                    action.setMessage("Auto recovery not supported for this issue type");
            }
            
        } catch (Exception e) {
            action.setStatus(RecoveryStatus.FAILED);
            action.setMessage("Recovery failed: " + e.getMessage());
            log.error("Recovery action failed for issue: " + issue.getCategory(), e);
        }
        
        action.setEndTime(Instant.now());
        return action;
    }
    
    private RecoveryAction recoverDeadConsumerGroup(Issue issue, RecoveryAction action) {
        try {
            // 从问题描述中提取Consumer Group ID
            String groupId = extractGroupIdFromDescription(issue.getDescription());
            
            // 删除死掉的Consumer Group
            DeleteConsumerGroupsResult deleteResult = adminClient
                .deleteConsumerGroups(Collections.singleton(groupId));
            deleteResult.all().get(30, TimeUnit.SECONDS);
            
            action.setStatus(RecoveryStatus.SUCCESS);
            action.setMessage("Successfully deleted dead consumer group: " + groupId);
            
            meterRegistry.counter("kafka.recovery.consumer.group.deleted").increment();
            
        } catch (Exception e) {
            action.setStatus(RecoveryStatus.FAILED);
            action.setMessage("Failed to delete dead consumer group: " + e.getMessage());
        }
        
        return action;
    }
    
    private RecoveryAction recoverEmptyConsumerGroup(Issue issue, RecoveryAction action) {
        try {
            String groupId = extractGroupIdFromDescription(issue.getDescription());
            
            // 检查Consumer Group是否真的为空
            DescribeConsumerGroupsResult groupResult = adminClient
                .describeConsumerGroups(Collections.singleton(groupId));
            ConsumerGroupDescription description = groupResult.all().get(10, TimeUnit.SECONDS).get(groupId);
            
            if (description.members().isEmpty()) {
                // 发送通知给运维团队
                action.setStatus(RecoveryStatus.SUCCESS);
                action.setMessage("Notification sent to restart consumer group: " + groupId);
                
                // 这里可以集成自动重启逻辑
                notifyConsumerRestart(groupId);
            } else {
                action.setStatus(RecoveryStatus.NOT_NEEDED);
                action.setMessage("Consumer group is no longer empty: " + groupId);
            }
            
        } catch (Exception e) {
            action.setStatus(RecoveryStatus.FAILED);
            action.setMessage("Failed to recover empty consumer group: " + e.getMessage());
        }
        
        return action;
    }
    
    private RecoveryAction recoverOutOfSyncReplicas(Issue issue, RecoveryAction action) {
        try {
            // 触发副本同步（实际实现中需要更复杂的逻辑）
            action.setStatus(RecoveryStatus.SUCCESS);
            action.setMessage("Triggered replica synchronization");
            
            meterRegistry.counter("kafka.recovery.replica.sync.triggered").increment();
            
        } catch (Exception e) {
            action.setStatus(RecoveryStatus.FAILED);
            action.setMessage("Failed to trigger replica synchronization: " + e.getMessage());
        }
        
        return action;
    }
    
    private String extractGroupIdFromDescription(String description) {
        // 从描述中提取Consumer Group ID
        // 实际实现中需要更健壮的解析逻辑
        String[] parts = description.split(" ");
        for (int i = 0; i < parts.length - 1; i++) {
            if ("group".equals(parts[i])) {
                return parts[i + 1];
            }
        }
        return "unknown";
    }
    
    private void notifyConsumerRestart(String groupId) {
        // 发送重启通知
        log.info("Sending restart notification for consumer group: " + groupId);
        // 实际实现中可以集成消息队列或API调用
    }
}
```

## 5. 企业级监控运维平台实战案例

### 5.1 综合监控平台

```java
@RestController
@RequestMapping("/api/kafka/monitoring")
public class KafkaMonitoringController {
    
    private final KafkaBrokerMetricsCollector metricsCollector;
    private final KafkaAlertEngine alertEngine;
    private final KafkaTroubleshootingService troubleshootingService;
    private final KafkaRecoveryService recoveryService;
    private final KafkaHealthCheckService healthCheckService;
    
    public KafkaMonitoringController(KafkaBrokerMetricsCollector metricsCollector,
                                   KafkaAlertEngine alertEngine,
                                   KafkaTroubleshootingService troubleshootingService,
                                   KafkaRecoveryService recoveryService,
                                   KafkaHealthCheckService healthCheckService) {
        this.metricsCollector = metricsCollector;
        this.alertEngine = alertEngine;
        this.troubleshootingService = troubleshootingService;
        this.recoveryService = recoveryService;
        this.healthCheckService = healthCheckService;
    }
    
    @GetMapping("/dashboard")
    public ResponseEntity<MonitoringDashboard> getDashboard() {
        try {
            MonitoringDashboard dashboard = buildDashboard();
            return ResponseEntity.ok(dashboard);
        } catch (Exception e) {
            log.error("Failed to build monitoring dashboard", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/health")
    public ResponseEntity<HealthCheckResult> getHealthStatus() {
        try {
            // 触发健康检查
            healthCheckService.performHealthCheck();
            
            // 构建健康状态响应
            HealthCheckResult result = new HealthCheckResult();
            result.setOverallHealth(HealthStatus.HEALTHY); // 简化实现
            
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to get health status", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @PostMapping("/diagnose")
    public ResponseEntity<TroubleshootingReport> diagnoseCluster() {
        try {
            TroubleshootingReport report = troubleshootingService.diagnoseCluster();
            return ResponseEntity.ok(report);
        } catch (Exception e) {
            log.error("Failed to diagnose cluster", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @PostMapping("/recover")
    public ResponseEntity<RecoveryResult> performRecovery(@RequestBody TroubleshootingReport report) {
        try {
            RecoveryResult result = recoveryService.performRecovery(report);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to perform recovery", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/alerts")
    public ResponseEntity<List<Alert>> getActiveAlerts() {
        try {
            // 获取活跃告警列表
            List<Alert> alerts = getActiveAlertsList();
            return ResponseEntity.ok(alerts);
        } catch (Exception e) {
            log.error("Failed to get active alerts", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    private MonitoringDashboard buildDashboard() {
        MonitoringDashboard dashboard = new MonitoringDashboard();
        
        // 集群概览
        dashboard.setClusterOverview(buildClusterOverview());
        
        // Broker指标
        dashboard.setBrokerMetrics(buildBrokerMetrics());
        
        // Topic指标
        dashboard.setTopicMetrics(buildTopicMetrics());
        
        // Consumer指标
        dashboard.setConsumerMetrics(buildConsumerMetrics());
        
        // 告警统计
        dashboard.setAlertSummary(buildAlertSummary());
        
        return dashboard;
    }
    
    private ClusterOverview buildClusterOverview() {
        ClusterOverview overview = new ClusterOverview();
        overview.setTotalBrokers(3);
        overview.setHealthyBrokers(3);
        overview.setTotalTopics(25);
        overview.setTotalPartitions(150);
        overview.setTotalConsumerGroups(12);
        overview.setOverallHealth(HealthStatus.HEALTHY);
        return overview;
    }
    
    private List<BrokerMetric> buildBrokerMetrics() {
        List<BrokerMetric> metrics = new ArrayList<>();
        
        for (int i = 1; i <= 3; i++) {
            BrokerMetric metric = new BrokerMetric();
            metric.setBrokerId(i);
            metric.setMessagesInPerSec(Math.random() * 10000);
            metric.setBytesInPerSec(Math.random() * 1000000);
            metric.setBytesOutPerSec(Math.random() * 1000000);
            metric.setRequestHandlerIdlePercent(Math.random() * 100);
            metric.setNetworkProcessorIdlePercent(Math.random() * 100);
            metrics.add(metric);
        }
        
        return metrics;
    }
    
    private List<TopicMetric> buildTopicMetrics() {
        List<TopicMetric> metrics = new ArrayList<>();
        
        String[] topics = {"user-events", "order-events", "payment-events", "notification-events"};
        for (String topic : topics) {
            TopicMetric metric = new TopicMetric();
            metric.setTopicName(topic);
            metric.setPartitionCount((int)(Math.random() * 10) + 1);
            metric.setReplicationFactor(3);
            metric.setMessagesInPerSec(Math.random() * 5000);
            metric.setBytesInPerSec(Math.random() * 500000);
            metrics.add(metric);
        }
        
        return metrics;
    }
    
    private List<ConsumerMetric> buildConsumerMetrics() {
        List<ConsumerMetric> metrics = new ArrayList<>();
        
        String[] groups = {"user-service", "order-service", "payment-service", "notification-service"};
        for (String group : groups) {
            ConsumerMetric metric = new ConsumerMetric();
            metric.setGroupId(group);
            metric.setMemberCount((int)(Math.random() * 5) + 1);
            metric.setTotalLag((long)(Math.random() * 10000));
            metric.setMaxLag((long)(Math.random() * 5000));
            metric.setState(ConsumerGroupState.STABLE);
            metrics.add(metric);
        }
        
        return metrics;
    }
    
    private AlertSummary buildAlertSummary() {
        AlertSummary summary = new AlertSummary();
        summary.setCriticalAlerts((int)(Math.random() * 3));
        summary.setWarningAlerts((int)(Math.random() * 10));
        summary.setInfoAlerts((int)(Math.random() * 20));
        summary.setTotalAlerts(summary.getCriticalAlerts() + summary.getWarningAlerts() + summary.getInfoAlerts());
        return summary;
    }
    
    private List<Alert> getActiveAlertsList() {
        // 实际实现中从告警存储中获取
        return new ArrayList<>();
    }
}
```

## 6. 实战练习

### 练习1：监控指标收集
**任务**：实现一个自定义的Kafka监控指标收集器

**要求**：
1. 收集Broker、Topic、Consumer Group的关键指标
2. 支持JMX和Admin API两种方式
3. 将指标暴露给Prometheus
4. 实现指标的历史数据存储

### 练习2：告警规则配置
**任务**：设计和实现灵活的告警规则引擎

**要求**：
1. 支持多种告警条件（阈值、趋势、异常检测）
2. 支持告警抑制和聚合
3. 实现多种通知方式（邮件、短信、钉钉、Slack）
4. 支持告警规则的动态配置

### 练习3：自动化运维
**任务**：开发Kafka集群自动化运维工具

**要求**：
1. 自动扩容和缩容
2. 自动故障恢复
3. 自动性能优化
4. 自动备份和恢复

## 7. 课后作业

### 作业1：企业级监控平台
开发一个完整的Kafka监控平台，包括：
- Web控制台界面
- 实时监控大屏
- 告警管理系统
- 运维操作界面
- 报表和分析功能

### 作业2：智能运维系统
设计并实现一个智能化的Kafka运维系统：
- 基于机器学习的异常检测
- 智能告警降噪
- 自动根因分析
- 预测性维护

### 作业3：多集群管理
实现一个多Kafka集群的统一管理平台：
- 支持多个Kafka集群的统一监控
- 跨集群的数据同步和迁移
- 集群间的负载均衡
- 统一的用户权限管理

## 8. 课程总结

### 8.1 关键知识点回顾

1. **监控指标体系**
   - Broker级别指标：吞吐量、延迟、资源使用率
   - Topic级别指标：消息速率、分区状态、副本健康
   - Consumer级别指标：消费延迟、消费速率、重平衡

2. **告警机制设计**
   - 告警规则引擎：条件评估、持续时间检查
   - 多渠道通知：邮件、短信、即时通讯工具
   - 告警抑制和聚合：避免告警风暴

3. **运维自动化**
   - 自动化运维任务：清理、扩容、重启
   - 健康检查：端到端测试、状态监控
   - 故障恢复：自动诊断和修复

4. **故障排查**
   - 系统化诊断：集群、Broker、Topic、Consumer
   - 根因分析：性能瓶颈、配置问题、资源不足
   - 恢复策略：自动修复、手动干预、预防措施

### 8.2 最佳实践总结

1. **监控策略**
   - 建立分层监控体系
   - 设置合理的告警阈值
   - 实现监控数据的长期存储

2. **运维流程**
   - 制定标准化运维流程
   - 建立应急响应机制
   - 定期进行故障演练

3. **工具选择**
   - 选择合适的监控工具栈
   - 集成现有的运维平台
   - 考虑工具的可扩展性

通过本节课的学习，你已经掌握了Kafka监控和运维的核心技术和最佳实践。在下一节课中，我们将学习Kafka的安全机制，包括认证、授权、加密等安全特性。