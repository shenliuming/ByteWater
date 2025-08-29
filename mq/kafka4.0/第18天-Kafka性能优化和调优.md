# 第18天：Kafka性能优化和调优

## 课程目标

通过本节课的学习，你将掌握：
1. Kafka集群性能分析和诊断方法
2. 生产者和消费者性能优化策略
3. 存储和网络优化技术
4. JVM调优和系统参数配置
5. 性能监控和基准测试方法
6. 实际生产环境的性能调优案例

## 1. Kafka性能分析基础

### 1.1 性能指标体系

```java
// Kafka性能指标收集器
@Component
public class KafkaPerformanceMetricsCollector {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaPerformanceMetricsCollector.class);
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    @Autowired
    private AdminClient adminClient;
    
    // 吞吐量指标
    private final Counter messagesProduced = Counter.builder("kafka.messages.produced")
        .description("Total messages produced")
        .register(meterRegistry);
    
    private final Counter messagesConsumed = Counter.builder("kafka.messages.consumed")
        .description("Total messages consumed")
        .register(meterRegistry);
    
    private final Timer producerLatency = Timer.builder("kafka.producer.latency")
        .description("Producer latency")
        .register(meterRegistry);
    
    private final Timer consumerLatency = Timer.builder("kafka.consumer.latency")
        .description("Consumer latency")
        .register(meterRegistry);
    
    // 集群健康指标
    private final Gauge brokerCount = Gauge.builder("kafka.cluster.brokers")
        .description("Number of active brokers")
        .register(meterRegistry, this, KafkaPerformanceMetricsCollector::getActiveBrokerCount);
    
    private final Gauge topicCount = Gauge.builder("kafka.cluster.topics")
        .description("Number of topics")
        .register(meterRegistry, this, KafkaPerformanceMetricsCollector::getTopicCount);
    
    // 资源使用指标
    private final Gauge diskUsage = Gauge.builder("kafka.disk.usage")
        .description("Disk usage percentage")
        .register(meterRegistry, this, KafkaPerformanceMetricsCollector::getDiskUsage);
    
    private final Gauge memoryUsage = Gauge.builder("kafka.memory.usage")
        .description("Memory usage percentage")
        .register(meterRegistry, this, KafkaPerformanceMetricsCollector::getMemoryUsage);
    
    // 收集生产者性能指标
    public void recordProducerMetrics(String topic, int partition, long latency, int messageSize) {
        messagesProduced.increment();
        producerLatency.record(latency, TimeUnit.MILLISECONDS);
        
        // 记录按主题分组的指标
        Counter.builder("kafka.messages.produced.by.topic")
            .tag("topic", topic)
            .register(meterRegistry)
            .increment();
        
        // 记录消息大小分布
        DistributionSummary.builder("kafka.message.size")
            .tag("type", "producer")
            .register(meterRegistry)
            .record(messageSize);
    }
    
    // 收集消费者性能指标
    public void recordConsumerMetrics(String topic, int partition, long latency, long lag) {
        messagesConsumed.increment();
        consumerLatency.record(latency, TimeUnit.MILLISECONDS);
        
        // 记录消费延迟
        Gauge.builder("kafka.consumer.lag")
            .tag("topic", topic)
            .tag("partition", String.valueOf(partition))
            .register(meterRegistry, () -> lag);
    }
    
    // 获取活跃Broker数量
    private double getActiveBrokerCount() {
        try {
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            return clusterResult.nodes().get().size();
        } catch (Exception e) {
            logger.error("Failed to get broker count", e);
            return 0;
        }
    }
    
    // 获取主题数量
    private double getTopicCount() {
        try {
            ListTopicsResult topicsResult = adminClient.listTopics();
            return topicsResult.names().get().size();
        } catch (Exception e) {
            logger.error("Failed to get topic count", e);
            return 0;
        }
    }
    
    // 获取磁盘使用率
    private double getDiskUsage() {
        try {
            File dataDir = new File("/var/kafka-logs");
            long totalSpace = dataDir.getTotalSpace();
            long freeSpace = dataDir.getFreeSpace();
            return ((double) (totalSpace - freeSpace) / totalSpace) * 100;
        } catch (Exception e) {
            logger.error("Failed to get disk usage", e);
            return 0;
        }
    }
    
    // 获取内存使用率
    private double getMemoryUsage() {
        Runtime runtime = Runtime.getRuntime();
        long totalMemory = runtime.totalMemory();
        long freeMemory = runtime.freeMemory();
        return ((double) (totalMemory - freeMemory) / totalMemory) * 100;
    }
    
    // 生成性能报告
    @Scheduled(fixedRate = 300000) // 每5分钟生成一次报告
    public void generatePerformanceReport() {
        PerformanceReport report = new PerformanceReport();
        
        // 收集当前指标
        report.setTimestamp(System.currentTimeMillis());
        report.setBrokerCount((int) getActiveBrokerCount());
        report.setTopicCount((int) getTopicCount());
        report.setDiskUsage(getDiskUsage());
        report.setMemoryUsage(getMemoryUsage());
        
        // 计算吞吐量
        double producerThroughput = messagesProduced.count() / 300.0; // 每秒消息数
        double consumerThroughput = messagesConsumed.count() / 300.0;
        
        report.setProducerThroughput(producerThroughput);
        report.setConsumerThroughput(consumerThroughput);
        
        // 计算平均延迟
        report.setAvgProducerLatency(producerLatency.mean(TimeUnit.MILLISECONDS));
        report.setAvgConsumerLatency(consumerLatency.mean(TimeUnit.MILLISECONDS));
        
        logger.info("Performance Report: {}", report);
        
        // 检查性能告警
        checkPerformanceAlerts(report);
    }
    
    // 性能告警检查
    private void checkPerformanceAlerts(PerformanceReport report) {
        List<String> alerts = new ArrayList<>();
        
        // 检查磁盘使用率
        if (report.getDiskUsage() > 80) {
            alerts.add(String.format("High disk usage: %.2f%%", report.getDiskUsage()));
        }
        
        // 检查内存使用率
        if (report.getMemoryUsage() > 85) {
            alerts.add(String.format("High memory usage: %.2f%%", report.getMemoryUsage()));
        }
        
        // 检查生产者延迟
        if (report.getAvgProducerLatency() > 100) {
            alerts.add(String.format("High producer latency: %.2f ms", report.getAvgProducerLatency()));
        }
        
        // 检查消费者延迟
        if (report.getAvgConsumerLatency() > 200) {
            alerts.add(String.format("High consumer latency: %.2f ms", report.getAvgConsumerLatency()));
        }
        
        // 检查吞吐量下降
        if (report.getProducerThroughput() < 100) {
            alerts.add(String.format("Low producer throughput: %.2f msg/s", report.getProducerThroughput()));
        }
        
        if (!alerts.isEmpty()) {
            logger.warn("Performance alerts detected: {}", String.join(", ", alerts));
            // 这里可以集成告警系统，如发送邮件、短信等
        }
    }
}

// 智能消费者服务
@Service
public class SmartConsumerService {
    
    private static final Logger logger = LoggerFactory.getLogger(SmartConsumerService.class);
    
    @Autowired
    private KafkaPerformanceMetricsCollector metricsCollector;
    
    // 批量消息处理
    @KafkaListener(
        topics = "high-throughput-topic",
        containerFactory = "batchConsumerListenerContainerFactory"
    )
    public void handleBatchMessages(List<ConsumerRecord<String, Object>> records, 
                                  Acknowledgment ack) {
        long startTime = System.nanoTime();
        
        try {
            // 批量处理消息
            List<Object> processedMessages = new ArrayList<>();
            
            for (ConsumerRecord<String, Object> record : records) {
                // 处理单条消息
                Object processedMessage = processMessage(record.value());
                processedMessages.add(processedMessage);
                
                // 记录消费指标
                long latency = (System.nanoTime() - startTime) / 1_000_000;
                metricsCollector.recordConsumerMetrics(
                    record.topic(), 
                    record.partition(), 
                    latency, 
                    0 // 批量处理时lag计算复杂，这里简化
                );
            }
            
            // 批量保存到数据库或其他存储
            batchSaveMessages(processedMessages);
            
            // 手动确认偏移量
            ack.acknowledge();
            
            logger.info("Processed batch of {} messages", records.size());
            
        } catch (Exception e) {
            logger.error("Error processing batch messages", e);
            // 这里可以实现重试逻辑或将消息发送到死信队列
        }
    }
    
    // 单条消息处理（低延迟）
    @KafkaListener(
        topics = "low-latency-topic",
        containerFactory = "singleConsumerListenerContainerFactory"
    )
    public void handleSingleMessage(ConsumerRecord<String, Object> record) {
        long startTime = System.nanoTime();
        
        try {
            // 处理消息
            Object processedMessage = processMessage(record.value());
            
            // 立即保存
            saveMessage(processedMessage);
            
            // 记录性能指标
            long latency = (System.nanoTime() - startTime) / 1_000_000;
            metricsCollector.recordConsumerMetrics(
                record.topic(), 
                record.partition(), 
                latency, 
                0
            );
            
        } catch (Exception e) {
            logger.error("Error processing single message", e);
            throw e; // 让Spring Kafka处理重试
        }
    }
    
    // 处理单条消息的业务逻辑
    private Object processMessage(Object message) {
        // 模拟业务处理
        try {
            Thread.sleep(10); // 模拟10ms的处理时间
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        return message;
    }
    
    // 批量保存消息
    private void batchSaveMessages(List<Object> messages) {
        // 模拟批量数据库操作
        logger.debug("Batch saving {} messages", messages.size());
    }
    
    // 保存单条消息
    private void saveMessage(Object message) {
        // 模拟单条数据库操作
        logger.debug("Saving single message");
    }
}
```

