# 第10天：Kafka生产者深入解析

## 学习目标
- 深入理解Kafka生产者的内部机制和工作原理
- 掌握生产者配置参数的优化策略
- 学会实现自定义分区器和拦截器
- 了解批处理和压缩机制的优化
- 掌握生产者性能调优和故障排查

## 课程内容

### 上午内容

#### 1. Kafka生产者架构深入

##### 1.1 生产者内部架构
```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Producer                           │
├─────────────────────────────────────────────────────────────┤
│  Application Thread                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   send()    │ -> │ Serializer  │ -> │ Partitioner │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Record Accumulator                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Partition 0 │  │ Partition 1 │  │ Partition 2 │ │   │
│  │  │   Batch 1   │  │   Batch 1   │  │   Batch 1   │ │   │
│  │  │   Batch 2   │  │   Batch 2   │  │   Batch 2   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  Background Thread (Sender)                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Sender    │ -> │ NetworkClient│ -> │   Broker    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**关键组件说明**：
- **Serializer**: 序列化Key和Value
- **Partitioner**: 确定消息发送到哪个分区
- **Record Accumulator**: 消息缓冲区，按分区组织批次
- **Sender**: 后台线程，负责网络发送
- **NetworkClient**: 网络通信客户端

##### 1.2 消息发送流程

```java
/**
 * 详细的消息发送流程示例
 */
public class ProducerFlowDemo {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 同步发送
        try {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "demo-topic", "key1", "Hello Kafka");
            
            RecordMetadata metadata = producer.send(record).get();
            System.out.println("Message sent to partition: " + metadata.partition() + 
                ", offset: " + metadata.offset());
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // 异步发送
        ProducerRecord<String, String> asyncRecord = new ProducerRecord<>(
            "demo-topic", "key2", "Async Hello");
        
        producer.send(asyncRecord, new Callback() {
            @Override
            public void onCompletion(RecordMetadata metadata, Exception exception) {
                if (exception == null) {
                    System.out.println("Async message sent successfully: " + 
                        metadata.partition() + ":" + metadata.offset());
                } else {
                    System.err.println("Failed to send async message: " + exception.getMessage());
                }
            }
        });
        
        producer.close();
    }
}
```

#### 2. 生产者配置详解

##### 2.1 核心配置参数

```java
/**
 * 生产者配置最佳实践
 */
public class ProducerConfigurationBestPractices {
    
    // 高吞吐量配置
    public static Properties getHighThroughputConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 批处理优化
        props.put("batch.size", 65536);  // 64KB
        props.put("linger.ms", 100);     // 等待100ms
        props.put("buffer.memory", 67108864);  // 64MB缓冲区
        
        // 压缩配置
        props.put("compression.type", "lz4");
        
        // 并发配置
        props.put("max.in.flight.requests.per.connection", 5);
        
        // 可靠性配置
        props.put("acks", "1");
        props.put("retries", 3);
        props.put("retry.backoff.ms", 100);
        
        return props;
    }
    
    // 高可靠性配置
    public static Properties getHighReliabilityConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 可靠性优先配置
        props.put("acks", "all");  // 等待所有ISR确认
        props.put("retries", Integer.MAX_VALUE);  // 无限重试
        props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
        props.put("enable.idempotence", true);  // 启用幂等性
        
        // 超时配置
        props.put("request.timeout.ms", 60000);
        props.put("delivery.timeout.ms", 120000);
        
        // 批处理配置（平衡性能和延迟）
        props.put("batch.size", 16384);  // 16KB
        props.put("linger.ms", 10);      // 等待10ms
        
        return props;
    }
    
    // 低延迟配置
    public static Properties getLowLatencyConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 低延迟优化
        props.put("batch.size", 1);      // 最小批次
        props.put("linger.ms", 0);       // 不等待
        props.put("compression.type", "none");  // 不压缩
        
        // 网络优化
        props.put("send.buffer.bytes", 131072);     // 128KB
        props.put("receive.buffer.bytes", 65536);   // 64KB
        
        // 可靠性配置
        props.put("acks", "1");
        props.put("retries", 0);  // 不重试以减少延迟
        
        return props;
    }
}
```

##### 2.2 配置参数详解

```properties
# 核心配置参数说明

