# 第11天：Kafka消费者深入解析

## 学习目标
- 深入理解Kafka消费者的内部机制和工作原理
- 掌握Consumer Group的管理和重平衡机制
- 学会偏移量管理和消费策略优化
- 了解消费者配置参数的调优方法
- 掌握消费者性能监控和故障排查

## 课程内容

### 上午内容

#### 1. Kafka消费者架构深入

##### 1.1 消费者内部架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Consumer                           │
├─────────────────────────────────────────────────────────────┤
│  Application Thread                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │    poll()   │ <- │ Deserializer│ <- │   Fetcher   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                              ▲                              │
│                              │                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Record Buffer                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Partition 0 │  │ Partition 1 │  │ Partition 2 │ │   │
│  │  │  Records    │  │  Records    │  │  Records    │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                              ▲                              │
│                              │                              │
│  Background Thread (Heartbeat & Coordinator)               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Heartbeat   │ -> │ Coordinator │ -> │   Broker    │     │
│  │   Thread    │    │   Client    │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**关键组件说明**：
- **Fetcher**: 负责从Broker拉取消息
- **Deserializer**: 反序列化Key和Value
- **Record Buffer**: 消息缓冲区，按分区组织
- **Heartbeat Thread**: 发送心跳维持组成员关系
- **Coordinator Client**: 与Group Coordinator通信

##### 1.2 消费者工作流程

```java
/**
 * 消费者基本使用示例
 */
public class BasicConsumerExample {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "demo-consumer-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("auto.offset.reset", "earliest");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        // 订阅主题
        consumer.subscribe(Arrays.asList("demo-topic"));
        
        try {
            while (true) {
                // 拉取消息
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("Topic: %s, Partition: %d, Offset: %d, Key: %s, Value: %s%n",
                        record.topic(), record.partition(), record.offset(), 
                        record.key(), record.value());
                    
                    // 处理消息
                    processMessage(record);
                }
                
                // 手动提交偏移量（可选）
                // consumer.commitSync();
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            consumer.close();
        }
    }
    
    private static void processMessage(ConsumerRecord<String, String> record) {
        // 实际的消息处理逻辑
        System.out.println("Processing message: " + record.value());
    }
}
```

#### 2. Consumer Group深入理解

##### 2.1 Consumer Group机制

```java
/**
 * Consumer Group示例
 */
public class ConsumerGroupExample {
    
    // 消费者1
    public static class Consumer1 {
        public static void main(String[] args) {
            runConsumer("consumer-1");
        }
    }
    
    // 消费者2
    public static class Consumer2 {
        public static void main(String[] args) {
            runConsumer("consumer-2");
        }
    }
    
    // 消费者3
    public static class Consumer3 {
        public static void main(String[] args) {
            runConsumer("consumer-3");
        }
    }
    
    private static void runConsumer(String consumerId) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "demo-group");  // 同一个组
        props.put("client.id", consumerId);   // 不同的客户端ID
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("auto.offset.reset", "earliest");
        
        // 心跳配置
        props.put("heartbeat.interval.ms", 3000);
        props.put("session.timeout.ms", 10000);
        props.put("max.poll.interval.ms", 300000);
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        // 订阅主题
        consumer.subscribe(Arrays.asList("multi-partition-topic"));
        
        System.out.println(consumerId + " started");
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("%s - Topic: %s, Partition: %d, Offset: %d, Value: %s%n",
                        consumerId, record.topic(), record.partition(), 
                        record.offset(), record.value());
                    
                    // 模拟处理时间
                    Thread.sleep(100);
                }
                
                // 提交偏移量
                consumer.commitSync();
            }
        } catch (Exception e) {
            System.err.println(consumerId + " error: " + e.getMessage());
        } finally {
            consumer.close();
            System.out.println(consumerId + " closed");
        }
    }
}
```

##### 2.2 重平衡机制详解

```java
/**
 * 重平衡监听器示例
 */
public class RebalanceListenerExample {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "rebalance-demo-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");  // 禁用自动提交
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        // 自定义重平衡监听器
        ConsumerRebalanceListener rebalanceListener = new ConsumerRebalanceListener() {
            private final Map<TopicPartition, OffsetAndMetadata> currentOffsets = new HashMap<>();
            
            @Override
            public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
                System.out.println("Partitions revoked: " + partitions);
                
                // 在分区被撤销前提交当前偏移量
                if (!currentOffsets.isEmpty()) {
                    consumer.commitSync(currentOffsets);
                    System.out.println("Committed offsets before rebalance: " + currentOffsets);
                    currentOffsets.clear();
                }
            }
            
            @Override
            public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
                System.out.println("Partitions assigned: " + partitions);
                
                // 可以在这里设置特定的偏移量
                for (TopicPartition partition : partitions) {
                    long position = consumer.position(partition);
                    System.out.println("Starting position for " + partition + ": " + position);
                }
            }
            
            @Override
            public void onPartitionsLost(Collection<TopicPartition> partitions) {
                System.out.println("Partitions lost: " + partitions);
                currentOffsets.clear();
            }
            
            public void updateOffset(TopicPartition partition, long offset) {
                currentOffsets.put(partition, new OffsetAndMetadata(offset + 1));
            }
        };
        
        // 订阅主题并设置重平衡监听器
        consumer.subscribe(Arrays.asList("rebalance-test-topic"), rebalanceListener);
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("Consumed: Topic=%s, Partition=%d, Offset=%d, Value=%s%n",
                        record.topic(), record.partition(), record.offset(), record.value());
                    
                    // 处理消息
                    processMessage(record);
                    
                    // 更新偏移量
                    TopicPartition partition = new TopicPartition(record.topic(), record.partition());
                    ((RebalanceListenerExample.CustomRebalanceListener) rebalanceListener)
                        .updateOffset(partition, record.offset());
                }
                
                // 定期提交偏移量
                if (records.count() > 0) {
                    consumer.commitAsync();
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            consumer.close();
        }
    }
    
    // 内部类实现重平衡监听器
    private static class CustomRebalanceListener implements ConsumerRebalanceListener {
        private final Map<TopicPartition, OffsetAndMetadata> currentOffsets = new HashMap<>();
        private final KafkaConsumer<String, String> consumer;
        
        public CustomRebalanceListener(KafkaConsumer<String, String> consumer) {
            this.consumer = consumer;
        }
        
        @Override
        public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
            System.out.println("Partitions revoked: " + partitions);
            if (!currentOffsets.isEmpty()) {
                consumer.commitSync(currentOffsets);
                currentOffsets.clear();
            }
        }
        
        @Override
        public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
            System.out.println("Partitions assigned: " + partitions);
        }
        
        public void updateOffset(TopicPartition partition, long offset) {
            currentOffsets.put(partition, new OffsetAndMetadata(offset + 1));
        }
    }
    
    private static void processMessage(ConsumerRecord<String, String> record) {
        // 模拟消息处理
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

#### 3. 偏移量管理详解

##### 3.1 偏移量提交策略

```java
/**
 * 偏移量管理示例
 */