## 4. 存储和网络优化

### 4.1 存储优化配置

```java
// Kafka存储优化配置
@Configuration
public class KafkaStorageOptimizationConfig {
    
    // 存储优化参数
    public static class StorageConfig {
        // 日志段大小优化
        public static final String LOG_SEGMENT_BYTES = "log.segment.bytes";
        public static final String LOG_SEGMENT_MS = "log.segment.ms";
        
        // 日志保留策略
        public static final String LOG_RETENTION_HOURS = "log.retention.hours";
        public static final String LOG_RETENTION_BYTES = "log.retention.bytes";
        
        // 日志压缩配置
        public static final String LOG_CLEANUP_POLICY = "log.cleanup.policy";
        public static final String LOG_CLEANER_ENABLE = "log.cleaner.enable";
        public static final String LOG_CLEANER_THREADS = "log.cleaner.threads";
        
        // 索引优化
        public static final String LOG_INDEX_SIZE_MAX_BYTES = "log.index.size.max.bytes";
        public static final String LOG_INDEX_INTERVAL_BYTES = "log.index.interval.bytes";
    }
    
    // 存储监控服务
    @Bean
    public StorageMonitoringService storageMonitoringService() {
        return new StorageMonitoringService();
    }
}

// 存储监控服务
@Service
public class StorageMonitoringService {
    
    private static final Logger logger = LoggerFactory.getLogger(StorageMonitoringService.class);
    
    @Value("${kafka.log.dirs:/var/kafka-logs}")
    private String logDirs;
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    // 磁盘使用率监控
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void monitorDiskUsage() {
        try {
            String[] dirs = logDirs.split(",");
            
            for (String dir : dirs) {
                File logDir = new File(dir.trim());
                if (logDir.exists()) {
                    long totalSpace = logDir.getTotalSpace();
                    long freeSpace = logDir.getFreeSpace();
                    long usedSpace = totalSpace - freeSpace;
                    
                    double usagePercentage = (double) usedSpace / totalSpace * 100;
                    
                    // 记录指标
                    Gauge.builder("kafka.disk.usage.percentage")
                        .tag("directory", dir)
                        .register(meterRegistry, () -> usagePercentage);
                    
                    Gauge.builder("kafka.disk.free.bytes")
                        .tag("directory", dir)
                        .register(meterRegistry, () -> freeSpace);
                    
                    // 检查告警阈值
                    if (usagePercentage > 85) {
                        logger.warn("High disk usage in {}: {:.2f}%", dir, usagePercentage);
                    }
                    
                    if (usagePercentage > 95) {
                        logger.error("Critical disk usage in {}: {:.2f}%", dir, usagePercentage);
                        // 这里可以触发自动清理或告警
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Error monitoring disk usage", e);
        }
    }
    
    // 日志段监控
    @Scheduled(fixedRate = 300000) // 每5分钟检查一次
    public void monitorLogSegments() {
        try {
            String[] dirs = logDirs.split(",");
            
            for (String dir : dirs) {
                File logDir = new File(dir.trim());
                if (logDir.exists()) {
                    monitorDirectorySegments(logDir);
                }
            }
        } catch (Exception e) {
            logger.error("Error monitoring log segments", e);
        }
    }
    
    private void monitorDirectorySegments(File logDir) {
        File[] topicDirs = logDir.listFiles(File::isDirectory);
        if (topicDirs == null) return;
        
        for (File topicDir : topicDirs) {
            String topicName = extractTopicName(topicDir.getName());
            
            // 统计日志文件
            File[] logFiles = topicDir.listFiles((dir, name) -> name.endsWith(".log"));
            File[] indexFiles = topicDir.listFiles((dir, name) -> name.endsWith(".index"));
            
            if (logFiles != null && indexFiles != null) {
                long totalLogSize = Arrays.stream(logFiles)
                    .mapToLong(File::length)
                    .sum();
                
                long totalIndexSize = Arrays.stream(indexFiles)
                    .mapToLong(File::length)
                    .sum();
                
                // 记录指标
                Gauge.builder("kafka.topic.log.size.bytes")
                    .tag("topic", topicName)
                    .register(meterRegistry, () -> totalLogSize);
                
                Gauge.builder("kafka.topic.index.size.bytes")
                    .tag("topic", topicName)
                    .register(meterRegistry, () -> totalIndexSize);
                
                Gauge.builder("kafka.topic.segment.count")
                    .tag("topic", topicName)
                    .register(meterRegistry, () -> logFiles.length);
                
                logger.debug("Topic {}: {} segments, {} log bytes, {} index bytes", 
                    topicName, logFiles.length, totalLogSize, totalIndexSize);
            }
        }
    }
    
    private String extractTopicName(String dirName) {
        // 目录名格式通常是 "topic-partition"
        int lastDash = dirName.lastIndexOf('-');
        return lastDash > 0 ? dirName.substring(0, lastDash) : dirName;
    }
    
    // 存储清理建议
    public List<StorageOptimizationRecommendation> getStorageOptimizationRecommendations() {
        List<StorageOptimizationRecommendation> recommendations = new ArrayList<>();
        
        try {
            String[] dirs = logDirs.split(",");
            
            for (String dir : dirs) {
                File logDir = new File(dir.trim());
                if (logDir.exists()) {
                    analyzeDirectoryForOptimization(logDir, recommendations);
                }
            }
        } catch (Exception e) {
            logger.error("Error generating storage optimization recommendations", e);
        }
        
        return recommendations;
    }
    
    private void analyzeDirectoryForOptimization(File logDir, 
                                               List<StorageOptimizationRecommendation> recommendations) {
        long totalSpace = logDir.getTotalSpace();
        long freeSpace = logDir.getFreeSpace();
        double usagePercentage = (double) (totalSpace - freeSpace) / totalSpace * 100;
        
        // 磁盘使用率建议
        if (usagePercentage > 80) {
            recommendations.add(new StorageOptimizationRecommendation(
                "HIGH_DISK_USAGE",
                String.format("Disk usage is %.2f%% in %s", usagePercentage, logDir.getPath()),
                "Consider increasing log retention cleanup frequency or reducing retention period"
            ));
        }
        
        // 分析主题目录
        File[] topicDirs = logDir.listFiles(File::isDirectory);
        if (topicDirs != null) {
            for (File topicDir : topicDirs) {
                analyzeTopicDirectory(topicDir, recommendations);
            }
        }
    }
    
    private void analyzeTopicDirectory(File topicDir, 
                                     List<StorageOptimizationRecommendation> recommendations) {
        String topicName = extractTopicName(topicDir.getName());
        
        // 检查段文件数量
        File[] logFiles = topicDir.listFiles((dir, name) -> name.endsWith(".log"));
        if (logFiles != null && logFiles.length > 100) {
            recommendations.add(new StorageOptimizationRecommendation(
                "TOO_MANY_SEGMENTS",
                String.format("Topic %s has %d segments", topicName, logFiles.length),
                "Consider increasing log.segment.bytes or log.segment.ms to reduce segment count"
            ));
        }
        
        // 检查小文件问题
        if (logFiles != null) {
            long avgSegmentSize = Arrays.stream(logFiles)
                .mapToLong(File::length)
                .sum() / logFiles.length;
            
            if (avgSegmentSize < 64 * 1024 * 1024) { // 小于64MB
                recommendations.add(new StorageOptimizationRecommendation(
                    "SMALL_SEGMENTS",
                    String.format("Topic %s has small average segment size: %d bytes", 
                        topicName, avgSegmentSize),
                    "Consider increasing log.segment.bytes to improve I/O efficiency"
                ));
            }
        }
    }
}

// 存储优化建议实体
public class StorageOptimizationRecommendation {
    private String type;
    private String description;
    private String recommendation;
    
    public StorageOptimizationRecommendation(String type, String description, String recommendation) {
        this.type = type;
        this.description = description;
        this.recommendation = recommendation;
    }
    
    // Getter和Setter方法
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }
    
    @Override
    public String toString() {
        return String.format("[%s] %s - %s", type, description, recommendation);
    }
}
```

### 4.2 网络优化配置