# 连接配置
bootstrap.servers=kafka1:9092,kafka2:9092,kafka3:9092
client.id=my-producer-client

# 序列化配置
key.serializer=org.apache.kafka.common.serialization.StringSerializer
value.serializer=org.apache.kafka.common.serialization.StringSerializer

# 批处理配置
batch.size=16384          # 批次大小（字节）
linger.ms=0               # 等待时间（毫秒）
buffer.memory=33554432    # 缓冲区大小（字节）

# 压缩配置
compression.type=none     # 压缩类型：none, gzip, snappy, lz4, zstd

# 可靠性配置
acks=1                    # 确认级别：0, 1, all/-1
retries=2147483647        # 重试次数
retry.backoff.ms=100      # 重试间隔（毫秒）
request.timeout.ms=30000  # 请求超时（毫秒）
delivery.timeout.ms=120000 # 交付超时（毫秒）

# 幂等性配置
enable.idempotence=false  # 是否启用幂等性
max.in.flight.requests.per.connection=5  # 最大未确认请求数

# 分区配置
partitioner.class=org.apache.kafka.clients.producer.internals.DefaultPartitioner

# 拦截器配置
interceptor.classes=

# 网络配置
send.buffer.bytes=131072      # 发送缓冲区大小
receive.buffer.bytes=32768    # 接收缓冲区大小
connections.max.idle.ms=540000 # 连接最大空闲时间

# 元数据配置
metadata.max.age.ms=300000    # 元数据最大缓存时间
metadata.max.idle.ms=300000   # 元数据最大空闲时间
```

#### 3. 自定义分区器

##### 3.1 分区器接口实现

```java
/**
 * 自定义分区器示例
 */
public class CustomPartitioner implements Partitioner {
    
    private final AtomicInteger counter = new AtomicInteger(0);
    
    @Override
    public int partition(String topic, Object key, byte[] keyBytes, 
                        Object value, byte[] valueBytes, Cluster cluster) {
        
        List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
        int numPartitions = partitions.size();
        
        if (key == null) {
            // 无Key时使用轮询
            return counter.getAndIncrement() % numPartitions;
        }
        
        String keyStr = key.toString();
        
        // 基于Key前缀的分区策略
        if (keyStr.startsWith("VIP_")) {
            // VIP用户使用专用分区
            return 0;
        } else if (keyStr.startsWith("NORMAL_")) {
            // 普通用户使用其他分区
            return (Math.abs(keyStr.hashCode()) % (numPartitions - 1)) + 1;
        } else {
            // 默认哈希分区
            return Math.abs(keyStr.hashCode()) % numPartitions;
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

/**
 * 基于地理位置的分区器
 */
public class GeographicPartitioner implements Partitioner {
    
    private final Map<String, Integer> regionPartitionMap = new HashMap<>();
    
    @Override
    public void configure(Map<String, ?> configs) {
        // 配置地区到分区的映射
        regionPartitionMap.put("NORTH", 0);
        regionPartitionMap.put("SOUTH", 1);
        regionPartitionMap.put("EAST", 2);
        regionPartitionMap.put("WEST", 3);
    }
    
    @Override
    public int partition(String topic, Object key, byte[] keyBytes, 
                        Object value, byte[] valueBytes, Cluster cluster) {
        
        int numPartitions = cluster.partitionCountForTopic(topic);
        
        if (key == null) {
            return ThreadLocalRandom.current().nextInt(numPartitions);
        }
        
        String keyStr = key.toString();
        
        // 从Key中提取地区信息
        for (Map.Entry<String, Integer> entry : regionPartitionMap.entrySet()) {
            if (keyStr.contains(entry.getKey())) {
                int partition = entry.getValue();
                return partition < numPartitions ? partition : 
                    Math.abs(keyStr.hashCode()) % numPartitions;
            }
        }
        
        // 默认哈希分区
        return Math.abs(keyStr.hashCode()) % numPartitions;
    }
    
    @Override
    public void close() {
        regionPartitionMap.clear();
    }
}
```

##### 3.2 分区器使用示例

```java
/**
 * 使用自定义分区器的生产者
 */
public class CustomPartitionerProducer {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 指定自定义分区器
        props.put("partitioner.class", "com.example.CustomPartitioner");
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 测试不同类型的Key
        String[] testKeys = {
            "VIP_user001",
            "NORMAL_user002", 
            "ADMIN_user003",
            null
        };
        
        for (String key : testKeys) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "test-topic", key, "Message for key: " + key);
            
            producer.send(record, (metadata, exception) -> {
                if (exception == null) {
                    System.out.println("Key: " + key + 
                        ", Partition: " + metadata.partition() + 
                        ", Offset: " + metadata.offset());
                } else {
                    exception.printStackTrace();
                }
            });
        }
        
        producer.close();
    }
}
```

### 下午内容

#### 4. 生产者拦截器

##### 4.1 拦截器接口实现

```java
/**
 * 消息统计拦截器
 */