public class OffsetManagementExample {
    
    // 自动提交偏移量
    public static void autoCommitExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "auto-commit-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 自动提交配置
        props.put("enable.auto.commit", "true");
        props.put("auto.commit.interval.ms", "5000");  // 5秒自动提交一次
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("auto-commit-topic"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.println("Auto commit - Processing: " + record.value());
                    // 处理消息
                    processMessage(record);
                }
                // 不需要手动提交，会自动提交
            }
        } finally {
            consumer.close();
        }
    }
    
    // 同步手动提交
    public static void syncManualCommitExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "sync-commit-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");  // 禁用自动提交
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("sync-commit-topic"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.println("Sync commit - Processing: " + record.value());
                    processMessage(record);
                }
                
                if (records.count() > 0) {
                    // 同步提交偏移量
                    try {
                        consumer.commitSync();
                        System.out.println("Offset committed successfully");
                    } catch (CommitFailedException e) {
                        System.err.println("Commit failed: " + e.getMessage());
                    }
                }
            }
        } finally {
            consumer.close();
        }
    }
    
    // 异步手动提交
    public static void asyncManualCommitExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "async-commit-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("async-commit-topic"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.println("Async commit - Processing: " + record.value());
                    processMessage(record);
                }
                
                if (records.count() > 0) {
                    // 异步提交偏移量
                    consumer.commitAsync(new OffsetCommitCallback() {
                        @Override
                        public void onComplete(Map<TopicPartition, OffsetAndMetadata> offsets, 
                                             Exception exception) {
                            if (exception != null) {
                                System.err.println("Async commit failed: " + exception.getMessage());
                            } else {
                                System.out.println("Async commit successful: " + offsets);
                            }
                        }
                    });
                }
            }
        } finally {
            // 在关闭前进行同步提交确保偏移量被保存
            try {
                consumer.commitSync();
            } finally {
                consumer.close();
            }
        }
    }
    
    // 精确偏移量控制
    public static void preciseOffsetControlExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "precise-offset-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("precise-offset-topic"));
        
        Map<TopicPartition, OffsetAndMetadata> currentOffsets = new HashMap<>();
        int messageCount = 0;
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.println("Precise offset - Processing: " + record.value());
                    
                    try {
                        processMessage(record);
                        
                        // 记录当前偏移量
                        TopicPartition partition = new TopicPartition(record.topic(), record.partition());
                        currentOffsets.put(partition, new OffsetAndMetadata(record.offset() + 1));
                        messageCount++;
                        
                        // 每处理10条消息提交一次偏移量
                        if (messageCount % 10 == 0) {
                            consumer.commitSync(currentOffsets);
                            System.out.println("Committed offsets: " + currentOffsets);
                        }
                        
                    } catch (Exception e) {
                        System.err.println("Error processing message: " + e.getMessage());
                        // 处理失败时不更新偏移量，消息会被重新消费
                    }
                }
            }
        } finally {
            // 提交剩余的偏移量
            if (!currentOffsets.isEmpty()) {
                consumer.commitSync(currentOffsets);
            }
            consumer.close();
        }
    }
    
    private static void processMessage(ConsumerRecord<String, String> record) {
        // 模拟消息处理
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Processing interrupted", e);
        }
    }
}
```

##### 3.2 偏移量重置和查找

```java
/**
 * 偏移量重置和查找示例
 */
public class OffsetResetExample {
    
    // 重置到最早偏移量
    public static void seekToBeginningExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "seek-beginning-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("enable.auto.commit", "false");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        // 手动分配分区
        TopicPartition partition0 = new TopicPartition("reset-test-topic", 0);
        TopicPartition partition1 = new TopicPartition("reset-test-topic", 1);
        consumer.assign(Arrays.asList(partition0, partition1));
        
        // 重置到最早位置
        consumer.seekToBeginning(Arrays.asList(partition0, partition1));
        