```java
// 网络优化配置
@Configuration
public class KafkaNetworkOptimizationConfig {
    
    // 网络优化参数
    public static class NetworkConfig {
        // Socket缓冲区大小
        public static final String SOCKET_SEND_BUFFER_BYTES = "socket.send.buffer.bytes";
        public static final String SOCKET_RECEIVE_BUFFER_BYTES = "socket.receive.buffer.bytes";
        
        // 网络线程配置
        public static final String NUM_NETWORK_THREADS = "num.network.threads";
        public static final String NUM_IO_THREADS = "num.io.threads";
        
        // 请求处理配置
        public static final String QUEUED_MAX_REQUESTS = "queued.max.requests";
        public static final String REQUEST_TIMEOUT_MS = "request.timeout.ms";
        
        // 连接配置
        public static final String CONNECTIONS_MAX_IDLE_MS = "connections.max.idle.ms";
        public static final String MAX_CONNECTIONS_PER_IP = "max.connections.per.ip";
    }
    
    // 网络监控服务
    @Bean
    public NetworkMonitoringService networkMonitoringService() {
        return new NetworkMonitoringService();
    }
}

// 网络监控服务
@Service
public class NetworkMonitoringService {
    
    private static final Logger logger = LoggerFactory.getLogger(NetworkMonitoringService.class);
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    // 网络连接监控
    @Scheduled(fixedRate = 30000) // 每30秒检查一次
    public void monitorNetworkConnections() {
        try {
            // 获取网络连接统计
            NetworkConnectionStats stats = getNetworkConnectionStats();
            
            // 记录指标
            Gauge.builder("kafka.network.connections.active")
                .register(meterRegistry, () -> stats.getActiveConnections());
            
            Gauge.builder("kafka.network.connections.idle")
                .register(meterRegistry, () -> stats.getIdleConnections());
            
            Gauge.builder("kafka.network.bytes.sent.rate")
                .register(meterRegistry, () -> stats.getBytesSentRate());
            
            Gauge.builder("kafka.network.bytes.received.rate")
                .register(meterRegistry, () -> stats.getBytesReceivedRate());
            
            // 检查告警条件
            if (stats.getActiveConnections() > 1000) {
                logger.warn("High number of active connections: {}", stats.getActiveConnections());
            }
            
            if (stats.getBytesSentRate() > 100 * 1024 * 1024) { // 100MB/s
                logger.info("High network send rate: {} bytes/s", stats.getBytesSentRate());
            }
            
        } catch (Exception e) {
            logger.error("Error monitoring network connections", e);
        }
    }
    
    // 获取网络连接统计（模拟实现）
    private NetworkConnectionStats getNetworkConnectionStats() {
        // 在实际实现中，这里会调用系统API或JMX来获取真实的网络统计
        NetworkConnectionStats stats = new NetworkConnectionStats();
        
        // 模拟数据
        stats.setActiveConnections((int) (Math.random() * 100 + 50));
        stats.setIdleConnections((int) (Math.random() * 20 + 10));
        stats.setBytesSentRate((long) (Math.random() * 50 * 1024 * 1024)); // 0-50MB/s
        stats.setBytesReceivedRate((long) (Math.random() * 30 * 1024 * 1024)); // 0-30MB/s
        
        return stats;
    }
    
    // 网络延迟测试
    public NetworkLatencyTestResult testNetworkLatency(String brokerHost, int brokerPort) {
        NetworkLatencyTestResult result = new NetworkLatencyTestResult();
        result.setBrokerHost(brokerHost);
        result.setBrokerPort(brokerPort);
        
        List<Long> latencies = new ArrayList<>();
        int testCount = 10;
        
        for (int i = 0; i < testCount; i++) {
            try {
                long startTime = System.nanoTime();
                
                // 创建Socket连接测试延迟
                try (Socket socket = new Socket()) {
                    socket.connect(new InetSocketAddress(brokerHost, brokerPort), 5000);
                    long endTime = System.nanoTime();
                    long latency = (endTime - startTime) / 1_000_000; // 转换为毫秒
                    latencies.add(latency);
                }
                
                Thread.sleep(100); // 间隔100ms
                
            } catch (Exception e) {
                logger.error("Error testing network latency to {}:{}", brokerHost, brokerPort, e);
                result.setErrorMessage(e.getMessage());
                return result;
            }
        }
        
        // 计算统计信息
        latencies.sort(Long::compareTo);
        result.setMinLatency(latencies.get(0));
        result.setMaxLatency(latencies.get(latencies.size() - 1));
        result.setAvgLatency(latencies.stream().mapToLong(Long::longValue).average().orElse(0));
        result.setP50Latency(latencies.get(latencies.size() / 2));
        result.setP95Latency(latencies.get((int) (latencies.size() * 0.95)));
        
        result.setSuccessful(true);
        return result;
    }
}

// 网络连接统计实体
public class NetworkConnectionStats {
    private int activeConnections;
    private int idleConnections;
    private long bytesSentRate;
    private long bytesReceivedRate;
    
    // Getter和Setter方法
    public int getActiveConnections() { return activeConnections; }
    public void setActiveConnections(int activeConnections) { this.activeConnections = activeConnections; }
    
    public int getIdleConnections() { return idleConnections; }
    public void setIdleConnections(int idleConnections) { this.idleConnections = idleConnections; }
    
    public long getBytesSentRate() { return bytesSentRate; }
    public void setBytesSentRate(long bytesSentRate) { this.bytesSentRate = bytesSentRate; }
    
    public long getBytesReceivedRate() { return bytesReceivedRate; }
    public void setBytesReceivedRate(long bytesReceivedRate) { this.bytesReceivedRate = bytesReceivedRate; }
}

// 网络延迟测试结果实体
public class NetworkLatencyTestResult {
    private String brokerHost;
    private int brokerPort;
    private boolean successful;
    private String errorMessage;
    private long minLatency;
    private long maxLatency;
    private double avgLatency;
    private long p50Latency;
    private long p95Latency;
    
    // Getter和Setter方法
    public String getBrokerHost() { return brokerHost; }
    public void setBrokerHost(String brokerHost) { this.brokerHost = brokerHost; }
    
    public int getBrokerPort() { return brokerPort; }
    public void setBrokerPort(int brokerPort) { this.brokerPort = brokerPort; }
    
    public boolean isSuccessful() { return successful; }
    public void setSuccessful(boolean successful) { this.successful = successful; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public long getMinLatency() { return minLatency; }
    public void setMinLatency(long minLatency) { this.minLatency = minLatency; }
    
    public long getMaxLatency() { return maxLatency; }
    public void setMaxLatency(long maxLatency) { this.maxLatency = maxLatency; }
    
    public double getAvgLatency() { return avgLatency; }
    public void setAvgLatency(double avgLatency) { this.avgLatency = avgLatency; }
    
    public long getP50Latency() { return p50Latency; }
    public void setP50Latency(long p50Latency) { this.p50Latency = p50Latency; }
    
    public long getP95Latency() { return p95Latency; }
    public void setP95Latency(long p95Latency) { this.p95Latency = p95Latency; }
    
    @Override
    public String toString() {
        if (!successful) {
            return String.format("Network latency test failed for %s:%d - %s", 
                brokerHost, brokerPort, errorMessage);
        }
        
        return String.format(
            "Network latency to %s:%d - Min: %dms, Max: %dms, Avg: %.2fms, P50: %dms, P95: %dms",
            brokerHost, brokerPort, minLatency, maxLatency, avgLatency, p50Latency, p95Latency
        );
    }
}
```

## 5. JVM调优和系统优化

### 5.1 JVM参数优化