public class MessageStatsInterceptor implements ProducerInterceptor<String, String> {
    
    private final AtomicLong sentCount = new AtomicLong(0);
    private final AtomicLong ackCount = new AtomicLong(0);
    private final AtomicLong errorCount = new AtomicLong(0);
    private final Map<String, AtomicLong> topicStats = new ConcurrentHashMap<>();
    
    @Override
    public ProducerRecord<String, String> onSend(ProducerRecord<String, String> record) {
        // 发送前处理
        sentCount.incrementAndGet();
        
        // 统计各Topic的消息数量
        topicStats.computeIfAbsent(record.topic(), k -> new AtomicLong(0))
                  .incrementAndGet();
        
        // 添加时间戳头信息
        record.headers().add("send_time", 
            String.valueOf(System.currentTimeMillis()).getBytes());
        
        // 添加客户端ID
        record.headers().add("client_id", "producer-client-001".getBytes());
        
        System.out.println("Sending message to topic: " + record.topic() + 
            ", partition: " + record.partition() + 
            ", key: " + record.key());
        
        return record;
    }
    
    @Override
    public void onAcknowledgement(RecordMetadata metadata, Exception exception) {
        // 确认后处理
        if (exception == null) {
            ackCount.incrementAndGet();
            System.out.println("Message acknowledged: " + metadata.topic() + 
                "-" + metadata.partition() + "-" + metadata.offset());
        } else {
            errorCount.incrementAndGet();
            System.err.println("Message failed: " + exception.getMessage());
        }
    }
    
    @Override
    public void close() {
        // 输出统计信息
        System.out.println("=== Message Statistics ===");
        System.out.println("Total sent: " + sentCount.get());
        System.out.println("Total acknowledged: " + ackCount.get());
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

/**
 * 消息过滤拦截器
 */
public class MessageFilterInterceptor implements ProducerInterceptor<String, String> {
    
    private final Set<String> blockedWords = new HashSet<>();
    private final AtomicLong filteredCount = new AtomicLong(0);
    
    @Override
    public void configure(Map<String, ?> configs) {
        // 配置敏感词列表
        blockedWords.add("spam");
        blockedWords.add("advertisement");
        blockedWords.add("promotion");
    }
    
    @Override
    public ProducerRecord<String, String> onSend(ProducerRecord<String, String> record) {
        String value = record.value();
        
        // 检查消息内容
        if (value != null && containsBlockedWords(value.toLowerCase())) {
            filteredCount.incrementAndGet();
            System.out.println("Message filtered due to blocked content: " + record.key());
            return null;  // 返回null表示丢弃消息
        }
        
        return record;
    }
    
    @Override
    public void onAcknowledgement(RecordMetadata metadata, Exception exception) {
        // 不需要特殊处理
    }
    
    @Override
    public void close() {
        System.out.println("Filtered messages count: " + filteredCount.get());
    }
    
    private boolean containsBlockedWords(String content) {
        return blockedWords.stream().anyMatch(content::contains);
    }
}
```

##### 4.2 拦截器链配置

```java
/**
 * 使用拦截器链的生产者
 */
public class InterceptorChainProducer {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 配置拦截器链（按顺序执行）
        props.put("interceptor.classes", 
            "com.example.MessageFilterInterceptor,com.example.MessageStatsInterceptor");
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 发送测试消息
        String[] testMessages = {
            "Normal message",
            "This is spam content",
            "Valid business message",
            "Advertisement for products"
        };
        
        for (int i = 0; i < testMessages.length; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "test-topic", "key" + i, testMessages[i]);
            
            producer.send(record);
        }
        
        producer.close();  // 会触发拦截器的close()方法
    }
}
```

#### 5. 批处理和压缩优化

##### 5.1 批处理机制深入

```java
/**
 * 批处理优化示例
 */
