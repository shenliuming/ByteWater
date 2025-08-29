# 第9天：Kafka日志压缩和消息顺序

## 学习目标
- 深入理解Kafka的日志压缩机制和策略
- 掌握消息去重和顺序保证机制
- 学会配置和优化日志压缩参数
- 了解时间戳处理和消息版本控制
- 掌握压缩日志的监控和故障排查

## 课程内容

### 上午内容

#### 1. Kafka日志压缩概述

##### 1.1 日志压缩原理
```
压缩前的日志：
┌─────────────────────────────────────────────────────────────┐
│ Offset │  Key  │     Value     │  Timestamp  │   Headers   │
├─────────────────────────────────────────────────────────────┤
│   0    │ user1 │   {age: 25}   │ 1640000000  │     {}      │
│   1    │ user2 │   {age: 30}   │ 1640000010  │     {}      │
│   2    │ user1 │   {age: 26}   │ 1640000020  │     {}      │  ← 更新
│   3    │ user3 │   {age: 35}   │ 1640000030  │     {}      │
│   4    │ user2 │   {age: 31}   │ 1640000040  │     {}      │  ← 更新
│   5    │ user1 │     null      │ 1640000050  │     {}      │  ← 删除
└─────────────────────────────────────────────────────────────┘

压缩后的日志：
┌─────────────────────────────────────────────────────────────┐
│ Offset │  Key  │     Value     │  Timestamp  │   Headers   │
├─────────────────────────────────────────────────────────────┤
│   4    │ user2 │   {age: 31}   │ 1640000040  │     {}      │  ← 保留最新
│   3    │ user3 │   {age: 35}   │ 1640000030  │     {}      │  ← 保留唯一
│   5    │ user1 │     null      │ 1640000050  │     {}      │  ← 保留删除标记
└─────────────────────────────────────────────────────────────┘
```

**压缩策略类型**：
- **delete**: 基于时间或大小删除旧数据
- **compact**: 基于Key保留最新值
- **compact,delete**: 组合策略

##### 1.2 压缩触发条件

```properties
# Topic级别配置
cleanup.policy=compact
min.cleanable.dirty.ratio=0.5
segment.ms=604800000  # 7天
min.compaction.lag.ms=0
max.compaction.lag.ms=9223372036854775807
delete.retention.ms=86400000  # 1天
```

**压缩触发机制**：
```
1. 脏数据比例达到阈值 (min.cleanable.dirty.ratio)
   ↓
2. 段文件达到最小压缩延迟 (min.compaction.lag.ms)
   ↓
3. 压缩线程开始工作
   ↓
4. 创建压缩后的新段文件
   ↓
5. 删除旧段文件
```

#### 2. 日志压缩配置

##### 2.1 Broker级别配置

```properties
# server.properties

# 压缩线程配置
log.cleaner.threads=2
log.cleaner.io.max.bytes.per.second=1.7976931348623157E308
log.cleaner.dedupe.buffer.size=134217728  # 128MB
log.cleaner.io.buffer.size=524288  # 512KB

# 压缩策略配置
log.cleanup.policy=delete
log.cleaner.min.cleanable.ratio=0.5
log.cleaner.min.compaction.lag.ms=0
log.cleaner.max.compaction.lag.ms=9223372036854775807

# 删除保留配置
log.cleaner.delete.retention.ms=86400000
log.segment.delete.delay.ms=60000
```

##### 2.2 Topic级别配置

```bash
# 创建压缩Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic user-profiles \
  --partitions 6 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.3 \
  --config segment.ms=86400000 \
  --config min.compaction.lag.ms=60000

# 修改现有Topic配置
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name user-profiles \
  --add-config cleanup.policy=compact,delete

# 查看Topic配置
kafka-configs.sh --describe \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name user-profiles
```

##### 2.3 压缩参数优化