        System.out.println("Reset to beginning positions:");
        System.out.println("Partition 0 position: " + consumer.position(partition0));
        System.out.println("Partition 1 position: " + consumer.position(partition1));
        
        // 消费消息
        int messageCount = 0;
        while (messageCount < 100) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                System.out.printf("Consumed from beginning: Partition=%d, Offset=%d, Value=%s%n",
                    record.partition(), record.offset(), record.value());
                messageCount++;
            }
        }
        
        consumer.close();
    }
    
    // 重置到最新偏移量
    public static void seekToEndExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "seek-end-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        TopicPartition partition = new TopicPartition("reset-test-topic", 0);
        consumer.assign(Arrays.asList(partition));
        
        // 重置到最新位置
        consumer.seekToEnd(Arrays.asList(partition));
        
        System.out.println("Reset to end position: " + consumer.position(partition));
        
        // 只会消费新产生的消息
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                System.out.printf("New message: Partition=%d, Offset=%d, Value=%s%n",
                    record.partition(), record.offset(), record.value());
            }
        }
    }
    
    // 重置到特定偏移量
    public static void seekToSpecificOffsetExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "seek-specific-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        TopicPartition partition = new TopicPartition("reset-test-topic", 0);
        consumer.assign(Arrays.asList(partition));
        
        // 重置到特定偏移量
        long targetOffset = 1000L;
        consumer.seek(partition, targetOffset);
        
        System.out.println("Reset to specific offset: " + targetOffset);
        System.out.println("Current position: " + consumer.position(partition));
        
        // 从特定偏移量开始消费
        int messageCount = 0;
        while (messageCount < 50) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                System.out.printf("From offset %d: Partition=%d, Offset=%d, Value=%s%n",
                    targetOffset, record.partition(), record.offset(), record.value());
                messageCount++;
            }
        }
        
        consumer.close();
    }
    
    // 基于时间戳重置偏移量
    public static void seekByTimestampExample() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "seek-timestamp-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        
        TopicPartition partition = new TopicPartition("reset-test-topic", 0);
        consumer.assign(Arrays.asList(partition));
        
        // 查找1小时前的偏移量
        long oneHourAgo = System.currentTimeMillis() - 3600 * 1000;
        Map<TopicPartition, Long> timestampsToSearch = new HashMap<>();
        timestampsToSearch.put(partition, oneHourAgo);
        
        Map<TopicPartition, OffsetAndTimestamp> offsetsForTimes = 
            consumer.offsetsForTimes(timestampsToSearch);
        
        OffsetAndTimestamp offsetAndTimestamp = offsetsForTimes.get(partition);
        if (offsetAndTimestamp != null) {
            consumer.seek(partition, offsetAndTimestamp.offset());
            System.out.println("Reset to timestamp " + oneHourAgo + 
                ", offset: " + offsetAndTimestamp.offset());
        } else {
            System.out.println("No offset found for timestamp " + oneHourAgo);
        }
        
        // 消费从指定时间开始的消息
        int messageCount = 0;
        while (messageCount < 20) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            
            for (ConsumerRecord<String, String> record : records) {
                System.out.printf("From timestamp: Partition=%d, Offset=%d, Timestamp=%d, Value=%s%n",
                    record.partition(), record.offset(), record.timestamp(), record.value());
                messageCount++;
            }
        }
        
        consumer.close();
    }
}
```

### 下午内容

#### 4. 消费者配置优化

##### 4.1 核心配置参数

```java
/**
 * 消费者配置最佳实践
 */
public class ConsumerConfigurationBestPractices {
    
    // 高吞吐量配置
    public static Properties getHighThroughputConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("group.id", "high-throughput-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 拉取优化
        props.put("fetch.min.bytes", 50000);        // 50KB最小拉取
        props.put("fetch.max.wait.ms", 500);        // 最大等待500ms
        props.put("max.partition.fetch.bytes", 2097152);  // 2MB每分区最大拉取
        props.put("max.poll.records", 1000);        // 每次poll最多1000条记录
        
        // 会话配置
        props.put("session.timeout.ms", 30000);     // 30秒会话超时
        props.put("heartbeat.interval.ms", 10000);  // 10秒心跳间隔
        props.put("max.poll.interval.ms", 600000);  // 10分钟最大poll间隔
        
        // 偏移量配置
        props.put("enable.auto.commit", "true");
        props.put("auto.commit.interval.ms", 5000);  // 5秒自动提交
        props.put("auto.offset.reset", "latest");
        
        return props;
    }
    
    // 低延迟配置
    public static Properties getLowLatencyConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("group.id", "low-latency-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 低延迟优化
        props.put("fetch.min.bytes", 1);            // 最小拉取1字节
        props.put("fetch.max.wait.ms", 10);         // 最大等待10ms
        props.put("max.poll.records", 100);         // 每次poll最多100条
        
        // 快速故障检测
        props.put("session.timeout.ms", 6000);      // 6秒会话超时
        props.put("heartbeat.interval.ms", 2000);   // 2秒心跳间隔
        
        // 手动偏移量管理
        props.put("enable.auto.commit", "false");
        
        this.consumer = new KafkaConsumer<>(props);
        this.metrics = new CustomConsumerMetrics();
        this.processingPool = Executors.newFixedThreadPool(10);
    }
    