public class BatchingOptimization {
    
    // 高吞吐量批处理配置
    public static void demonstrateHighThroughputBatching() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 批处理优化配置
        props.put("batch.size", 65536);      // 64KB批次
        props.put("linger.ms", 100);         // 等待100ms
        props.put("buffer.memory", 134217728); // 128MB缓冲区
        
        // 压缩配置
        props.put("compression.type", "lz4");
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        long startTime = System.currentTimeMillis();
        int messageCount = 100000;
        
        for (int i = 0; i < messageCount; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "batch-test-topic", 
                "key" + i, 
                "This is message number " + i + " with some additional content to increase size");
            
            producer.send(record);
            
            // 每10000条消息输出进度
            if (i % 10000 == 0) {
                System.out.println("Sent " + i + " messages");
            }
        }
        
        producer.close();
        
        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        double throughput = (double) messageCount / duration * 1000;
        
        System.out.println("Sent " + messageCount + " messages in " + duration + "ms");
        System.out.println("Throughput: " + String.format("%.2f", throughput) + " messages/second");
    }
    
    // 低延迟配置
    public static void demonstrateLowLatencyConfig() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 低延迟配置
        props.put("batch.size", 1);          // 最小批次
        props.put("linger.ms", 0);           // 不等待
        props.put("compression.type", "none"); // 不压缩
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 测试延迟
        for (int i = 0; i < 10; i++) {
            long sendTime = System.currentTimeMillis();
            
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "latency-test-topic", "key" + i, "Low latency message " + i);
            
            producer.send(record, (metadata, exception) -> {
                if (exception == null) {
                    long ackTime = System.currentTimeMillis();
                    System.out.println("Message " + i + " latency: " + (ackTime - sendTime) + "ms");
                }
            });
        }
        
        producer.close();
    }
}
```

##### 5.2 压缩算法对比

```java
/**
 * 压缩算法性能测试
 */
public class CompressionBenchmark {
    
    private static final String[] COMPRESSION_TYPES = {"none", "gzip", "snappy", "lz4", "zstd"};
    private static final String TEST_TOPIC = "compression-test";
    private static final int MESSAGE_COUNT = 10000;
    
    public static void main(String[] args) {
        for (String compressionType : COMPRESSION_TYPES) {
            testCompressionType(compressionType);
        }
    }
    
    private static void testCompressionType(String compressionType) {
        System.out.println("\n=== Testing compression type: " + compressionType + " ===");
        
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 设置压缩类型
        props.put("compression.type", compressionType);
        
        // 批处理配置
        props.put("batch.size", 16384);
        props.put("linger.ms", 10);
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 生成测试数据（包含重复内容以测试压缩效果）
        String baseMessage = "This is a test message with repeated content. " +
            "The quick brown fox jumps over the lazy dog. " +
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
        
        long startTime = System.currentTimeMillis();
        
        for (int i = 0; i < MESSAGE_COUNT; i++) {
            String message = baseMessage + " Message number: " + i;
            ProducerRecord<String, String> record = new ProducerRecord<>(
                TEST_TOPIC + "-" + compressionType, "key" + i, message);
            
            producer.send(record);
        }
        
        producer.close();
        
        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        
        System.out.println("Compression: " + compressionType);
        System.out.println("Duration: " + duration + "ms");
        System.out.println("Throughput: " + (MESSAGE_COUNT * 1000.0 / duration) + " msg/sec");
    }
}
```

#### 6. 生产者性能监控

##### 6.1 JMX指标监控

```java
/**
 * 生产者JMX指标监控
 */