```bash
#!/bin/bash
# compaction_tuning.sh

TOPIC="user-profiles"
BOOTSTRAP_SERVER="localhost:9092"

echo "=== Compaction Configuration Tuning ==="

# 高频更新场景配置
echo "Configuring for high-frequency updates..."
kafka-configs.sh --alter \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --entity-type topics \
  --entity-name $TOPIC \
  --add-config "
    cleanup.policy=compact,
    min.cleanable.dirty.ratio=0.2,
    min.compaction.lag.ms=30000,
    max.compaction.lag.ms=300000,
    segment.ms=3600000
  "

# 低频更新场景配置
echo "Configuring for low-frequency updates..."
kafka-configs.sh --alter \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --entity-type topics \
  --entity-name $TOPIC \
  --add-config "
    cleanup.policy=compact,
    min.cleanable.dirty.ratio=0.7,
    min.compaction.lag.ms=3600000,
    max.compaction.lag.ms=86400000,
    segment.ms=86400000
  "

# 查看配置结果
echo "Current configuration:"
kafka-configs.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --entity-type topics \
  --entity-name $TOPIC
```

#### 3. 消息去重机制

##### 3.1 基于Key的去重

```java
/**
 * 用户档案管理系统
 * 使用压缩Topic实现用户信息的最终一致性
 */
public class UserProfileManager {
    
    private final KafkaProducer<String, String> producer;
    private final String topic = "user-profiles";
    
    public UserProfileManager() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 确保消息顺序和幂等性
        props.put("acks", "all");
        props.put("enable.idempotence", true);
        props.put("max.in.flight.requests.per.connection", 1);
        
        this.producer = new KafkaProducer<>(props);
    }
    
    // 更新用户档案
    public void updateUserProfile(String userId, UserProfile profile) {
        String profileJson = JsonUtils.toJson(profile);
        
        ProducerRecord<String, String> record = new ProducerRecord<>(
            topic, 
            userId,  // Key用于分区和压缩
            profileJson
        );
        
        // 添加时间戳头信息
        record.headers().add("update_time", 
            String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                System.err.println("Failed to update profile for user: " + userId);
                exception.printStackTrace();
            } else {
                System.out.println("Profile updated for user: " + userId + 
                    ", partition: " + metadata.partition() + 
                    ", offset: " + metadata.offset());
            }
        });
    }
    
    // 删除用户档案（发送null值）
    public void deleteUserProfile(String userId) {
        ProducerRecord<String, String> record = new ProducerRecord<>(
            topic, 
            userId, 
            null  // null值表示删除
        );
        
        record.headers().add("delete_time", 
            String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(record);
    }
}
```

##### 3.2 自定义去重逻辑

```java
/**
 * 基于业务逻辑的消息去重
 */
public class DeduplicationConsumer {
    
    private final Set<String> processedMessages = new ConcurrentHashMap<>().keySet(ConcurrentHashMap.newKeySet());
    private final KafkaConsumer<String, String> consumer;
    
    public DeduplicationConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "dedup-consumer-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");
        
        this.consumer = new KafkaConsumer<>(props);
    }
    
    public void consumeWithDeduplication() {
        consumer.subscribe(Arrays.asList("user-events"));
        
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                // 生成消息唯一标识
                String messageId = generateMessageId(record);
                
                // 检查是否已处理
                if (!processedMessages.contains(messageId)) {
                    processMessage(record);
                    processedMessages.add(messageId);
                    
                    // 定期清理已处理消息集合
                    if (processedMessages.size() > 10000) {
                        cleanupProcessedMessages();
                    }
                }
            }
            
            consumer.commitSync();
        }
    }
    
    private String generateMessageId(ConsumerRecord<String, String> record) {
        // 基于Key、Value和时间戳生成唯一ID
        return record.key() + ":" + record.value().hashCode() + ":" + record.timestamp();
    }
    
    private void processMessage(ConsumerRecord<String, String> record) {
        System.out.println("Processing unique message: " + record.key() + " -> " + record.value());
        // 业务处理逻辑
    }
    
    private void cleanupProcessedMessages() {
        // 保留最近的5000条记录
        if (processedMessages.size() > 5000) {
            processedMessages.clear();
        }
    }
}
```

### 下午内容

#### 4. 消息顺序保证