```java
// JVM监控和调优服务
@Service
public class JVMOptimizationService {
    
    private static final Logger logger = LoggerFactory.getLogger(JVMOptimizationService.class);
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    // JVM内存监控
    @Scheduled(fixedRate = 30000) // 每30秒检查一次
    public void monitorJVMMemory() {
        try {
            MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
            MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
            MemoryUsage nonHeapUsage = memoryBean.getNonHeapMemoryUsage();
            
            // 堆内存指标
            Gauge.builder("jvm.memory.heap.used")
                .register(meterRegistry, () -> heapUsage.getUsed());
            
            Gauge.builder("jvm.memory.heap.max")
                .register(meterRegistry, () -> heapUsage.getMax());
            
            Gauge.builder("jvm.memory.heap.usage.percentage")
                .register(meterRegistry, () -> 
                    (double) heapUsage.getUsed() / heapUsage.getMax() * 100);
            
            // 非堆内存指标
            Gauge.builder("jvm.memory.nonheap.used")
                .register(meterRegistry, () -> nonHeapUsage.getUsed());
            
            // 检查内存使用告警
            double heapUsagePercentage = (double) heapUsage.getUsed() / heapUsage.getMax() * 100;
            if (heapUsagePercentage > 85) {
                logger.warn("High heap memory usage: {:.2f}%", heapUsagePercentage);
            }
            
            if (heapUsagePercentage > 95) {
                logger.error("Critical heap memory usage: {:.2f}%", heapUsagePercentage);
            }
            
        } catch (Exception e) {
            logger.error("Error monitoring JVM memory", e);
        }
    }
    
    // GC监控
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void monitorGarbageCollection() {
        try {
            List<GarbageCollectorMXBean> gcBeans = ManagementFactory.getGarbageCollectorMXBeans();
            
            for (GarbageCollectorMXBean gcBean : gcBeans) {
                String gcName = gcBean.getName();
                long collectionCount = gcBean.getCollectionCount();
                long collectionTime = gcBean.getCollectionTime();
                
                // GC次数和时间指标
                Gauge.builder("jvm.gc.collection.count")
                    .tag("gc", gcName)
                    .register(meterRegistry, () -> collectionCount);
                
                Gauge.builder("jvm.gc.collection.time")
                    .tag("gc", gcName)
                    .register(meterRegistry, () -> collectionTime);
                
                // 计算平均GC时间
                double avgGCTime = collectionCount > 0 ? 
                    (double) collectionTime / collectionCount : 0;
                
                Gauge.builder("jvm.gc.collection.avg.time")
                    .tag("gc", gcName)
                    .register(meterRegistry, () -> avgGCTime);
                
                logger.debug("GC {}: {} collections, {} ms total, {:.2f} ms avg", 
                    gcName, collectionCount, collectionTime, avgGCTime);
            }
            
        } catch (Exception e) {
            logger.error("Error monitoring garbage collection", e);
        }
    }
    
    // 线程监控
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void monitorThreads() {
        try {
            ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
            
            int threadCount = threadBean.getThreadCount();
            int daemonThreadCount = threadBean.getDaemonThreadCount();
            int peakThreadCount = threadBean.getPeakThreadCount();
            
            // 线程数量指标
            Gauge.builder("jvm.threads.count")
                .register(meterRegistry, () -> threadCount);
            
            Gauge.builder("jvm.threads.daemon.count")
                .register(meterRegistry, () -> daemonThreadCount);
            
            Gauge.builder("jvm.threads.peak.count")
                .register(meterRegistry, () -> peakThreadCount);
            
            // 检查线程数告警
            if (threadCount > 500) {
                logger.warn("High thread count: {}", threadCount);
            }
            
            // 检查死锁
            long[] deadlockedThreads = threadBean.findDeadlockedThreads();
            if (deadlockedThreads != null && deadlockedThreads.length > 0) {
                logger.error("Deadlock detected! Affected threads: {}", 
                    Arrays.toString(deadlockedThreads));
            }
            
        } catch (Exception e) {
            logger.error("Error monitoring threads", e);
        }
    }
    
    // 生成JVM优化建议
    public List<JVMOptimizationRecommendation> getJVMOptimizationRecommendations() {
        List<JVMOptimizationRecommendation> recommendations = new ArrayList<>();
        
        try {
            // 分析堆内存使用
            analyzeHeapMemoryUsage(recommendations);
            
            // 分析GC性能
            analyzeGCPerformance(recommendations);
            
            // 分析线程使用
            analyzeThreadUsage(recommendations);
            
        } catch (Exception e) {
            logger.error("Error generating JVM optimization recommendations", e);
        }
        
        return recommendations;
    }
    
    private void analyzeHeapMemoryUsage(List<JVMOptimizationRecommendation> recommendations) {
        MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
        MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
        
        double heapUsagePercentage = (double) heapUsage.getUsed() / heapUsage.getMax() * 100;
        
        if (heapUsagePercentage > 80) {
            recommendations.add(new JVMOptimizationRecommendation(
                "HIGH_HEAP_USAGE",
                String.format("Heap memory usage is %.2f%%", heapUsagePercentage),
                "Consider increasing heap size with -Xmx parameter or optimizing memory usage"
            ));
        }
        
        // 检查堆大小配置
        long maxHeap = heapUsage.getMax();
        if (maxHeap < 2L * 1024 * 1024 * 1024) { // 小于2GB
            recommendations.add(new JVMOptimizationRecommendation(
                "SMALL_HEAP_SIZE",
                String.format("Heap size is only %d MB", maxHeap / 1024 / 1024),
                "Consider increasing heap size for better Kafka performance"
            ));
        }
    }
    
    private void analyzeGCPerformance(List<JVMOptimizationRecommendation> recommendations) {
        List<GarbageCollectorMXBean> gcBeans = ManagementFactory.getGarbageCollectorMXBeans();
        
        for (GarbageCollectorMXBean gcBean : gcBeans) {
            long collectionCount = gcBean.getCollectionCount();
            long collectionTime = gcBean.getCollectionTime();
            
            if (collectionCount > 0) {
                double avgGCTime = (double) collectionTime / collectionCount;
                
                // 检查GC频率
                if (collectionCount > 1000) {
                    recommendations.add(new JVMOptimizationRecommendation(
                        "FREQUENT_GC",
                        String.format("GC %s has occurred %d times", gcBean.getName(), collectionCount),
                        "Consider tuning GC parameters or increasing heap size"
                    ));
                }
                
                // 检查GC时间
                if (avgGCTime > 100) { // 平均GC时间超过100ms
                    recommendations.add(new JVMOptimizationRecommendation(
                        "LONG_GC_TIME",
                        String.format("GC %s average time is %.2f ms", gcBean.getName(), avgGCTime),
                        "Consider using G1GC or ZGC for lower latency"
                    ));
                }
            }
        }
    }
    
    private void analyzeThreadUsage(List<JVMOptimizationRecommendation> recommendations) {
        ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
        int threadCount = threadBean.getThreadCount();
        
        if (threadCount > 300) {
            recommendations.add(new JVMOptimizationRecommendation(
                "HIGH_THREAD_COUNT",
                String.format("Thread count is %d", threadCount),
                "Consider reviewing thread pool configurations and reducing unnecessary threads"
            ));
        }
        
        // 检查死锁
        long[] deadlockedThreads = threadBean.findDeadlockedThreads();
        if (deadlockedThreads != null && deadlockedThreads.length > 0) {
            recommendations.add(new JVMOptimizationRecommendation(
                "DEADLOCK_DETECTED",
                String.format("Deadlock detected in %d threads", deadlockedThreads.length),
                "Investigate and fix deadlock issues in application code"
            ));
        }
    }
}

// JVM优化建议实体
public class JVMOptimizationRecommendation {
    private String type;
    private String description;
    private String recommendation;
    
    public JVMOptimizationRecommendation(String type, String description, String recommendation) {
        this.type = type;
        this.description = description;
        this.recommendation = recommendation;
    }
    
    // Getter和Setter方法
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }
    
    @Override
    public String toString() {
        return String.format("[%s] %s - %s", type, description, recommendation);
    }
}
```

### 5.2 系统参数优化

```bash
# Kafka Broker JVM优化参数示例
# 在kafka-server-start.sh中配置

# 基础内存配置
export KAFKA_HEAP_OPTS="-Xmx6g -Xms6g"

# G1GC配置（推荐用于大堆）
export KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=35 -XX:+ExplicitGCInvokesConcurrent -XX:MaxInlineLevel=15 -Djava.awt.headless=true"

# GC日志配置
export KAFKA_GC_LOG_OPTS="-Xloggc:/var/log/kafka/kafkaServer-gc.log -verbose:gc -XX:+PrintGCDetails -XX:+PrintGCDateStamps -XX:+PrintGCTimeStamps -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=10 -XX:GCLogFileSize=100M"

# JMX配置
export KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999"

# 其他优化参数
export KAFKA_OPTS="-XX:+UnlockExperimentalVMOptions -XX:+UseCGroupMemoryLimitForHeap -XX:+AlwaysPreTouch -XX:+DisableExplicitGC"
```

```properties
# server.properties 优化配置

# 网络和I/O优化
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# 日志配置优化
log.segment.bytes=1073741824
log.retention.hours=168
log.retention.check.interval.ms=300000
log.cleanup.policy=delete

# 副本配置优化
default.replication.factor=3
min.insync.replicas=2
replica.fetch.max.bytes=1048576
replica.fetch.wait.max.ms=500

# 压缩配置
compression.type=lz4

# 其他性能配置
queued.max.requests=500
fetch.purgatory.purge.interval.requests=1000
producer.purgatory.purge.interval.requests=1000
```

## 6. 实战案例：电商平台性能优化

### 6.1 电商平台Kafka架构优化