public class ProducerMetricsMonitor {
    
    private final KafkaProducer<String, String> producer;
    private final ScheduledExecutorService scheduler;
    
    public ProducerMetricsMonitor(KafkaProducer<String, String> producer) {
        this.producer = producer;
        this.scheduler = Executors.newScheduledThreadPool(1);
    }
    
    public void startMonitoring() {
        scheduler.scheduleAtFixedRate(this::printMetrics, 0, 10, TimeUnit.SECONDS);
    }
    
    private void printMetrics() {
        Map<MetricName, ? extends Metric> metrics = producer.metrics();
        
        System.out.println("\n=== Producer Metrics ===");
        System.out.println("Timestamp: " + new Date());
        
        // 记录发送指标
        printMetric(metrics, "record-send-rate", "Records sent per second");
        printMetric(metrics, "record-send-total", "Total records sent");
        printMetric(metrics, "record-error-rate", "Record errors per second");
        printMetric(metrics, "record-error-total", "Total record errors");
        
        // 批处理指标
        printMetric(metrics, "batch-size-avg", "Average batch size");
        printMetric(metrics, "batch-size-max", "Maximum batch size");
        printMetric(metrics, "records-per-request-avg", "Average records per request");
        
        // 延迟指标
        printMetric(metrics, "record-queue-time-avg", "Average queue time (ms)");
        printMetric(metrics, "record-queue-time-max", "Maximum queue time (ms)");
        printMetric(metrics, "request-latency-avg", "Average request latency (ms)");
        printMetric(metrics, "request-latency-max", "Maximum request latency (ms)");
        
        // 缓冲区指标
        printMetric(metrics, "buffer-available-bytes", "Available buffer bytes");
        printMetric(metrics, "buffer-exhausted-rate", "Buffer exhausted rate");
        
        // 网络指标
        printMetric(metrics, "outgoing-byte-rate", "Outgoing bytes per second");
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
                System.out.println(String.format("  %-30s: %10.2f (%s)", 
                    description, value, metricName));
            });
    }
    
    public void stopMonitoring() {
        scheduler.shutdown();
    }
}

/**
 * 使用监控的生产者示例
 */
public class MonitoredProducerExample {
    
    public static void main(String[] args) throws InterruptedException {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        ProducerMetricsMonitor monitor = new ProducerMetricsMonitor(producer);
        
        // 启动监控
        monitor.startMonitoring();
        
        // 发送消息
        for (int i = 0; i < 1000; i++) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                "monitored-topic", "key" + i, "Message " + i);
            
            producer.send(record);
            
            if (i % 100 == 0) {
                Thread.sleep(1000);  // 模拟间歇性发送
            }
        }
        
        // 等待一段时间观察指标
        Thread.sleep(30000);
        
        monitor.stopMonitoring();
        producer.close();
    }
}
```

##### 6.2 自定义指标收集

```java
/**
 * 自定义生产者指标收集器
 */
public class CustomProducerMetrics {
    
    private final AtomicLong totalSent = new AtomicLong(0);
    private final AtomicLong totalErrors = new AtomicLong(0);
    private final AtomicLong totalBytes = new AtomicLong(0);
    private final Map<String, AtomicLong> topicMetrics = new ConcurrentHashMap<>();
    private final List<Long> latencies = new CopyOnWriteArrayList<>();
    
    public void recordSent(String topic, int bytes) {
        totalSent.incrementAndGet();
        totalBytes.addAndGet(bytes);
        topicMetrics.computeIfAbsent(topic, k -> new AtomicLong(0)).incrementAndGet();
    }
    
    public void recordError(String topic) {
        totalErrors.incrementAndGet();
    }
    