##### 4.1 分区级别顺序

```java
/**
 * 订单处理系统 - 保证单个订单的消息顺序
 */
public class OrderEventProducer {
    
    private final KafkaProducer<String, String> producer;
    private final String topic = "order-events";
    
    public OrderEventProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 保证消息顺序的关键配置
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("max.in.flight.requests.per.connection", 1);  // 关键：保证顺序
        props.put("enable.idempotence", true);
        
        this.producer = new KafkaProducer<>(props);
    }
    
    // 发送订单事件，使用订单ID作为Key确保同一订单的消息在同一分区
    public void sendOrderEvent(String orderId, OrderEvent event) {
        ProducerRecord<String, String> record = new ProducerRecord<>(
            topic,
            orderId,  // 使用订单ID作为Key
            JsonUtils.toJson(event)
        );
        
        // 添加序列号确保顺序
        record.headers().add("sequence", String.valueOf(event.getSequence()).getBytes());
        record.headers().add("event_time", String.valueOf(event.getTimestamp()).getBytes());
        
        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                System.err.println("Failed to send order event: " + orderId);
                exception.printStackTrace();
            } else {
                System.out.println("Order event sent: " + orderId + 
                    ", partition: " + metadata.partition() + 
                    ", offset: " + metadata.offset());
            }
        });
    }
}

/**
 * 订单事件消费者 - 验证消息顺序
 */
public class OrderEventConsumer {
    
    private final KafkaConsumer<String, String> consumer;
    private final Map<String, Long> lastSequenceMap = new ConcurrentHashMap<>();
    
    public OrderEventConsumer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "order-consumer-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");
        
        this.consumer = new KafkaConsumer<>(props);
    }
    
    public void consumeOrderEvents() {
        consumer.subscribe(Arrays.asList("order-events"));
        
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                String orderId = record.key();
                OrderEvent event = JsonUtils.fromJson(record.value(), OrderEvent.class);
                
                // 验证消息顺序
                if (validateSequence(orderId, event.getSequence())) {
                    processOrderEvent(orderId, event);
                } else {
                    System.err.println("Out of order message detected for order: " + orderId);
                    // 处理乱序消息的逻辑
                    handleOutOfOrderMessage(orderId, event);
                }
            }
            
            consumer.commitSync();
        }
    }
    
    private boolean validateSequence(String orderId, long sequence) {
        Long lastSequence = lastSequenceMap.get(orderId);
        if (lastSequence == null || sequence == lastSequence + 1) {
            lastSequenceMap.put(orderId, sequence);
            return true;
        }
        return false;
    }
    
    private void processOrderEvent(String orderId, OrderEvent event) {
        System.out.println("Processing order event: " + orderId + 
            ", sequence: " + event.getSequence() + 
            ", type: " + event.getType());
        // 业务处理逻辑
    }
    
    private void handleOutOfOrderMessage(String orderId, OrderEvent event) {
        // 可以选择丢弃、重新排序或者记录错误
        System.err.println("Handling out of order message for order: " + orderId);
    }
}
```

##### 4.2 自定义分区器

```java
/**
 * 自定义分区器 - 确保相关消息在同一分区
 */
public class OrderPartitioner implements Partitioner {
    
    @Override
    public int partition(String topic, Object key, byte[] keyBytes, 
                        Object value, byte[] valueBytes, Cluster cluster) {
        
        if (key == null) {
            // 如果没有Key，使用轮询分区
            return ThreadLocalRandom.current().nextInt(cluster.partitionCountForTopic(topic));
        }
        
        String keyStr = key.toString();
        
        // 提取订单ID的前缀作为分区依据
        if (keyStr.startsWith("ORDER_")) {
            String orderPrefix = keyStr.substring(6, 8);  // 取订单号的前两位
            return Math.abs(orderPrefix.hashCode()) % cluster.partitionCountForTopic(topic);
        }
        
        // 默认基于Key的哈希分区
        return Math.abs(keyStr.hashCode()) % cluster.partitionCountForTopic(topic);
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

// 使用自定义分区器
Properties props = new Properties();
props.put("partitioner.class", "com.example.OrderPartitioner");
```