    public void start() {
        consumer.subscribe(Arrays.asList("realtime-events", "user-actions", "system-metrics"));
        
        // 启动监控
        ConsumerMetricsMonitor monitor = new ConsumerMetricsMonitor(consumer);
        monitor.startMonitoring();
        
        try {
            while (running) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
                
                if (!records.isEmpty()) {
                    processRecordsBatch(records);
                    consumer.commitSync();
                }
            }
        } catch (Exception e) {
            System.err.println("Processing error: " + e.getMessage());
        } finally {
            processingPool.shutdown();
            consumer.close();
            monitor.stopMonitoring();
            metrics.printSummary();
        }
    }
    
    private void processRecordsBatch(ConsumerRecords<String, String> records) {
        List<Future<Void>> futures = new ArrayList<>();
        
        for (ConsumerRecord<String, String> record : records) {
            Future<Void> future = processingPool.submit(() -> {
                long startTime = System.currentTimeMillis();
                
                try {
                    processRecord(record);
                    metrics.recordProcessed();
                } catch (Exception e) {
                    metrics.recordError(record.topic());
                    System.err.println("Error processing record: " + e.getMessage());
                } finally {
                    long processingTime = System.currentTimeMillis() - startTime;
                    metrics.recordProcessingTime(processingTime);
                }
                
                return null;
            });
            futures.add(future);
        }
        
        // 等待所有任务完成
        for (Future<Void> future : futures) {
            try {
                future.get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                System.err.println("Task execution failed: " + e.getMessage());
            }
        }
        
        metrics.recordConsumed("batch", records.count());
    }
    
    private void processRecord(ConsumerRecord<String, String> record) {
        // 实际的数据处理逻辑
        System.out.printf("Processing: Topic=%s, Partition=%d, Offset=%d, Value=%s%n",
            record.topic(), record.partition(), record.offset(), record.value());
        
        // 模拟复杂的数据处理
        try {
            Thread.sleep(5);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    
    public void shutdown() {
        running = false;
    }
}
```

### 案例2：消息重试和死信队列处理

```java
/**
 * 带重试机制和死信队列的消费者
 */
public class RetryableConsumer {
    
    private final KafkaConsumer<String, String> consumer;
    private final KafkaProducer<String, String> retryProducer;
    private final KafkaProducer<String, String> dlqProducer;
    private final int maxRetries;
    
    public RetryableConsumer(int maxRetries) {
        this.maxRetries = maxRetries;
        
        // 消费者配置
        Properties consumerProps = new Properties();
        consumerProps.put("bootstrap.servers", "localhost:9092");
        consumerProps.put("group.id", "retry-consumer-group");
        consumerProps.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        consumerProps.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        consumerProps.put("enable.auto.commit", "false");
        
        this.consumer = new KafkaConsumer<>(consumerProps);
        
        // 生产者配置（用于重试和死信队列）
        Properties producerProps = new Properties();
        producerProps.put("bootstrap.servers", "localhost:9092");
        producerProps.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        producerProps.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        this.retryProducer = new KafkaProducer<>(producerProps);
        this.dlqProducer = new KafkaProducer<>(producerProps);
    }
    
    public void consume() {
        consumer.subscribe(Arrays.asList("main-topic", "retry-topic"));
        
        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    processWithRetry(record);
                }
                
                consumer.commitSync();
            }
        } finally {
            consumer.close();
            retryProducer.close();
            dlqProducer.close();
        }
    }
    
    private void processWithRetry(ConsumerRecord<String, String> record) {
        try {
            // 尝试处理消息
            processMessage(record);
            System.out.println("Successfully processed: " + record.value());
            
        } catch (Exception e) {
            System.err.println("Processing failed: " + e.getMessage());
            
            // 获取重试次数
            int retryCount = getRetryCount(record);
            
            if (retryCount < maxRetries) {
                // 发送到重试队列
                sendToRetryTopic(record, retryCount + 1);
                System.out.println("Sent to retry queue, attempt: " + (retryCount + 1));
            } else {
                // 发送到死信队列
                sendToDeadLetterQueue(record, e.getMessage());
                System.out.println("Sent to dead letter queue after " + maxRetries + " retries");
            }
        }
    }
    
    private void processMessage(ConsumerRecord<String, String> record) throws Exception {
        // 模拟可能失败的处理逻辑
        String value = record.value();
        
        if (value.contains("error")) {
            throw new RuntimeException("Simulated processing error");
        }
        
        // 正常处理
        Thread.sleep(100);
    }
    
    private int getRetryCount(ConsumerRecord<String, String> record) {
        // 从消息头中获取重试次数
        Header retryHeader = record.headers().lastHeader("retry-count");
        if (retryHeader != null) {
            return Integer.parseInt(new String(retryHeader.value()));
        }
        return 0;
    }
    
    private void sendToRetryTopic(ConsumerRecord<String, String> record, int retryCount) {
        ProducerRecord<String, String> retryRecord = new ProducerRecord<>(
            "retry-topic", record.key(), record.value());
        
        // 添加重试次数到消息头
        retryRecord.headers().add("retry-count", String.valueOf(retryCount).getBytes());
        retryRecord.headers().add("original-topic", record.topic().getBytes());
        retryRecord.headers().add("original-partition", String.valueOf(record.partition()).getBytes());
        retryRecord.headers().add("original-offset", String.valueOf(record.offset()).getBytes());
        
        retryProducer.send(retryRecord);
    }
    
    private void sendToDeadLetterQueue(ConsumerRecord<String, String> record, String errorMessage) {
        ProducerRecord<String, String> dlqRecord = new ProducerRecord<>(
            "dead-letter-queue", record.key(), record.value());
        
        // 添加错误信息到消息头
        dlqRecord.headers().add("error-message", errorMessage.getBytes());
        dlqRecord.headers().add("original-topic", record.topic().getBytes());
        dlqRecord.headers().add("original-partition", String.valueOf(record.partition()).getBytes());
        dlqRecord.headers().add("original-offset", String.valueOf(record.offset()).getBytes());
        dlqRecord.headers().add("failed-timestamp", String.valueOf(System.currentTimeMillis()).getBytes());
        
        dlqProducer.send(dlqRecord);
    }
}
```

## 实战练习

### 练习1：实现消费者组管理工具

```bash
# 创建测试主题
kafka-topics.sh --create --topic consumer-group-test \
  --bootstrap-server localhost:9092 \
  --partitions 6 --replication-factor 1