```java
// 电商平台Kafka性能优化实战
@Service
public class ECommerceKafkaOptimizationService {
    
    private static final Logger logger = LoggerFactory.getLogger(ECommerceKafkaOptimizationService.class);
    
    @Autowired
    private SmartProducerSelector producerSelector;
    
    @Autowired
    private KafkaPerformanceMetricsCollector metricsCollector;
    
    // 订单事件优化处理
    public void optimizeOrderEventProcessing() {
        // 场景：双11期间订单量激增，需要优化处理性能
        
        // 1. 使用高吞吐量生产者处理批量订单
        List<OrderEvent> batchOrders = generateBatchOrderEvents(1000);
        
        List<ProducerRecord<String, Object>> records = batchOrders.stream()
            .map(order -> new ProducerRecord<String, Object>(
                "order-events", 
                order.getOrderId(), 
                order
            ))
            .collect(Collectors.toList());
        
        // 批量发送订单事件
        CompletableFuture<List<SendResult<String, Object>>> batchFuture = 
            producerSelector.sendBatchMessages(
                "order-events", 
                records, 
                SmartProducerSelector.MessagePriority.HIGH
            );
        
        batchFuture.whenComplete((results, throwable) -> {
            if (throwable == null) {
                logger.info("Successfully sent {} order events", results.size());
            } else {
                logger.error("Failed to send batch order events", throwable);
            }
        });
    }
    
    // 用户行为事件优化处理
    public void optimizeUserBehaviorEventProcessing() {
        // 场景：用户浏览、点击等高频事件，需要低延迟处理
        
        UserBehaviorEvent behaviorEvent = new UserBehaviorEvent(
            "user123", 
            "CLICK", 
            "product456", 
            System.currentTimeMillis()
        );
        
        // 使用低延迟生产者发送用户行为事件
        CompletableFuture<SendResult<String, Object>> future = 
            producerSelector.sendMessage(
                "user-behavior-events",
                behaviorEvent.getUserId(),
                behaviorEvent,
                SmartProducerSelector.MessagePriority.NORMAL
            );
        
        future.whenComplete((result, throwable) -> {
            if (throwable == null) {
                logger.debug("User behavior event sent: {}", behaviorEvent);
            } else {
                logger.error("Failed to send user behavior event", throwable);
            }
        });
    }
    
    // 库存更新事件优化处理
    public void optimizeInventoryUpdateProcessing() {
        // 场景：库存更新需要高可靠性，确保不丢失
        
        InventoryUpdateEvent inventoryEvent = new InventoryUpdateEvent(
            "product789",
            100,
            "DECREASE",
            System.currentTimeMillis()
        );
        
        // 使用高可靠性生产者发送库存更新事件
        CompletableFuture<SendResult<String, Object>> future = 
            producerSelector.sendMessage(
                "inventory-updates",
                inventoryEvent.getProductId(),
                inventoryEvent,
                SmartProducerSelector.MessagePriority.CRITICAL
            );
        
        future.whenComplete((result, throwable) -> {
            if (throwable == null) {
                logger.info("Inventory update event sent: {}", inventoryEvent);
            } else {
                logger.error("Failed to send inventory update event", throwable);
                // 实现重试或补偿逻辑
            }
        });
    }
    
    // 生成批量订单事件（模拟）
    private List<OrderEvent> generateBatchOrderEvents(int count) {
        List<OrderEvent> orders = new ArrayList<>();
        
        for (int i = 0; i < count; i++) {
            OrderEvent order = new OrderEvent(
                "order-" + System.currentTimeMillis() + "-" + i,
                "user-" + (i % 1000),
                "product-" + (i % 100),
                1,
                99.99,
                System.currentTimeMillis()
            );
            orders.add(order);
        }
        
        return orders;
    }
    
    // 性能测试和基准测试
    public PerformanceBenchmarkResult runPerformanceBenchmark() {
        PerformanceBenchmarkResult result = new PerformanceBenchmarkResult();
        
        try {
            // 测试高吞吐量场景
            BenchmarkResult throughputResult = benchmarkThroughput();
            result.setThroughputResult(throughputResult);
            
            // 测试低延迟场景
            BenchmarkResult latencyResult = benchmarkLatency();
            result.setLatencyResult(latencyResult);
            
            // 测试高可靠性场景
            BenchmarkResult reliabilityResult = benchmarkReliability();
            result.setReliabilityResult(reliabilityResult);
            
            result.setSuccessful(true);
            
        } catch (Exception e) {
            logger.error("Performance benchmark failed", e);
            result.setSuccessful(false);
            result.setErrorMessage(e.getMessage());
        }
        
        return result;
    }
    
    private BenchmarkResult benchmarkThroughput() throws Exception {
        BenchmarkResult result = new BenchmarkResult();
        result.setTestType("THROUGHPUT");
        
        int messageCount = 10000;
        long startTime = System.currentTimeMillis();
        
        // 发送大量消息测试吞吐量
        List<CompletableFuture<SendResult<String, Object>>> futures = new ArrayList<>();
        
        for (int i = 0; i < messageCount; i++) {
            String message = "throughput-test-message-" + i;
            CompletableFuture<SendResult<String, Object>> future = 
                producerSelector.sendMessage(
                    "throughput-test",
                    "key-" + i,
                    message,
                    SmartProducerSelector.MessagePriority.LOW
                );
            futures.add(future);
        }
        
        // 等待所有消息发送完成
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get();
        
        long endTime = System.currentTimeMillis();
        long totalTime = endTime - startTime;
        
        result.setMessageCount(messageCount);
        result.setTotalTime(totalTime);
        result.setThroughput((double) messageCount / (totalTime / 1000.0));
        
        return result;
    }
    
    private BenchmarkResult benchmarkLatency() throws Exception {
        BenchmarkResult result = new BenchmarkResult();
        result.setTestType("LATENCY");
        
        int messageCount = 1000;
        List<Long> latencies = new ArrayList<>();
        
        for (int i = 0; i < messageCount; i++) {
            String message = "latency-test-message-" + i;
            long startTime = System.nanoTime();
            
            producerSelector.sendMessage(
                "latency-test",
                "key-" + i,
                message,
                SmartProducerSelector.MessagePriority.HIGH
            ).get(); // 同步等待
            
            long endTime = System.nanoTime();
            long latency = (endTime - startTime) / 1_000_000; // 转换为毫秒
            latencies.add(latency);
            
            Thread.sleep(10); // 间隔10ms
        }
        
        // 计算延迟统计
        latencies.sort(Long::compareTo);
        result.setMessageCount(messageCount);
        result.setMinLatency(latencies.get(0));
        result.setMaxLatency(latencies.get(latencies.size() - 1));
        result.setAvgLatency(latencies.stream().mapToLong(Long::longValue).average().orElse(0));
        result.setP50Latency(latencies.get(latencies.size() / 2));
        result.setP95Latency(latencies.get((int) (latencies.size() * 0.95)));
        result.setP99Latency(latencies.get((int) (latencies.size() * 0.99)));
        
        return result;
    }
    
    private BenchmarkResult benchmarkReliability() throws Exception {
        BenchmarkResult result = new BenchmarkResult();
        result.setTestType("RELIABILITY");
        
        int messageCount = 5000;
        int successCount = 0;
        int failureCount = 0;
        
        for (int i = 0; i < messageCount; i++) {
            String message = "reliability-test-message-" + i;
            
            try {
                producerSelector.sendMessage(
                    "reliability-test",
                    "key-" + i,
                    message,
                    SmartProducerSelector.MessagePriority.CRITICAL
                ).get();
                
                successCount++;
            } catch (Exception e) {
                failureCount++;
                logger.debug("Message {} failed to send", i, e);
            }
        }
        
        result.setMessageCount(messageCount);
        result.setSuccessCount(successCount);
        result.setFailureCount(failureCount);
        result.setSuccessRate((double) successCount / messageCount * 100);
        
        return result;
    }
}

// 订单事件实体
public class OrderEvent {
    private String orderId;
    private String userId;
    private String productId;
    private int quantity;
    private double price;
    private long timestamp;
    
    public OrderEvent(String orderId, String userId, String productId, 
                     int quantity, double price, long timestamp) {
        this.orderId = orderId;
        this.userId = userId;
        this.productId = productId;
        this.quantity = quantity;
        this.price = price;
        this.timestamp = timestamp;
    }
    
    // Getter和Setter方法
    public String getOrderId() { return orderId; }
    public void setOrderId(String orderId) { this.orderId = orderId; }
    
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    
    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }
    
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    
    public double getPrice() { return price; }
    public void setPrice(double price) { this.price = price; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}

// 用户行为事件实体
public class UserBehaviorEvent {
    private String userId;
    private String action;
    private String targetId;
    private long timestamp;
    
    public UserBehaviorEvent(String userId, String action, String targetId, long timestamp) {
        this.userId = userId;
        this.action = action;
        this.targetId = targetId;
        this.timestamp = timestamp;
    }
    
    // Getter和Setter方法
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}

// 库存更新事件实体
public class InventoryUpdateEvent {
    private String productId;
    private int quantity;
    private String operation;
    private long timestamp;
    
    public InventoryUpdateEvent(String productId, int quantity, String operation, long timestamp) {
        this.productId = productId;
        this.quantity = quantity;
        this.operation = operation;
        this.timestamp = timestamp;
    }
    
    // Getter和Setter方法
    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }
    
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
```

## 7. 实战练习

### 练习1：生产者性能调优
1. 配置三种不同场景的生产者（高吞吐量、低延迟、高可靠性）
2. 实现智能生产者选择逻辑
3. 进行性能基准测试并分析结果

### 练习2：消费者性能调优
1. 配置批量消费和单条消费的消费者
2. 实现消费者性能监控
3. 优化消费者配置参数

### 练习3：存储和网络优化
1. 监控磁盘使用情况和网络连接
2. 分析日志段分布和大小
3. 提供存储优化建议

### 练习4：JVM调优实践
1. 监控JVM内存、GC和线程使用情况
2. 分析性能瓶颈并提供优化建议
3. 配置合适的JVM参数

## 8. 课后作业

### 作业1：完整的性能优化方案
设计并实现一个完整的Kafka性能优化方案，包括：
- 生产者和消费者配置优化
- 存储和网络参数调优
- JVM参数优化
- 性能监控和告警系统

### 作业2：性能基准测试工具
开发一个Kafka性能基准测试工具，能够：
- 测试不同场景下的吞吐量和延迟
- 生成详细的性能报告
- 提供优化建议

### 作业3：生产环境性能调优
模拟生产环境进行性能调优：
- 分析现有系统的性能瓶颈
- 制定优化计划并实施
- 验证优化效果并持续改进

## 9. 课程总结

### 关键知识点回顾

1. **性能分析基础**
   - 性能指标体系建立
   - 性能诊断工具使用
   - 性能瓶颈识别方法

2. **生产者性能优化**
   - 配置参数调优
   - 智能生产者选择
   - 批处理和压缩优化

3. **消费者性能优化**
   - 批量消费配置
   - 并发消费优化
   - 偏移量管理优化

4. **存储和网络优化**
   - 磁盘I/O优化
   - 网络参数调优
   - 日志管理优化

5. **JVM和系统优化**
   - JVM参数调优
   - GC优化策略
   - 系统资源监控

### 最佳实践总结

1. **监控先行**：建立完善的监控体系，及时发现性能问题
2. **分场景优化**：根据不同业务场景选择合适的优化策略
3. **渐进式优化**：逐步优化，避免一次性大幅调整
4. **持续改进**：定期评估性能，持续优化配置
5. **测试验证**：所有优化都要经过充分测试验证

### 下节预告

下一节课我们将学习《Kafka监控和运维实践》，内容包括：
- Kafka监控体系建设
- 常用监控工具和平台
- 运维自动化实践
- 故障诊断和处理
- 容量规划和扩容策略

通过本节课的学习，你已经掌握了Kafka性能优化的核心技术和实践方法。在下一节课中，我们将进一步学习如何建设完善的监控和运维体系，确保Kafka集群的稳定运行。

// 性能基准测试结果实体
public class PerformanceBenchmarkResult {
    private boolean successful;
    private String errorMessage;
    private BenchmarkResult throughputResult;
    private BenchmarkResult latencyResult;
    private BenchmarkResult reliabilityResult;
    