    public void recordLatency(long latencyMs) {
        latencies.add(latencyMs);
        // 保持最近1000个延迟记录
        if (latencies.size() > 1000) {
            latencies.remove(0);
        }
    }
    
    public void printSummary() {
        System.out.println("\n=== Custom Producer Metrics Summary ===");
        System.out.println("Total messages sent: " + totalSent.get());
        System.out.println("Total errors: " + totalErrors.get());
        System.out.println("Total bytes sent: " + totalBytes.get());
        System.out.println("Success rate: " + 
            String.format("%.2f%%", (double) totalSent.get() / (totalSent.get() + totalErrors.get()) * 100));
        
        if (!latencies.isEmpty()) {
            double avgLatency = latencies.stream().mapToLong(Long::longValue).average().orElse(0.0);
            long maxLatency = latencies.stream().mapToLong(Long::longValue).max().orElse(0L);
            long minLatency = latencies.stream().mapToLong(Long::longValue).min().orElse(0L);
            
            System.out.println("Average latency: " + String.format("%.2f ms", avgLatency));
            System.out.println("Min latency: " + minLatency + " ms");
            System.out.println("Max latency: " + maxLatency + " ms");
        }
        
        System.out.println("\nPer-topic metrics:");
        topicMetrics.forEach((topic, count) -> 
            System.out.println("  " + topic + ": " + count.get() + " messages"));
    }
}
```

## 实战案例

### 案例1：电商订单系统生产者优化

```java
/**
 * 电商订单系统的生产者实现
 * 要求：高可靠性、消息顺序、性能监控
 */
public class ECommerceOrderProducer {
    
    private final KafkaProducer<String, String> producer;
    private final CustomProducerMetrics metrics;
    private final String orderTopic = "order-events";
    
    public ECommerceOrderProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 高可靠性配置
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
        props.put("enable.idempotence", true);
        
        // 性能优化配置
        props.put("batch.size", 32768);  // 32KB
        props.put("linger.ms", 50);      // 50ms等待
        props.put("compression.type", "lz4");
        
        // 超时配置
        props.put("request.timeout.ms", 30000);
        props.put("delivery.timeout.ms", 60000);
        
        // 自定义分区器
        props.put("partitioner.class", "com.ecommerce.OrderPartitioner");
        
        this.producer = new KafkaProducer<>(props);
        this.metrics = new CustomProducerMetrics();
    }
    
    public void sendOrderEvent(OrderEvent event) {
        String orderId = event.getOrderId();
        String eventJson = JsonUtils.toJson(event);
        
        ProducerRecord<String, String> record = new ProducerRecord<>(
            orderTopic, 
            orderId,  // 使用订单ID作为Key确保同一订单的消息在同一分区
            eventJson
        );
        
        // 添加元数据
        record.headers().add("event_type", event.getEventType().getBytes());
        record.headers().add("timestamp", String.valueOf(event.getTimestamp()).getBytes());
        record.headers().add("user_id", event.getUserId().getBytes());
        
        long sendTime = System.currentTimeMillis();
        
        producer.send(record, (metadata, exception) -> {
            long ackTime = System.currentTimeMillis();
            long latency = ackTime - sendTime;
            
            if (exception == null) {
                metrics.recordSent(orderTopic, eventJson.getBytes().length);
                metrics.recordLatency(latency);
                
                System.out.println("Order event sent successfully: " + orderId + 
                    ", partition: " + metadata.partition() + 
                    ", offset: " + metadata.offset() + 
                    ", latency: " + latency + "ms");
            } else {
                metrics.recordError(orderTopic);
                System.err.println("Failed to send order event: " + orderId + 
                    ", error: " + exception.getMessage());
                
                // 可以实现重试逻辑或者发送到死信队列
                handleSendFailure(event, exception);
            }
        });
    }
    
    private void handleSendFailure(OrderEvent event, Exception exception) {
        // 记录失败事件到本地存储或死信队列
        System.err.println("Handling send failure for order: " + event.getOrderId());
        // 实现具体的失败处理逻辑
    }
    
    public void close() {
        producer.close();
        metrics.printSummary();
    }
}
```

### 案例2：日志聚合系统生产者

```java
/**
 * 日志聚合系统的高性能生产者
 * 要求：高吞吐量、批处理优化、异步发送
 */