# 查看消费者组
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 查看消费者组详情
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group demo-consumer-group --describe

# 重置消费者组偏移量
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group demo-consumer-group --reset-offsets \
  --to-earliest --topic consumer-group-test --execute
```

### 练习2：消费者性能测试

```bash
# 启动性能测试消费者
kafka-consumer-perf-test.sh --bootstrap-server localhost:9092 \
  --topic performance-test --group perf-test-group \
  --messages 100000 --threads 4

# 监控消费者组状态
watch -n 2 "kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group perf-test-group --describe"
```

### 练习3：实现自定义分区分配策略

```java
/**
 * 自定义分区分配策略
 */
public class CustomPartitionAssignor implements ConsumerPartitionAssignor {
    
    @Override
    public String name() {
        return "custom";
    }
    
    @Override
    public Map<String, List<TopicPartition>> assign(Map<String, Integer> partitionsPerTopic,
                                                   Map<String, Subscription> subscriptions) {
        // 实现自定义分配逻辑
        Map<String, List<TopicPartition>> assignment = new HashMap<>();
        
        // 获取所有消费者
        List<String> consumers = new ArrayList<>(subscriptions.keySet());
        Collections.sort(consumers);
        
        // 获取所有分区
        List<TopicPartition> allPartitions = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : partitionsPerTopic.entrySet()) {
            String topic = entry.getKey();
            int numPartitions = entry.getValue();
            for (int i = 0; i < numPartitions; i++) {
                allPartitions.add(new TopicPartition(topic, i));
            }
        }
        
        // 平均分配分区
        int partitionsPerConsumer = allPartitions.size() / consumers.size();
        int remainingPartitions = allPartitions.size() % consumers.size();
        
        int partitionIndex = 0;
        for (int i = 0; i < consumers.size(); i++) {
            String consumer = consumers.get(i);
            List<TopicPartition> assignedPartitions = new ArrayList<>();
            
            int numPartitionsToAssign = partitionsPerConsumer;
            if (i < remainingPartitions) {
                numPartitionsToAssign++;
            }
            
            for (int j = 0; j < numPartitionsToAssign; j++) {
                assignedPartitions.add(allPartitions.get(partitionIndex++));
            }
            
            assignment.put(consumer, assignedPartitions);
        }
        
        return assignment;
    }
    
    @Override
    public void onAssignment(Assignment assignment, int generation) {
        // 分配完成后的回调
    }
}
```

## 课后作业

1. **消费者组实验**：
   - 创建一个包含6个分区的主题
   - 启动3个消费者实例，观察分区分配
   - 动态添加和移除消费者，观察重平衡过程
   - 记录重平衡时间和影响

2. **偏移量管理实践**：
   - 实现一个支持精确一次处理的消费者
   - 使用外部存储（如数据库）管理偏移量
   - 实现消费者故障恢复机制

3. **性能优化项目**：
   - 对比不同配置参数对消费性能的影响
   - 实现消费者性能监控dashboard
   - 优化消费者配置以达到最佳性能

4. **消息处理模式**：
   - 实现批量消息处理模式
   - 实现消息去重机制
   - 实现消息顺序处理保证

## 总结

今天我们深入学习了Kafka消费者的核心概念和实践技巧：

1. **消费者架构**：理解了消费者内部组件和工作流程
2. **Consumer Group**：掌握了消费者组的管理和重平衡机制
3. **偏移量管理**：学会了不同的偏移量提交策略和控制方法
4. **配置优化**：了解了针对不同场景的配置最佳实践
5. **消费模式**：实现了多种消费者模式和拦截器
6. **性能监控**：掌握了消费者性能监控和指标收集

通过今天的学习，你应该能够：
- 设计高效的消费者架构
- 处理消费者组的各种场景
- 实现可靠的偏移量管理
- 优化消费者性能
- 监控和排查消费者问题

明天我们将学习Kafka的消息确认和幂等性机制。
        
        return props;
    }
    
    // 高可靠性配置
    public static Properties getHighReliabilityConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("group.id", "high-reliability-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 可靠性优先
        props.put("enable.auto.commit", "false");   // 手动提交偏移量
        props.put("isolation.level", "read_committed");  // 只读已提交的消息
        
        // 保守的拉取配置
        props.put("max.poll.records", 100);         // 较小的批次
        props.put("max.poll.interval.ms", 300000);  // 5分钟处理时间
        
        // 重试配置
        props.put("retry.backoff.ms", 1000);        // 重试间隔1秒
        props.put("reconnect.backoff.ms", 1000);    // 重连间隔1秒
        
        return props;
    }
}
```

##### 4.2 配置参数详解