    // Getter和Setter方法
    public boolean isSuccessful() { return successful; }
    public void setSuccessful(boolean successful) { this.successful = successful; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public BenchmarkResult getThroughputResult() { return throughputResult; }
    public void setThroughputResult(BenchmarkResult throughputResult) { this.throughputResult = throughputResult; }
    
    public BenchmarkResult getLatencyResult() { return latencyResult; }
    public void setLatencyResult(BenchmarkResult latencyResult) { this.latencyResult = latencyResult; }
    
    public BenchmarkResult getReliabilityResult() { return reliabilityResult; }
    public void setReliabilityResult(BenchmarkResult reliabilityResult) { this.reliabilityResult = reliabilityResult; }
    
    @Override
    public String toString() {
        if (!successful) {
            return "Performance benchmark failed: " + errorMessage;
        }
        
        StringBuilder sb = new StringBuilder();
        sb.append("Performance Benchmark Results:\n");
        
        if (throughputResult != null) {
            sb.append("Throughput Test: ").append(throughputResult.getThroughput()).append(" msg/s\n");
        }
        
        if (latencyResult != null) {
            sb.append("Latency Test - Avg: ").append(latencyResult.getAvgLatency()).append("ms, ")
              .append("P95: ").append(latencyResult.getP95Latency()).append("ms\n");
        }
        
        if (reliabilityResult != null) {
            sb.append("Reliability Test - Success Rate: ").append(reliabilityResult.getSuccessRate()).append("%\n");
        }
        
        return sb.toString();
    }
}

// 基准测试结果实体
public class BenchmarkResult {
    private String testType;
    private int messageCount;
    private long totalTime;
    private double throughput;
    private long minLatency;
    private long maxLatency;
    private double avgLatency;
    private long p50Latency;
    private long p95Latency;
    private long p99Latency;
    private int successCount;
    private int failureCount;
    private double successRate;
    
    // Getter和Setter方法
    public String getTestType() { return testType; }
    public void setTestType(String testType) { this.testType = testType; }
    
    public int getMessageCount() { return messageCount; }
    public void setMessageCount(int messageCount) { this.messageCount = messageCount; }
    
    public long getTotalTime() { return totalTime; }
    public void setTotalTime(long totalTime) { this.totalTime = totalTime; }
    
    public double getThroughput() { return throughput; }
    public void setThroughput(double throughput) { this.throughput = throughput; }
    
    public long getMinLatency() { return minLatency; }
    public void setMinLatency(long minLatency) { this.minLatency = minLatency; }
    
    public long getMaxLatency() { return maxLatency; }
    public void setMaxLatency(long maxLatency) { this.maxLatency = maxLatency; }
    
    public double getAvgLatency() { return avgLatency; }
    public void setAvgLatency(double avgLatency) { this.avgLatency = avgLatency; }
    
    public long getP50Latency() { return p50Latency; }
    public void setP50Latency(long p50Latency) { this.p50Latency = p50Latency; }
    
    public long getP95Latency() { return p95Latency; }
    public void setP95Latency(long p95Latency) { this.p95Latency = p95Latency; }
    
    public long getP99Latency() { return p99Latency; }
    public void setP99Latency(long p99Latency) { this.p99Latency = p99Latency; }
    
    public int getSuccessCount() { return successCount; }
    public void setSuccessCount(int successCount) { this.successCount = successCount; }
    
    public int getFailureCount() { return failureCount; }
    public void setFailureCount(int failureCount) { this.failureCount = failureCount; }
    
    public double getSuccessRate() { return successRate; }
    public void setSuccessRate(double successRate) { this.successRate = successRate; }
    
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("BenchmarkResult{testType='").append(testType).append("'");
        
        if ("THROUGHPUT".equals(testType)) {
            sb.append(", messageCount=").append(messageCount)
              .append(", totalTime=").append(totalTime).append("ms")
              .append(", throughput=").append(String.format("%.2f", throughput)).append(" msg/s");
        } else if ("LATENCY".equals(testType)) {
            sb.append(", messageCount=").append(messageCount)
              .append(", avgLatency=").append(String.format("%.2f", avgLatency)).append("ms")
              .append(", p50=").append(p50Latency).append("ms")
              .append(", p95=").append(p95Latency).append("ms")
              .append(", p99=").append(p99Latency).append("ms");
        } else if ("RELIABILITY".equals(testType)) {
            sb.append(", messageCount=").append(messageCount)
              .append(", successCount=").append(successCount)
              .append(", failureCount=").append(failureCount)
              .append(", successRate=").append(String.format("%.2f", successRate)).append("%");
        }
        
        sb.append("}");
        return sb.toString();
    }
}

// 性能报告实体
public class PerformanceReport {
    private long timestamp;
    private int brokerCount;
    private int topicCount;
    private double diskUsage;
    private double memoryUsage;
    private double producerThroughput;
    private double consumerThroughput;
    private double avgProducerLatency;
    private double avgConsumerLatency;
    
    // Getter和Setter方法
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    
    public int getBrokerCount() { return brokerCount; }
    public void setBrokerCount(int brokerCount) { this.brokerCount = brokerCount; }
    
    public int getTopicCount() { return topicCount; }
    public void setTopicCount(int topicCount) { this.topicCount = topicCount; }
    
    public double getDiskUsage() { return diskUsage; }
    public void setDiskUsage(double diskUsage) { this.diskUsage = diskUsage; }
    
    public double getMemoryUsage() { return memoryUsage; }
    public void setMemoryUsage(double memoryUsage) { this.memoryUsage = memoryUsage; }
    
    public double getProducerThroughput() { return producerThroughput; }
    public void setProducerThroughput(double producerThroughput) { this.producerThroughput = producerThroughput; }
    
    public double getConsumerThroughput() { return consumerThroughput; }
    public void setConsumerThroughput(double consumerThroughput) { this.consumerThroughput = consumerThroughput; }
    
    public double getAvgProducerLatency() { return avgProducerLatency; }
    public void setAvgProducerLatency(double avgProducerLatency) { this.avgProducerLatency = avgProducerLatency; }
    
    public double getAvgConsumerLatency() { return avgConsumerLatency; }
    public void setAvgConsumerLatency(double avgConsumerLatency) { this.avgConsumerLatency = avgConsumerLatency; }
    