public class LogAggregationProducer {
    
    private final KafkaProducer<String, String> producer;
    private final String logTopic = "application-logs";
    private final BlockingQueue<LogEntry> logQueue;
    private final ExecutorService executorService;
    private volatile boolean running = true;
    
    public LogAggregationProducer() {
        Properties props = new Properties();
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 高吞吐量配置
        props.put("acks", "1");  // 只需要Leader确认
        props.put("retries", 3);
        props.put("batch.size", 65536);  // 64KB批次
        props.put("linger.ms", 100);     // 100ms等待
        props.put("buffer.memory", 134217728);  // 128MB缓冲区
        props.put("compression.type", "lz4");
        
        // 网络优化
        props.put("send.buffer.bytes", 131072);
        props.put("receive.buffer.bytes", 65536);
        
        this.producer = new KafkaProducer<>(props);
        this.logQueue = new LinkedBlockingQueue<>(10000);
        this.executorService = Executors.newFixedThreadPool(2);
        
        // 启动后台发送线程
        startBackgroundSender();
    }
    
    private void startBackgroundSender() {
        executorService.submit(() -> {
            while (running || !logQueue.isEmpty()) {
                try {
                    LogEntry logEntry = logQueue.poll(1, TimeUnit.SECONDS);
                    if (logEntry != null) {
                        sendLogEntry(logEntry);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        });
    }
    
    public boolean submitLog(LogEntry logEntry) {
        return logQueue.offer(logEntry);
    }
    
    private void sendLogEntry(LogEntry logEntry) {
        String key = logEntry.getApplicationName() + "-" + logEntry.getLevel();
        String value = JsonUtils.toJson(logEntry);
        
        ProducerRecord<String, String> record = new ProducerRecord<>(
            logTopic, key, value);
        
        // 添加日志元数据
        record.headers().add("app_name", logEntry.getApplicationName().getBytes());
        record.headers().add("log_level", logEntry.getLevel().getBytes());
        record.headers().add("host", logEntry.getHostname().getBytes());
        
        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                System.err.println("Failed to send log entry: " + exception.getMessage());
                // 可以选择重新入队或丢弃
            }
        });
    }
    
    public void shutdown() {
        running = false;
        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(10, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException e) {
            executorService.shutdownNow();
        }
        producer.close();
    }
}
```

## 实战练习

### 练习1：自定义分区器实现
1. 实现基于消息内容的智能分区器
2. 测试分区均匀性和性能影响
3. 对比默认分区器的效果

### 练习2：拦截器链开发
1. 实现消息加密拦截器
2. 开发性能监控拦截器
3. 测试拦截器对性能的影响

### 练习3：批处理优化测试
1. 测试不同批处理参数的性能表现
2. 分析延迟和吞吐量的权衡
3. 找出最优配置参数

## 作业

1. **生产者性能调优**：
   - 为不同业务场景设计最优配置
   - 实现自适应批处理机制
   - 开发性能基准测试工具

2. **自定义组件开发**：
   - 实现业务相关的分区器
   - 开发消息处理拦截器
   - 创建自定义序列化器

3. **监控系统构建**：
   - 实现全面的生产者监控
   - 开发告警机制
   - 创建性能分析报告

4. **故障处理机制**：
   - 设计生产者故障恢复策略
   - 实现消息重试和死信处理
   - 开发故障诊断工具

## 总结

本节课深入学习了Kafka生产者的高级特性，包括：
- 生产者内部架构和工作机制
- 配置参数的详细说明和优化策略
- 自定义分区器和拦截器的实现
- 批处理和压缩机制的优化
- 性能监控和故障排查方法

掌握这些知识对于构建高性能、高可靠性的Kafka应用至关重要，需要根据具体业务需求选择合适的配置和实现策略。