```properties
# 消费者核心配置参数说明

# 连接配置
bootstrap.servers=kafka1:9092,kafka2:9092,kafka3:9092
group.id=my-consumer-group
client.id=my-consumer-client

# 反序列化配置
key.deserializer=org.apache.kafka.common.serialization.StringDeserializer
value.deserializer=org.apache.kafka.common.serialization.StringDeserializer

# 拉取配置
fetch.min.bytes=1024          # 最小拉取字节数
fetch.max.wait.ms=500         # 最大等待时间（毫秒）
max.partition.fetch.bytes=1048576  # 每分区最大拉取字节数
max.poll.records=500          # 每次poll最大记录数
max.poll.interval.ms=300000   # 最大poll间隔（毫秒）

# 会话管理配置
session.timeout.ms=10000      # 会话超时时间（毫秒）
heartbeat.interval.ms=3000    # 心跳间隔（毫秒）

# 偏移量配置
enable.auto.commit=true       # 是否自动提交偏移量
auto.commit.interval.ms=5000  # 自动提交间隔（毫秒）
auto.offset.reset=latest      # 偏移量重置策略：earliest, latest, none

# 隔离级别
isolation.level=read_uncommitted  # 隔离级别：read_uncommitted, read_committed

# 拦截器配置
interceptor.classes=

# 网络配置
send.buffer.bytes=131072      # 发送缓冲区大小
receive.buffer.bytes=65536    # 接收缓冲区大小
request.timeout.ms=30000      # 请求超时时间
connections.max.idle.ms=540000 # 连接最大空闲时间

# 重试配置
retry.backoff.ms=100          # 重试间隔（毫秒）
reconnect.backoff.ms=50       # 重连间隔（毫秒）
reconnect.backoff.max.ms=1000 # 最大重连间隔（毫秒）

# 元数据配置
metadata.max.age.ms=300000    # 元数据最大缓存时间

# 安全配置
check.crcs=true               # 是否检查CRC校验
```

#### 5. 消费策略和模式

##### 5.1 不同消费模式实现

```java
/**
 * 不同消费模式的实现
 */
public class ConsumptionPatterns {
    
    // 单线程消费模式
    public static class SingleThreadConsumer {
        private final KafkaConsumer<String, String> consumer;
        private volatile boolean running = true;
        
        public SingleThreadConsumer(Properties props) {
            this.consumer = new KafkaConsumer<>(props);
        }
        
        public void consume(List<String> topics) {
            consumer.subscribe(topics);
            
            try {
                while (running) {
                    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                    
                    for (ConsumerRecord<String, String> record : records) {
                        processRecord(record);
                    }
                    
                    consumer.commitSync();
                }
            } catch (Exception e) {
                System.err.println("Consumer error: " + e.getMessage());
            } finally {
                consumer.close();
            }
        }
        
        private void processRecord(ConsumerRecord<String, String> record) {
            System.out.printf("Single thread - Topic: %s, Partition: %d, Offset: %d, Value: %s%n",
                record.topic(), record.partition(), record.offset(), record.value());
            
            // 模拟处理时间
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        public void shutdown() {
            running = false;
        }
    }
    
    // 多线程消费模式（每个分区一个线程）
    public static class MultiThreadConsumer {
        private final int numThreads;
        private final ExecutorService executorService;
        private final List<SingleThreadConsumer> consumers;
        
        public MultiThreadConsumer(int numThreads, Properties baseProps) {
            this.numThreads = numThreads;
            this.executorService = Executors.newFixedThreadPool(numThreads);
            this.consumers = new ArrayList<>();
            
            for (int i = 0; i < numThreads; i++) {
                Properties props = new Properties();
                props.putAll(baseProps);
                props.put("client.id", "consumer-" + i);
                
                consumers.add(new SingleThreadConsumer(props));
            }
        }
        
        public void consume(List<String> topics) {
            for (SingleThreadConsumer consumer : consumers) {
                executorService.submit(() -> consumer.consume(topics));
            }
        }
        
        public void shutdown() {
            consumers.forEach(SingleThreadConsumer::shutdown);
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(10, TimeUnit.SECONDS)) {
                    executorService.shutdownNow();
                }
            } catch (InterruptedException e) {
                executorService.shutdownNow();
            }
        }
    }
    
    // 工作线程池消费模式
    public static class WorkerPoolConsumer {
        private final KafkaConsumer<String, String> consumer;
        private final ExecutorService workerPool;
        private volatile boolean running = true;
        
        public WorkerPoolConsumer(Properties props, int workerThreads) {
            this.consumer = new KafkaConsumer<>(props);
            this.workerPool = Executors.newFixedThreadPool(workerThreads);
        }
        
        public void consume(List<String> topics) {
            consumer.subscribe(topics);
            
            try {
                while (running) {
                    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                    
                    if (!records.isEmpty()) {
                        // 将记录分发给工作线程处理
                        List<Future<Void>> futures = new ArrayList<>();
                        
                        for (ConsumerRecord<String, String> record : records) {
                            Future<Void> future = workerPool.submit(() -> {
                                processRecord(record);
                                return null;
                            });
                            futures.add(future);
                        }
                        
                        // 等待所有任务完成
                        for (Future<Void> future : futures) {
                            try {
                                future.get();
                            } catch (Exception e) {
                                System.err.println("Worker task failed: " + e.getMessage());
                            }
                        }
                        
                        // 所有消息处理完成后提交偏移量
                        consumer.commitSync();
                    }
                }
            } catch (Exception e) {
                System.err.println("Consumer error: " + e.getMessage());
            } finally {
                workerPool.shutdown();
                consumer.close();
            }
        }
        
        private void processRecord(ConsumerRecord<String, String> record) {
            System.out.printf("Worker pool - Thread: %s, Topic: %s, Partition: %d, Offset: %d, Value: %s%n",
                Thread.currentThread().getName(), record.topic(), record.partition(), 
                record.offset(), record.value());
            
            // 模拟处理时间
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        public void shutdown() {
            running = false;
        }
    }
}
```