    @Override
    public String toString() {
        return String.format(
            "PerformanceReport{brokers=%d, topics=%d, disk=%.2f%%, memory=%.2f%%, " +
            "producerThroughput=%.2f msg/s, consumerThroughput=%.2f msg/s, " +
            "producerLatency=%.2f ms, consumerLatency=%.2f ms}",
            brokerCount, topicCount, diskUsage, memoryUsage,
            producerThroughput, consumerThroughput, avgProducerLatency, avgConsumerLatency
        );
    }
}
```

### 1.2 性能诊断工具

```java
// Kafka性能诊断工具
@Service
public class KafkaPerformanceDiagnosticService {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaPerformanceDiagnosticService.class);
    
    @Autowired
    private AdminClient adminClient;
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    // 诊断集群健康状态
    public ClusterHealthDiagnosis diagnoseClusterHealth() {
        ClusterHealthDiagnosis diagnosis = new ClusterHealthDiagnosis();
        
        try {
            // 检查Broker状态
            DescribeClusterResult clusterResult = adminClient.describeCluster();
            Collection<Node> nodes = clusterResult.nodes().get(10, TimeUnit.SECONDS);
            
            diagnosis.setBrokerCount(nodes.size());
            diagnosis.setBrokerNodes(new ArrayList<>(nodes));
            
            // 检查Controller状态
            Node controller = clusterResult.controller().get(10, TimeUnit.SECONDS);
            diagnosis.setControllerNode(controller);
            
            // 检查主题分区分布
            ListTopicsResult topicsResult = adminClient.listTopics();
            Set<String> topicNames = topicsResult.names().get(10, TimeUnit.SECONDS);
            
            Map<String, TopicDescription> topicDescriptions = adminClient
                .describeTopics(topicNames)
                .all()
                .get(10, TimeUnit.SECONDS);
            
            diagnosis.setTopicCount(topicNames.size());
            diagnosis.setTopicDescriptions(topicDescriptions);
            
            // 分析分区分布均衡性
            analyzePartitionDistribution(diagnosis, topicDescriptions);
            
            // 检查副本同步状态
            analyzeReplicaSync(diagnosis, topicDescriptions);
            
            diagnosis.setHealthy(true);
            
        } catch (Exception e) {
            logger.error("Failed to diagnose cluster health", e);
            diagnosis.setHealthy(false);
            diagnosis.setErrorMessage(e.getMessage());
        }
        
        return diagnosis;
    }
    
    // 分析分区分布
    private void analyzePartitionDistribution(ClusterHealthDiagnosis diagnosis, 
                                            Map<String, TopicDescription> topicDescriptions) {
        Map<Integer, Integer> brokerPartitionCount = new HashMap<>();
        int totalPartitions = 0;
        
        for (TopicDescription topicDesc : topicDescriptions.values()) {
            for (TopicPartitionInfo partitionInfo : topicDesc.partitions()) {
                totalPartitions++;
                int leaderId = partitionInfo.leader().id();
                brokerPartitionCount.merge(leaderId, 1, Integer::sum);
            }
        }
        
        diagnosis.setTotalPartitions(totalPartitions);
        diagnosis.setBrokerPartitionCount(brokerPartitionCount);
        
        // 计算分区分布的标准差，评估均衡性
        double avgPartitionsPerBroker = (double) totalPartitions / diagnosis.getBrokerCount();
        double variance = brokerPartitionCount.values().stream()
            .mapToDouble(count -> Math.pow(count - avgPartitionsPerBroker, 2))
            .average()
            .orElse(0.0);
        
        double standardDeviation = Math.sqrt(variance);
        diagnosis.setPartitionDistributionStdDev(standardDeviation);
        
        // 如果标准差过大，说明分区分布不均衡
        if (standardDeviation > avgPartitionsPerBroker * 0.2) {
            diagnosis.addWarning("Partition distribution is imbalanced across brokers");
        }
    }
    
    // 分析副本同步状态
    private void analyzeReplicaSync(ClusterHealthDiagnosis diagnosis, 
                                  Map<String, TopicDescription> topicDescriptions) {
        int totalReplicas = 0;
        int outOfSyncReplicas = 0;
        
        for (TopicDescription topicDesc : topicDescriptions.values()) {
            for (TopicPartitionInfo partitionInfo : topicDesc.partitions()) {
                List<Node> replicas = partitionInfo.replicas();
                List<Node> isr = partitionInfo.isr();
                
                totalReplicas += replicas.size();
                outOfSyncReplicas += (replicas.size() - isr.size());
                
                // 检查是否有副本不在ISR中
                if (replicas.size() != isr.size()) {
                    diagnosis.addWarning(String.format(
                        "Topic %s partition %d has out-of-sync replicas: %d/%d in ISR",
                        topicDesc.name(), partitionInfo.partition(), 
                        isr.size(), replicas.size()
                    ));
                }
            }
        }
        
        diagnosis.setTotalReplicas(totalReplicas);
        diagnosis.setOutOfSyncReplicas(outOfSyncReplicas);
        
        double syncRatio = (double) (totalReplicas - outOfSyncReplicas) / totalReplicas;
        diagnosis.setReplicaSyncRatio(syncRatio);
        
        if (syncRatio < 0.95) {
            diagnosis.addWarning(String.format(
                "Low replica sync ratio: %.2f%% (%d/%d replicas in sync)",
                syncRatio * 100, totalReplicas - outOfSyncReplicas, totalReplicas
            ));
        }
    }
    
    // 诊断生产者性能
    public ProducerPerformanceDiagnosis diagnoseProducerPerformance(String topic) {
        ProducerPerformanceDiagnosis diagnosis = new ProducerPerformanceDiagnosis();
        diagnosis.setTopic(topic);
        
        try {
            // 执行生产者性能测试
            long startTime = System.currentTimeMillis();
            int messageCount = 1000;
            int messageSize = 1024; // 1KB
            
            List<Long> latencies = new ArrayList<>();
            
            for (int i = 0; i < messageCount; i++) {
                String message = generateTestMessage(messageSize);
                long sendStart = System.nanoTime();
                
                kafkaTemplate.send(topic, "key-" + i, message).get();
                
                long sendEnd = System.nanoTime();
                long latency = (sendEnd - sendStart) / 1_000_000; // 转换为毫秒
                latencies.add(latency);
            }
            
            long endTime = System.currentTimeMillis();
            long totalTime = endTime - startTime;
            
            // 计算性能指标
            diagnosis.setMessageCount(messageCount);
            diagnosis.setMessageSize(messageSize);
            diagnosis.setTotalTime(totalTime);
            diagnosis.setThroughput((double) messageCount / (totalTime / 1000.0));
            
            // 计算延迟统计
            latencies.sort(Long::compareTo);
            diagnosis.setMinLatency(latencies.get(0));
            diagnosis.setMaxLatency(latencies.get(latencies.size() - 1));
            diagnosis.setAvgLatency(latencies.stream().mapToLong(Long::longValue).average().orElse(0));
            diagnosis.setP50Latency(latencies.get(latencies.size() / 2));
            diagnosis.setP95Latency(latencies.get((int) (latencies.size() * 0.95)));
            diagnosis.setP99Latency(latencies.get((int) (latencies.size() * 0.99)));
            
            // 性能评估
            evaluateProducerPerformance(diagnosis);
            
        } catch (Exception e) {
            logger.error("Failed to diagnose producer performance", e);
            diagnosis.setErrorMessage(e.getMessage());
        }
        
        return diagnosis;
    }
    
    // 评估生产者性能
    private void evaluateProducerPerformance(ProducerPerformanceDiagnosis diagnosis) {
        List<String> recommendations = new ArrayList<>();
        
        // 评估吞吐量
        if (diagnosis.getThroughput() < 1000) {
            recommendations.add("Low throughput detected. Consider increasing batch.size and linger.ms");
        }
        
        // 评估延迟
        if (diagnosis.getAvgLatency() > 50) {
            recommendations.add("High average latency. Consider reducing acks setting or optimizing network");
        }
        
        if (diagnosis.getP99Latency() > 200) {
            recommendations.add("High P99 latency. Check for network issues or broker overload");
        }
        
        // 评估延迟分布
        double latencyVariance = diagnosis.getMaxLatency() - diagnosis.getMinLatency();
        if (latencyVariance > diagnosis.getAvgLatency() * 5) {
            recommendations.add("High latency variance. Check for intermittent network issues");
        }
        
        diagnosis.setRecommendations(recommendations);
    }
    
    // 生成测试消息
    private String generateTestMessage(int size) {
        StringBuilder sb = new StringBuilder(size);
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        
        for (int i = 0; i < size; i++) {
            sb.append(chars.charAt((int) (Math.random() * chars.length())));
        }
        
        return sb.toString();
    }
    
    // 诊断消费者性能
    public ConsumerPerformanceDiagnosis diagnoseConsumerPerformance(String topic, String groupId) {
        ConsumerPerformanceDiagnosis diagnosis = new ConsumerPerformanceDiagnosis();
        diagnosis.setTopic(topic);
        diagnosis.setGroupId(groupId);
        
        try {
            // 获取消费者组信息
            DescribeConsumerGroupsResult groupResult = adminClient
                .describeConsumerGroups(Collections.singletonList(groupId));
            
            ConsumerGroupDescription groupDesc = groupResult.all().get(10, TimeUnit.SECONDS)
                .get(groupId);
            
            diagnosis.setConsumerCount(groupDesc.members().size());
            diagnosis.setState(groupDesc.state().toString());
            
            // 获取消费者延迟信息
            ListConsumerGroupOffsetsResult offsetsResult = adminClient
                .listConsumerGroupOffsets(groupId);
            
            Map<TopicPartition, OffsetAndMetadata> offsets = offsetsResult.partitionsToOffsetAndMetadata()
                .get(10, TimeUnit.SECONDS);
            
            // 计算消费延迟
            Map<TopicPartition, Long> endOffsets = adminClient
                .listOffsets(offsets.keySet().stream()
                    .collect(Collectors.toMap(
                        tp -> tp,
                        tp -> OffsetSpec.latest()
                    )))
                .all()
                .get(10, TimeUnit.SECONDS)
                .entrySet()
                .stream()
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    entry -> entry.getValue().offset()
                ));
            
            long totalLag = 0;
            Map<TopicPartition, Long> partitionLags = new HashMap<>();
            
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : offsets.entrySet()) {
                TopicPartition tp = entry.getKey();
                long currentOffset = entry.getValue().offset();
                long endOffset = endOffsets.getOrDefault(tp, currentOffset);
                long lag = endOffset - currentOffset;
                
                totalLag += lag;
                partitionLags.put(tp, lag);
            }
            
            diagnosis.setTotalLag(totalLag);
            diagnosis.setPartitionLags(partitionLags);
            
            // 性能评估
            evaluateConsumerPerformance(diagnosis);
            
        } catch (Exception e) {
            logger.error("Failed to diagnose consumer performance", e);
            diagnosis.setErrorMessage(e.getMessage());
        }
        
        return diagnosis;
    }
    
    // 评估消费者性能
    private void evaluateConsumerPerformance(ConsumerPerformanceDiagnosis diagnosis) {
        List<String> recommendations = new ArrayList<>();
        
        // 评估消费延迟
        if (diagnosis.getTotalLag() > 10000) {
            recommendations.add("High consumer lag detected. Consider increasing consumer instances or optimizing processing");
        }
        
        // 评估分区延迟分布
        if (diagnosis.getPartitionLags() != null) {
            long maxPartitionLag = diagnosis.getPartitionLags().values().stream()
                .mapToLong(Long::longValue)
                .max()
                .orElse(0);
            
            long avgPartitionLag = (long) diagnosis.getPartitionLags().values().stream()
                .mapToLong(Long::longValue)
                .average()
                .orElse(0);
            
            if (maxPartitionLag > avgPartitionLag * 3) {
                recommendations.add("Uneven partition lag distribution. Check for slow consumers or hot partitions");
            }
        }
        
        // 评估消费者数量
        if (diagnosis.getConsumerCount() == 0) {
            recommendations.add("No active consumers in group. Check consumer application status");
        }
        
        diagnosis.setRecommendations(recommendations);
    }
}
```

## 2. 生产者性能优化

### 2.1 生产者配置优化

```java
// 高性能生产者配置
@Configuration
public class HighPerformanceProducerConfig {
    