#### 5. 时间戳处理

##### 5.1 时间戳类型配置

```bash
# 创建使用LogAppendTime的Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic timestamped-events \
  --partitions 3 \
  --replication-factor 2 \
  --config message.timestamp.type=LogAppendTime

# 查看时间戳配置
kafka-configs.sh --describe \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name timestamped-events
```

##### 5.2 时间戳处理示例

```java
/**
 * 时间戳处理示例
 */
public class TimestampProcessor {
    
    public void processMessagesWithTimestamp() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "timestamp-consumer");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("timestamped-events"));
        
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                // 获取不同类型的时间戳
                long kafkaTimestamp = record.timestamp();
                TimestampType timestampType = record.timestampType();
                
                // 从消息头获取业务时间戳
                String businessTimestamp = null;
                for (Header header : record.headers()) {
                    if ("business_time".equals(header.key())) {
                        businessTimestamp = new String(header.value());
                        break;
                    }
                }
                
                // 计算消息延迟
                long currentTime = System.currentTimeMillis();
                long messageDelay = currentTime - kafkaTimestamp;
                
                System.out.println(String.format(
                    "Message: %s, Kafka Timestamp: %d (%s), Business Timestamp: %s, Delay: %d ms",
                    record.value(),
                    kafkaTimestamp,
                    timestampType,
                    businessTimestamp,
                    messageDelay
                ));
                
                // 基于时间戳的业务逻辑
                if (messageDelay > 5000) {  // 5秒延迟告警
                    System.err.println("High latency message detected: " + messageDelay + "ms");
                }
            }
        }
    }
}
```

#### 6. 压缩监控和故障排查

##### 6.1 压缩状态监控

```bash
#!/bin/bash
# compaction_monitor.sh

BOOTSTRAP_SERVER="localhost:9092"
TOPIC="user-profiles"

echo "=== Compaction Monitoring ==="
echo "Timestamp: $(date)"

# 检查Topic配置
echo "\n1. Topic Configuration:"
kafka-configs.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --entity-type topics \
  --entity-name $TOPIC

# 检查分区详情
echo "\n2. Partition Details:"
kafka-topics.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC

# 检查日志段信息
echo "\n3. Log Segments Analysis:"
for partition in 0 1 2; do
    echo "Partition $partition:"
    
    # 获取最早和最新偏移量
    EARLIEST=$(kafka-run-class.sh kafka.tools.GetOffsetShell \
      --broker-list $BOOTSTRAP_SERVER \
      --topic $TOPIC \
      --partition $partition \
      --time -2 | cut -d: -f3)
    
    LATEST=$(kafka-run-class.sh kafka.tools.GetOffsetShell \
      --broker-list $BOOTSTRAP_SERVER \
      --topic $TOPIC \
      --partition $partition \
      --time -1 | cut -d: -f3)
    
    TOTAL_MESSAGES=$((LATEST - EARLIEST))
    
    echo "  Earliest Offset: $EARLIEST"
    echo "  Latest Offset: $LATEST"
    echo "  Total Messages: $TOTAL_MESSAGES"
done

# 检查压缩线程状态
echo "\n4. Compaction Thread Status:"
# 这需要JMX监控或日志分析
echo "Check broker logs for compaction thread activity"
```

##### 6.2 压缩性能分析