##### 5.2 消费者拦截器

```java
/**
 * 消费者拦截器示例
 */
public class ConsumerInterceptorExample {
    
    // 消息统计拦截器
    public static class MessageStatsInterceptor implements ConsumerInterceptor<String, String> {
        private final AtomicLong consumedCount = new AtomicLong(0);
        private final AtomicLong errorCount = new AtomicLong(0);
        private final Map<String, AtomicLong> topicStats = new ConcurrentHashMap<>();
        
        @Override
        public ConsumerRecords<String, String> onConsume(ConsumerRecords<String, String> records) {
            // 消费前处理
            long recordCount = records.count();
            consumedCount.addAndGet(recordCount);
            
            // 统计各Topic的消息数量
            for (ConsumerRecord<String, String> record : records) {
                topicStats.computeIfAbsent(record.topic(), k -> new AtomicLong(0))
                          .incrementAndGet();
            }
            
            System.out.println("Consuming " + recordCount + " records");
            return records;
        }
        
        @Override
        public void onCommit(Map<TopicPartition, OffsetAndMetadata> offsets) {
            // 提交后处理
            System.out.println("Offsets committed: " + offsets);
        }
        
        @Override
        public void close() {
            System.out.println("=== Consumer Statistics ===");
            System.out.println("Total consumed: " + consumedCount.get());
            System.out.println("Total errors: " + errorCount.get());
            
            System.out.println("\nTopic Statistics:");
            topicStats.forEach((topic, count) -> 
                System.out.println("  " + topic + ": " + count.get()));
        }
        
        @Override
        public void configure(Map<String, ?> configs) {
            // 配置初始化
        }
    }
    
    // 消息过滤拦截器
    public static class MessageFilterInterceptor implements ConsumerInterceptor<String, String> {
        private final Set<String> allowedTopics = new HashSet<>();
        private final AtomicLong filteredCount = new AtomicLong(0);
        
        @Override
        public void configure(Map<String, ?> configs) {
            // 配置允许的主题
            allowedTopics.add("important-topic");
            allowedTopics.add("critical-topic");
        }
        
        @Override
        public ConsumerRecords<String, String> onConsume(ConsumerRecords<String, String> records) {
            Map<TopicPartition, List<ConsumerRecord<String, String>>> filteredRecords = new HashMap<>();
            
            for (ConsumerRecord<String, String> record : records) {
                if (allowedTopics.contains(record.topic())) {
                    TopicPartition tp = new TopicPartition(record.topic(), record.partition());
                    filteredRecords.computeIfAbsent(tp, k -> new ArrayList<>()).add(record);
                } else {
                    filteredCount.incrementAndGet();
                }
            }
            
            return new ConsumerRecords<>(filteredRecords);
        }
        
        @Override
        public void onCommit(Map<TopicPartition, OffsetAndMetadata> offsets) {
            // 不需要特殊处理
        }
        
        @Override
        public void close() {
            System.out.println("Filtered records count: " + filteredCount.get());
        }
    }
    
    // 使用拦截器的消费者
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "interceptor-demo-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 配置拦截器链
        props.put("interceptor.classes", 
            "com.example.MessageFilterInterceptor,com.example.MessageStatsInterceptor");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("important-topic", "normal-topic", "critical-topic"));
        
        try {
            for (int i = 0; i < 100; i++) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                
                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("Processed: Topic=%s, Partition=%d, Offset=%d, Value=%s%n",
                        record.topic(), record.partition(), record.offset(), record.value());
                }
                
                consumer.commitSync();
            }
        } finally {
            consumer.close();  // 会触发拦截器的close()方法
        }
    }
}
```

#### 6. 消费者性能监控

##### 6.1 JMX指标监控