    @Value("${kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    // 高吞吐量生产者配置
    @Bean("highThroughputProducer")
    public ProducerFactory<String, Object> highThroughputProducerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 高吞吐量优化配置
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, 65536); // 64KB批次大小
        props.put(ProducerConfig.LINGER_MS_CONFIG, 10); // 等待10ms收集更多消息
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4"); // 使用LZ4压缩
        props.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 67108864); // 64MB缓冲区
        
        // 并发和网络优化
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30000);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120000);
        
        // 可靠性配置（适度降低以提高性能）
        props.put(ProducerConfig.ACKS_CONFIG, "1"); // 只等待Leader确认
        props.put(ProducerConfig.RETRIES_CONFIG, 3);
        props.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, 100);
        
        return new DefaultKafkaProducerFactory<>(props);
    }
    
    // 低延迟生产者配置
    @Bean("lowLatencyProducer")
    public ProducerFactory<String, Object> lowLatencyProducerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 低延迟优化配置
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, 1024); // 小批次大小
        props.put(ProducerConfig.LINGER_MS_CONFIG, 0); // 立即发送
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "none"); // 不压缩
        props.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432); // 32MB缓冲区
        
        // 网络优化
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 1);
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 10000);
        
        // 可靠性配置
        props.put(ProducerConfig.ACKS_CONFIG, "1");
        props.put(ProducerConfig.RETRIES_CONFIG, 0); // 不重试以降低延迟
        
        return new DefaultKafkaProducerFactory<>(props);
    }
    
    // 高可靠性生产者配置
    @Bean("highReliabilityProducer")
    public ProducerFactory<String, Object> highReliabilityProducerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 高可靠性配置
        props.put(ProducerConfig.ACKS_CONFIG, "all"); // 等待所有副本确认
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        props.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, 1000);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 300000); // 5分钟
        
        // 幂等性配置
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        // 批处理配置（平衡性能和可靠性）
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, 32768); // 32KB
        props.put(ProducerConfig.LINGER_MS_CONFIG, 5);
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");
        
        return new DefaultKafkaProducerFactory<>(props);
    }
    
    @Bean
    public KafkaTemplate<String, Object> highThroughputKafkaTemplate() {
        return new KafkaTemplate<>(highThroughputProducerFactory());
    }
    
    @Bean
    public KafkaTemplate<String, Object> lowLatencyKafkaTemplate() {
        return new KafkaTemplate<>(lowLatencyProducerFactory());
    }
    
    @Bean
    public KafkaTemplate<String, Object> highReliabilityKafkaTemplate() {
        return new KafkaTemplate<>(highReliabilityProducerFactory());
    }
}
```

### 2.2 智能生产者选择器

```java
// 智能生产者选择器
@Service
public class SmartProducerSelector {
    
    private static final Logger logger = LoggerFactory.getLogger(SmartProducerSelector.class);
    
    @Autowired
    @Qualifier("highThroughputKafkaTemplate")
    private KafkaTemplate<String, Object> highThroughputTemplate;
    
    @Autowired
    @Qualifier("lowLatencyKafkaTemplate")
    private KafkaTemplate<String, Object> lowLatencyTemplate;
    
    @Autowired
    @Qualifier("highReliabilityKafkaTemplate")
    private KafkaTemplate<String, Object> highReliabilityTemplate;
    
    @Autowired
    private KafkaPerformanceMetricsCollector metricsCollector;
    
    // 生产者类型枚举
    public enum ProducerType {
        HIGH_THROUGHPUT,
        LOW_LATENCY,
        HIGH_RELIABILITY
    }
    
    // 消息优先级枚举
    public enum MessagePriority {
        LOW,
        NORMAL,
        HIGH,
        CRITICAL
    }
    
    // 智能选择生产者
    public KafkaTemplate<String, Object> selectProducer(MessagePriority priority, 
                                                       int messageSize, 
                                                       boolean requiresOrdering) {
        ProducerType selectedType = determineProducerType(priority, messageSize, requiresOrdering);
        
        switch (selectedType) {
            case HIGH_THROUGHPUT:
                logger.debug("Selected high throughput producer");
                return highThroughputTemplate;
            case LOW_LATENCY:
                logger.debug("Selected low latency producer");
                return lowLatencyTemplate;
            case HIGH_RELIABILITY:
                logger.debug("Selected high reliability producer");
                return highReliabilityTemplate;
            default:
                return highThroughputTemplate;
        }
    }
    
    // 确定生产者类型
    private ProducerType determineProducerType(MessagePriority priority, 
                                             int messageSize, 
                                             boolean requiresOrdering) {
        // 关键消息使用高可靠性生产者
        if (priority == MessagePriority.CRITICAL || requiresOrdering) {
            return ProducerType.HIGH_RELIABILITY;
        }
        
        // 高优先级小消息使用低延迟生产者
        if (priority == MessagePriority.HIGH && messageSize < 1024) {
            return ProducerType.LOW_LATENCY;
        }
        
        // 大消息或批量消息使用高吞吐量生产者
        if (messageSize > 10240 || priority == MessagePriority.LOW) {
            return ProducerType.HIGH_THROUGHPUT;
        }
        
        // 默认使用高吞吐量生产者
        return ProducerType.HIGH_THROUGHPUT;
    }
    
    // 发送消息的统一接口
    public CompletableFuture<SendResult<String, Object>> sendMessage(String topic, 
                                                                   String key, 
                                                                   Object message, 
                                                                   MessagePriority priority) {
        long startTime = System.nanoTime();
        
        try {
            // 计算消息大小
            int messageSize = estimateMessageSize(message);
            
            // 选择合适的生产者
            KafkaTemplate<String, Object> producer = selectProducer(priority, messageSize, false);
            
            // 发送消息
            CompletableFuture<SendResult<String, Object>> future = producer.send(topic, key, message);
            
            // 记录性能指标
            future.whenComplete((result, throwable) -> {
                long endTime = System.nanoTime();
                long latency = (endTime - startTime) / 1_000_000; // 转换为毫秒
                
                if (throwable == null) {
                    int partition = result.getRecordMetadata().partition();
                    metricsCollector.recordProducerMetrics(topic, partition, latency, messageSize);
                } else {
                    logger.error("Failed to send message to topic: {}", topic, throwable);
                }
            });
            
            return future;
            
        } catch (Exception e) {
            logger.error("Error sending message to topic: {}", topic, e);
            CompletableFuture<SendResult<String, Object>> failedFuture = new CompletableFuture<>();
            failedFuture.completeExceptionally(e);
            return failedFuture;
        }
    }
    
    // 批量发送消息
    public CompletableFuture<List<SendResult<String, Object>>> sendBatchMessages(
            String topic, 
            List<ProducerRecord<String, Object>> records, 
            MessagePriority priority) {
        
        // 使用高吞吐量生产者进行批量发送
        KafkaTemplate<String, Object> producer = highThroughputTemplate;
        
        List<CompletableFuture<SendResult<String, Object>>> futures = new ArrayList<>();
        
        for (ProducerRecord<String, Object> record : records) {
            CompletableFuture<SendResult<String, Object>> future = producer.send(record);
            futures.add(future);
        }
        
        // 等待所有消息发送完成
        return CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
            .thenApply(v -> futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList()));
    }
    
    // 估算消息大小
    private int estimateMessageSize(Object message) {
        try {
            if (message instanceof String) {
                return ((String) message).getBytes(StandardCharsets.UTF_8).length;
            } else {
                // 使用JSON序列化估算大小
                ObjectMapper mapper = new ObjectMapper();
                return mapper.writeValueAsBytes(message).length;
            }
        } catch (Exception e) {
            logger.warn("Failed to estimate message size, using default", e);
            return 1024; // 默认1KB
        }
    }
}
```

## 3. 消费者性能优化

### 3.1 消费者配置优化

```java
// 高性能消费者配置
@Configuration
public class HighPerformanceConsumerConfig {
    
    @Value("${kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    // 高吞吐量消费者配置
    @Bean("highThroughputConsumerFactory")
    public ConsumerFactory<String, Object> highThroughputConsumerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        
        // 高吞吐量优化配置
        props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, 50000); // 50KB最小拉取大小
        props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, 500); // 最大等待500ms
        props.put(ConsumerConfig.MAX_PARTITION_FETCH_BYTES_CONFIG, 1048576); // 1MB最大分区拉取
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 1000); // 每次拉取1000条记录
        
        // 会话和心跳配置
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000);
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 10000);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000); // 5分钟
        
        // 偏移量管理
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // 手动提交偏移量
        
        return new DefaultKafkaConsumerFactory<>(props);
    }
    
    // 低延迟消费者配置
    @Bean("lowLatencyConsumerFactory")
    public ConsumerFactory<String, Object> lowLatencyConsumerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        
        // 低延迟优化配置
        props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, 1); // 立即拉取
        props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, 10); // 最大等待10ms
        props.put(ConsumerConfig.MAX_PARTITION_FETCH_BYTES_CONFIG, 65536); // 64KB
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 100); // 每次拉取100条记录
        
        // 会话和心跳配置
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 10000);
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 3000);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 60000); // 1分钟
        
        // 偏移量管理
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, true);
        props.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, 1000);
        
        return new DefaultKafkaConsumerFactory<>(props);
    }
    
    // 批处理消费者监听器容器工厂
    @Bean("batchConsumerListenerContainerFactory")
    public ConcurrentKafkaListenerContainerFactory<String, Object> batchConsumerListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(highThroughputConsumerFactory());
        
        // 启用批处理
        factory.setBatchListener(true);
        
        // 并发配置
        factory.setConcurrency(3); // 3个消费者线程
        
        // 错误处理
        factory.setCommonErrorHandler(new DefaultErrorHandler(
            new FixedBackOff(1000L, 3L) // 重试3次，每次间隔1秒
        ));
        
        // 手动确认模式
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        
        return factory;
    }
    
    // 单条消息消费者监听器容器工厂
    @Bean("singleConsumerListenerContainerFactory")
    public ConcurrentKafkaListenerContainerFactory<String, Object> singleConsumerListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(lowLatencyConsumerFactory());
        
        // 单条消息处理
        factory.setBatchListener(false);
        
        // 并发配置
        factory.setConcurrency(5); // 5个消费者线程
        
        // 错误处理
        factory.setCommonErrorHandler(new DefaultErrorHandler(
            new ExponentialBackOff(1000L, 2.0) // 指数退避
        ));
        
        return factory;
    }
}
```