```java
/**
 * 压缩性能分析工具
 */
public class CompactionAnalyzer {
    
    private final AdminClient adminClient;
    private final String topic;
    
    public CompactionAnalyzer(String bootstrapServers, String topic) {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        this.adminClient = AdminClient.create(props);
        this.topic = topic;
    }
    
    public void analyzeCompactionEfficiency() {
        try {
            // 获取Topic元数据
            DescribeTopicsResult topicsResult = adminClient.describeTopics(Arrays.asList(topic));
            TopicDescription topicDesc = topicsResult.values().get(topic).get();
            
            System.out.println("=== Compaction Analysis for Topic: " + topic + " ===");
            
            for (TopicPartitionInfo partition : topicDesc.partitions()) {
                int partitionId = partition.partition();
                
                // 分析分区的压缩效率
                analyzePartitionCompaction(partitionId);
            }
            
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    
    private void analyzePartitionCompaction(int partition) {
        System.out.println("\nPartition " + partition + " Analysis:");
        
        // 创建消费者分析消息分布
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "compaction-analyzer-" + System.currentTimeMillis());
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("auto.offset.reset", "earliest");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        TopicPartition tp = new TopicPartition(topic, partition);
        consumer.assign(Arrays.asList(tp));
        
        Map<String, Integer> keyCount = new HashMap<>();
        Map<String, Long> keyLatestOffset = new HashMap<>();
        long totalMessages = 0;
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                if (records.isEmpty()) break;
                
                for (ConsumerRecord<String, String> record : records) {
                    String key = record.key();
                    if (key != null) {
                        keyCount.put(key, keyCount.getOrDefault(key, 0) + 1);
                        keyLatestOffset.put(key, record.offset());
                    }
                    totalMessages++;
                }
            }
            
            // 计算压缩效率
            long uniqueKeys = keyCount.size();
            long duplicateMessages = totalMessages - uniqueKeys;
            double compressionRatio = (double) duplicateMessages / totalMessages * 100;
            
            System.out.println("  Total Messages: " + totalMessages);
            System.out.println("  Unique Keys: " + uniqueKeys);
            System.out.println("  Duplicate Messages: " + duplicateMessages);
            System.out.println("  Potential Compression Ratio: " + String.format("%.2f%%", compressionRatio));
            
            // 找出重复最多的Key
            String mostDuplicatedKey = keyCount.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("N/A");
            
            System.out.println("  Most Duplicated Key: " + mostDuplicatedKey + 
                " (" + keyCount.get(mostDuplicatedKey) + " occurrences)");
            
        } finally {
            consumer.close();
        }
    }
    
    public void close() {
        adminClient.close();
    }
}
```

## 实战案例

### 案例1：用户状态管理系统

```java
/**
 * 用户状态管理系统
 * 使用压缩Topic维护用户最新状态
 */
public class UserStateManager {
    
    private final KafkaProducer<String, String> producer;
    private final String topic = "user-states";
    
    public UserStateManager() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("acks", "all");
        props.put("enable.idempotence", true);
        
        this.producer = new KafkaProducer<>(props);
    }
    
    // 更新用户状态
    public void updateUserState(String userId, UserState state) {
        String stateJson = JsonUtils.toJson(state);
        
        ProducerRecord<String, String> record = new ProducerRecord<>(
            topic,
            userId,
            stateJson
        );
        
        // 添加版本信息
        record.headers().add("version", String.valueOf(state.getVersion()).getBytes());
        record.headers().add("update_time", String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(record);
    }
    
    // 用户注销（软删除）
    public void deactivateUser(String userId) {
        UserState deactivatedState = new UserState();
        deactivatedState.setStatus("DEACTIVATED");
        deactivatedState.setVersion(System.currentTimeMillis());
        
        updateUserState(userId, deactivatedState);
    }
    
    // 用户删除（硬删除）
    public void deleteUser(String userId) {
        ProducerRecord<String, String> record = new ProducerRecord<>(
            topic,
            userId,
            null  // null值触发删除
        );
        
        record.headers().add("delete_time", String.valueOf(System.currentTimeMillis()).getBytes());
        producer.send(record);
    }
}
```

### 案例2：配置管理系统

```bash
# 创建配置管理Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic application-configs \
  --partitions 1 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.1 \
  --config segment.ms=3600000 \
  --config min.compaction.lag.ms=60000
```