```java
/**
 * 消费者JMX指标监控
 */
public class ConsumerMetricsMonitor {
    
    private final KafkaConsumer<String, String> consumer;
    private final ScheduledExecutorService scheduler;
    
    public ConsumerMetricsMonitor(KafkaConsumer<String, String> consumer) {
        this.consumer = consumer;
        this.scheduler = Executors.newScheduledThreadPool(1);
    }
    
    public void startMonitoring() {
        scheduler.scheduleAtFixedRate(this::printMetrics, 0, 10, TimeUnit.SECONDS);
    }
    
    private void printMetrics() {
        Map<MetricName, ? extends Metric> metrics = consumer.metrics();
        
        System.out.println("\n=== Consumer Metrics ===");
        System.out.println("Timestamp: " + new Date());
        
        // 消费指标
        printMetric(metrics, "records-consumed-rate", "Records consumed per second");
        printMetric(metrics, "records-consumed-total", "Total records consumed");
        printMetric(metrics, "bytes-consumed-rate", "Bytes consumed per second");
        printMetric(metrics, "bytes-consumed-total", "Total bytes consumed");
        
        // 拉取指标
        printMetric(metrics, "fetch-rate", "Fetch requests per second");
        printMetric(metrics, "fetch-latency-avg", "Average fetch latency (ms)");
        printMetric(metrics, "fetch-latency-max", "Maximum fetch latency (ms)");
        printMetric(metrics, "fetch-size-avg", "Average fetch size (bytes)");
        printMetric(metrics, "fetch-size-max", "Maximum fetch size (bytes)");
        
        // 提交指标
        printMetric(metrics, "commit-rate", "Offset commits per second");
        printMetric(metrics, "commit-latency-avg", "Average commit latency (ms)");
        printMetric(metrics, "commit-latency-max", "Maximum commit latency (ms)");
        
        // 协调器指标
        printMetric(metrics, "assigned-partitions", "Number of assigned partitions");
        printMetric(metrics, "heartbeat-rate", "Heartbeats per second");
        printMetric(metrics, "join-rate", "Group joins per second");
        printMetric(metrics, "sync-rate", "Group syncs per second");
        
        // 网络指标
        printMetric(metrics, "incoming-byte-rate", "Incoming bytes per second");
        printMetric(metrics, "request-rate", "Requests per second");
        printMetric(metrics, "response-rate", "Responses per second");
    }
    
    private void printMetric(Map<MetricName, ? extends Metric> metrics, 
                           String metricName, String description) {
        metrics.entrySet().stream()
            .filter(entry -> entry.getKey().name().equals(metricName))
            .findFirst()
            .ifPresent(entry -> {
                double value = (Double) entry.getValue().metricValue();
                System.out.println(String.format("  %-35s: %10.2f (%s)", 
                    description, value, metricName));
            });
    }
    
    public void stopMonitoring() {
        scheduler.shutdown();
    }
}
```

##### 6.2 自定义消费者指标

```java
/**
 * 自定义消费者指标收集器
 */
public class CustomConsumerMetrics {
    
    private final AtomicLong totalConsumed = new AtomicLong(0);
    private final AtomicLong totalProcessed = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);
    private final Map<String, AtomicLong> topicMetrics = new ConcurrentHashMap<>();
    private final List<Long> processingTimes = new CopyOnWriteArrayList<>();
    private final AtomicLong lagSum = new AtomicLong(0);
    private final AtomicLong lagCount = new AtomicLong(0);
    
    public void recordConsumed(String topic, int count) {
        totalConsumed.addAndGet(count);
        topicMetrics.computeIfAbsent(topic, k -> new AtomicLong(0)).addAndGet(count);
    }
    
    public void recordProcessed() {
        totalProcessed.incrementAndGet();
    }
    
    public void recordError(String topic) {
        totalErrors.incrementAndGet();
    }
    
    public void recordProcessingTime(long timeMs) {
        processingTimes.add(timeMs);
        // 保持最近1000个处理时间记录
        if (processingTimes.size() > 1000) {
            processingTimes.remove(0);
        }
    }
    
    public void recordLag(long lag) {
        lagSum.addAndGet(lag);
        lagCount.incrementAndGet();
    }
    
    public void printSummary() {
        System.out.println("\n=== Custom Consumer Metrics Summary ===");
        System.out.println("Total consumed: " + totalConsumed.get());
        System.out.println("Total processed: " + totalProcessed.get());
        System.out.println("Total errors: " + totalErrors.get());
        
        long consumed = totalConsumed.get();
        long processed = totalProcessed.get();
        if (consumed > 0) {
            System.out.println("Processing rate: " + 
                String.format("%.2f%%", (double) processed / consumed * 100));
        }
        
        if (!processingTimes.isEmpty()) {
            double avgProcessingTime = processingTimes.stream()
                .mapToLong(Long::longValue).average().orElse(0.0);
            long maxProcessingTime = processingTimes.stream()
                .mapToLong(Long::longValue).max().orElse(0L);
            long minProcessingTime = processingTimes.stream()
                .mapToLong(Long::longValue).min().orElse(0L);
            
            System.out.println("Average processing time: " + 
                String.format("%.2f ms", avgProcessingTime));
            System.out.println("Min processing time: " + minProcessingTime + " ms");
            System.out.println("Max processing time: " + maxProcessingTime + " ms");
        }
        
        long lagCountValue = lagCount.get();
        if (lagCountValue > 0) {
            double avgLag = (double) lagSum.get() / lagCountValue;
            System.out.println("Average consumer lag: " + String.format("%.2f", avgLag));
        }
        
        System.out.println("\nPer-topic consumption:");
        topicMetrics.forEach((topic, count) -> 
            System.out.println("  " + topic + ": " + count.get() + " messages"));
    }
}
```

## 实战案例

### 案例1：实时数据处理系统

```java
/**
 * 实时数据处理系统的消费者实现
 * 要求：低延迟、高吞吐量、故障恢复
 */
public class RealTimeDataProcessor {
    
    private final KafkaConsumer<String, String> consumer;
    private final CustomConsumerMetrics metrics;
    private final ExecutorService processingPool;
    private volatile boolean running = true;
    
    public RealTimeDataProcessor() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("group.id", "realtime-processor-group");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        
        // 低延迟配置
        props.put("fetch.min.bytes", 1);
        props.put("fetch.max.wait.ms", 10);
        props.put("max.poll.records", 100);
        
        // 快速故障检测
        props.put("session.timeout.ms", 6000);
        props.put("heartbeat.interval.ms", 2000);
        
        // 手动偏移量管理
        props.put("enable.auto.commit", "false");