```java
/**
 * 配置管理系统
 * 使用压缩Topic实现配置的版本控制
 */
public class ConfigurationManager {
    
    private final KafkaProducer<String, String> producer;
    private final KafkaConsumer<String, String> consumer;
    private final String topic = "application-configs";
    private final Map<String, String> configCache = new ConcurrentHashMap<>();
    
    public ConfigurationManager() {
        // 生产者配置
        Properties producerProps = new Properties();
        producerProps.put("bootstrap.servers", "localhost:9092");
        producerProps.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        producerProps.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        producerProps.put("acks", "all");
        this.producer = new KafkaProducer<>(producerProps);
        
        // 消费者配置
        Properties consumerProps = new Properties();
        consumerProps.put("bootstrap.servers", "localhost:9092");
        consumerProps.put("group.id", "config-manager-" + System.currentTimeMillis());
        consumerProps.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        consumerProps.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        consumerProps.put("auto.offset.reset", "earliest");
        this.consumer = new KafkaConsumer<>(consumerProps);
        
        // 初始化时加载所有配置
        loadAllConfigurations();
    }
    
    // 加载所有配置到缓存
    private void loadAllConfigurations() {
        consumer.subscribe(Arrays.asList(topic));
        
        // 消费所有历史消息
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            if (records.isEmpty()) break;
            
            for (ConsumerRecord<String, String> record : records) {
                String configKey = record.key();
                String configValue = record.value();
                
                if (configValue == null) {
                    // null值表示删除配置
                    configCache.remove(configKey);
                } else {
                    configCache.put(configKey, configValue);
                }
            }
        }
        
        System.out.println("Loaded " + configCache.size() + " configurations");
    }
    
    // 更新配置
    public void updateConfiguration(String key, String value) {
        ProducerRecord<String, String> record = new ProducerRecord<>(topic, key, value);
        record.headers().add("update_time", String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(record, (metadata, exception) -> {
            if (exception == null) {
                configCache.put(key, value);
                System.out.println("Configuration updated: " + key + " = " + value);
            } else {
                System.err.println("Failed to update configuration: " + key);
            }
        });
    }
    
    // 删除配置
    public void deleteConfiguration(String key) {
        ProducerRecord<String, String> record = new ProducerRecord<>(topic, key, null);
        record.headers().add("delete_time", String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(record, (metadata, exception) -> {
            if (exception == null) {
                configCache.remove(key);
                System.out.println("Configuration deleted: " + key);
            } else {
                System.err.println("Failed to delete configuration: " + key);
            }
        });
    }
    
    // 获取配置
    public String getConfiguration(String key) {
        return configCache.get(key);
    }
    
    // 获取所有配置
    public Map<String, String> getAllConfigurations() {
        return new HashMap<>(configCache);
    }
}
```

## 实战练习

### 练习1：压缩Topic性能测试
1. 创建不同压缩配置的Topic
2. 发送大量重复Key的消息
3. 对比压缩前后的存储空间和查询性能

### 练习2：消息顺序验证
1. 实现带序列号的消息生产者
2. 创建验证消息顺序的消费者
3. 测试不同配置下的顺序保证效果

### 练习3：时间戳处理实践
1. 配置不同时间戳类型的Topic
2. 实现基于时间戳的消息过滤
3. 分析消息延迟和时间偏差

## 作业

1. **压缩策略设计**：
   - 为不同业务场景设计合适的压缩策略
   - 分析压缩参数对性能的影响
   - 实现压缩效果监控工具

2. **消息去重实现**：
   - 实现基于业务逻辑的消息去重
   - 设计高效的重复检测算法
   - 测试去重性能和准确性

3. **顺序保证机制**：
   - 实现严格的消息顺序保证
   - 设计乱序消息的处理策略
   - 优化顺序保证的性能开销

4. **时间戳应用开发**：
   - 实现基于时间戳的消息路由
   - 开发消息延迟监控系统
   - 设计时间窗口聚合功能

## 总结

本节课深入学习了Kafka的日志压缩和消息顺序机制，包括：
- 日志压缩的原理、配置和优化
- 基于Key的消息去重机制
- 分区级别的消息顺序保证
- 时间戳处理和版本控制
- 压缩性能监控和故障排查

这些机制对于构建高效、可靠的数据处理系统至关重要，需要根据具体业务需求选择合适的配置和实现策略。