# 第16天：Kafka Stream高级特性

## 课程目标
- 掌握自定义序列化器和反序列化器
- 学会使用处理器API构建复杂拓扑
- 了解拓扑优化技术
- 掌握错误处理和异常恢复策略
- 学会性能调优和监控

## 1. 自定义序列化器

### 1.1 序列化器基础

Kafka Streams支持多种序列化方式：
- **内置Serde**：String, Long, Double, ByteArray等
- **JSON Serde**：基于Jackson的JSON序列化
- **Avro Serde**：Schema Registry集成
- **自定义Serde**：针对特定业务对象

### 1.2 自定义JSON序列化器

```java
// 自定义JSON序列化器
public class JsonSerializer<T> implements Serializer<T> {
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Override
    public void configure(Map<String, ?> configs, boolean isKey) {
        // 配置序列化器
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        objectMapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
        objectMapper.registerModule(new JavaTimeModule());
    }
    
    @Override
    public byte[] serialize(String topic, T data) {
        if (data == null) {
            return null;
        }
        
        try {
            return objectMapper.writeValueAsBytes(data);
        } catch (Exception e) {
            throw new SerializationException("Error serializing JSON message", e);
        }
    }
    
    @Override
    public void close() {
        // 清理资源
    }
}

// 自定义JSON反序列化器
public class JsonDeserializer<T> implements Deserializer<T> {
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    private Class<T> targetType;
    
    public JsonDeserializer() {
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        objectMapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
        objectMapper.registerModule(new JavaTimeModule());
    }
    
    public JsonDeserializer(Class<T> targetType) {
        this();
        this.targetType = targetType;
    }
    
    @Override
    public void configure(Map<String, ?> configs, boolean isKey) {
        if (targetType == null) {
            String targetTypeName = (String) configs.get("json.value.type");
            if (targetTypeName != null) {
                try {
                    targetType = (Class<T>) Class.forName(targetTypeName);
                } catch (ClassNotFoundException e) {
                    throw new ConfigException("Class not found: " + targetTypeName, e);
                }
            }
        }
    }
    
    @Override
    public T deserialize(String topic, byte[] data) {
        if (data == null) {
            return null;
        }
        
        try {
            return objectMapper.readValue(data, targetType);
        } catch (Exception e) {
            throw new SerializationException("Error deserializing JSON message", e);
        }
    }
    
    @Override
    public void close() {
        // 清理资源
    }
}
```

### 1.3 Avro序列化器集成

```java
@Configuration
public class AvroSerdeConfig {
    
    @Value("${schema.registry.url}")
    private String schemaRegistryUrl;
    
    @Bean
    public Serde<User> userAvroSerde() {
        Map<String, String> serdeConfig = Map.of(
            AbstractKafkaSchemaSerDeConfig.SCHEMA_REGISTRY_URL_CONFIG, schemaRegistryUrl
        );
        
        Serde<User> serde = new SpecificAvroSerde<>();
        serde.configure(serdeConfig, false);
        return serde;
    }
    
    @Bean
    public Serde<Order> orderAvroSerde() {
        Map<String, String> serdeConfig = Map.of(
            AbstractKafkaSchemaSerDeConfig.SCHEMA_REGISTRY_URL_CONFIG, schemaRegistryUrl
        );
        
        Serde<Order> serde = new SpecificAvroSerde<>();
        serde.configure(serdeConfig, false);
        return serde;
    }
}

// 使用Avro Serde的流处理
@Component
public class AvroStreamProcessor {
    
    @Autowired
    private Serde<User> userAvroSerde;
    
    @Autowired
    private Serde<Order> orderAvroSerde;
    
    @Autowired
    public void buildAvroStreamPipeline(StreamsBuilder streamsBuilder) {
        
        // 使用Avro序列化的用户流
        KStream<String, User> userStream = streamsBuilder
            .stream("users-avro", Consumed.with(Serdes.String(), userAvroSerde));
        
        // 使用Avro序列化的订单流
        KStream<String, Order> orderStream = streamsBuilder
            .stream("orders-avro", Consumed.with(Serdes.String(), orderAvroSerde));
        
        // 连接用户和订单流
        KStream<String, EnrichedOrder> enrichedOrderStream = orderStream
            .join(
                userStream.toTable(Materialized.with(Serdes.String(), userAvroSerde)),
                (order, user) -> {
                    return EnrichedOrder.newBuilder()
                        .setOrderId(order.getOrderId())
                        .setUserId(order.getUserId())
                        .setAmount(order.getAmount())
                        .setUserName(user.getName())
                        .setUserEmail(user.getEmail())
                        .setOrderTime(order.getOrderTime())
                        .build();
                }
            );
        
        // 输出富化后的订单
        enrichedOrderStream.to("enriched-orders-avro", 
            Produced.with(Serdes.String(), getEnrichedOrderSerde()));
    }
    
    private Serde<EnrichedOrder> getEnrichedOrderSerde() {
        Map<String, String> serdeConfig = Map.of(
            AbstractKafkaSchemaSerDeConfig.SCHEMA_REGISTRY_URL_CONFIG, schemaRegistryUrl
        );
        
        Serde<EnrichedOrder> serde = new SpecificAvroSerde<>();
        serde.configure(serdeConfig, false);
        return serde;
    }
}
```

### 1.4 自定义业务对象序列化器

```java
// 自定义用户对象序列化器
public class UserSerializer implements Serializer<User> {
    
    @Override
    public byte[] serialize(String topic, User user) {
        if (user == null) {
            return null;
        }
        
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
             DataOutputStream dos = new DataOutputStream(baos)) {
            
            // 写入用户ID
            dos.writeUTF(user.getId() != null ? user.getId() : "");
            
            // 写入用户名
            dos.writeUTF(user.getName() != null ? user.getName() : "");
            
            // 写入邮箱
            dos.writeUTF(user.getEmail() != null ? user.getEmail() : "");
            
            // 写入年龄
            dos.writeInt(user.getAge());
            
            // 写入创建时间
            dos.writeLong(user.getCreatedAt() != null ? 
                user.getCreatedAt().toEpochMilli() : 0L);
            
            // 写入用户类型
            dos.writeUTF(user.getUserType() != null ? 
                user.getUserType().name() : UserType.REGULAR.name());
            
            return baos.toByteArray();
            
        } catch (IOException e) {
            throw new SerializationException("Error serializing User", e);
        }
    }
}

// 自定义用户对象反序列化器
public class UserDeserializer implements Deserializer<User> {
    
    @Override
    public User deserialize(String topic, byte[] data) {
        if (data == null) {
            return null;
        }
        
        try (ByteArrayInputStream bais = new ByteArrayInputStream(data);
             DataInputStream dis = new DataInputStream(bais)) {
            
            User user = new User();
            
            // 读取用户ID
            String id = dis.readUTF();
            user.setId(id.isEmpty() ? null : id);
            
            // 读取用户名
            String name = dis.readUTF();
            user.setName(name.isEmpty() ? null : name);
            
            // 读取邮箱
            String email = dis.readUTF();
            user.setEmail(email.isEmpty() ? null : email);
            
            // 读取年龄
            user.setAge(dis.readInt());
            
            // 读取创建时间
            long createdAtMillis = dis.readLong();
            user.setCreatedAt(createdAtMillis > 0 ? 
                Instant.ofEpochMilli(createdAtMillis) : null);
            
            // 读取用户类型
            String userTypeStr = dis.readUTF();
            user.setUserType(UserType.valueOf(userTypeStr));
            
            return user;
            
        } catch (IOException e) {
            throw new SerializationException("Error deserializing User", e);
        }
    }
}

// Serde工厂类
@Component
public class CustomSerdeFactory {
    
    public Serde<User> userSerde() {
        return Serdes.serdeFrom(new UserSerializer(), new UserDeserializer());
    }
    
    public <T> Serde<T> jsonSerde(Class<T> targetType) {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(targetType)
        );
    }
    
    public Serde<String> compressedStringSerde() {
        return Serdes.serdeFrom(
            new CompressedStringSerializer(),
            new CompressedStringDeserializer()
        );
    }
}
```

## 2. 处理器API

### 2.1 处理器API概述

处理器API提供了更底层的流处理控制：
- **更细粒度的控制**：精确控制处理逻辑
- **状态管理**：直接访问状态存储
- **时间控制**：自定义时间语义
- **错误处理**：灵活的异常处理策略

### 2.2 自定义处理器实现

```java
// 自定义用户行为分析处理器
public class UserBehaviorProcessor implements Processor<String, UserEvent, String, UserProfile> {
    
    private ProcessorContext<String, UserProfile> context;
    private KeyValueStore<String, UserProfile> userProfileStore;
    private KeyValueStore<String, UserBehaviorStats> behaviorStatsStore;
    
    @Override
    public void init(ProcessorContext<String, UserProfile> context) {
        this.context = context;
        
        // 获取状态存储
        this.userProfileStore = context.getStateStore("user-profile-store");
        this.behaviorStatsStore = context.getStateStore("behavior-stats-store");
        
        // 定期清理过期数据
        context.schedule(
            Duration.ofHours(1),
            PunctuationType.WALL_CLOCK_TIME,
            this::cleanupExpiredData
        );
        
        // 定期生成统计报告
        context.schedule(
            Duration.ofMinutes(15),
            PunctuationType.WALL_CLOCK_TIME,
            this::generateStatsReport
        );
    }
    
    @Override
    public void process(Record<String, UserEvent> record) {
        String userId = record.key();
        UserEvent event = record.value();
        
        if (userId == null || event == null) {
            return;
        }
        
        try {
            // 更新用户画像
            updateUserProfile(userId, event);
            
            // 更新行为统计
            updateBehaviorStats(userId, event);
            
            // 检测异常行为
            detectAnomalousActivity(userId, event);
            
            // 生成实时推荐
            generateRecommendations(userId, event);
            
        } catch (Exception e) {
            // 错误处理
            handleProcessingError(record, e);
        }
    }
    
    private void updateUserProfile(String userId, UserEvent event) {
        UserProfile profile = userProfileStore.get(userId);
        
        if (profile == null) {
            profile = new UserProfile(userId);
        }
        
        // 更新用户画像
        profile.addEvent(event);
        profile.updatePreferences(event);
        profile.setLastActiveTime(event.getTimestamp());
        
        // 计算用户价值分数
        profile.calculateValueScore();
        
        // 保存更新后的画像
        userProfileStore.put(userId, profile);
        
        // 转发更新后的用户画像
        context.forward(record.withValue(profile));
    }
    
    private void updateBehaviorStats(String userId, UserEvent event) {
        UserBehaviorStats stats = behaviorStatsStore.get(userId);
        
        if (stats == null) {
            stats = new UserBehaviorStats(userId);
        }
        
        // 更新行为统计
        stats.incrementEventCount(event.getEventType());
        stats.updateLastEventTime(event.getTimestamp());
        
        // 计算行为模式
        stats.calculateBehaviorPattern();
        
        behaviorStatsStore.put(userId, stats);
    }
    
    private void detectAnomalousActivity(String userId, UserEvent event) {
        UserBehaviorStats stats = behaviorStatsStore.get(userId);
        
        if (stats != null && stats.isAnomalousActivity(event)) {
            // 创建异常告警
            AnomalyAlert alert = new AnomalyAlert(
                userId,
                event,
                stats.getAnomalyScore(event),
                System.currentTimeMillis()
            );
            
            // 发送告警到下游
            context.forward(record.withKey("ANOMALY_" + userId).withValue(alert));
        }
    }
    
    private void generateRecommendations(String userId, UserEvent event) {
        UserProfile profile = userProfileStore.get(userId);
        
        if (profile != null && profile.shouldGenerateRecommendations()) {
            List<Recommendation> recommendations = 
                RecommendationEngine.generateRecommendations(profile, event);
            
            for (Recommendation rec : recommendations) {
                context.forward(record.withKey("REC_" + userId).withValue(rec));
            }
        }
    }
    
    private void handleProcessingError(Record<String, UserEvent> record, Exception e) {
        // 记录错误
        logger.error("Error processing user event: {}", record, e);
        
        // 创建错误记录
        ProcessingError error = new ProcessingError(
            record.key(),
            record.value(),
            e.getMessage(),
            System.currentTimeMillis()
        );
        
        // 发送到错误处理Topic
        context.forward(record.withKey("ERROR_" + record.key()).withValue(error));
    }
    
    private void cleanupExpiredData(long timestamp) {
        // 清理过期的用户画像
        try (KeyValueIterator<String, UserProfile> iterator = userProfileStore.all()) {
            while (iterator.hasNext()) {
                KeyValue<String, UserProfile> entry = iterator.next();
                UserProfile profile = entry.value;
                
                // 如果用户超过30天没有活动，删除画像
                if (timestamp - profile.getLastActiveTime() > Duration.ofDays(30).toMillis()) {
                    userProfileStore.delete(entry.key);
                    behaviorStatsStore.delete(entry.key);
                }
            }
        }
    }
    
    private void generateStatsReport(long timestamp) {
        // 生成统计报告
        StatsReport report = new StatsReport();
        report.setTimestamp(timestamp);
        
        int activeUsers = 0;
        int totalEvents = 0;
        
        try (KeyValueIterator<String, UserBehaviorStats> iterator = behaviorStatsStore.all()) {
            while (iterator.hasNext()) {
                KeyValue<String, UserBehaviorStats> entry = iterator.next();
                UserBehaviorStats stats = entry.value;
                
                if (stats.isActiveInLastHour(timestamp)) {
                    activeUsers++;
                }
                
                totalEvents += stats.getTotalEventCount();
            }
        }
        
        report.setActiveUsers(activeUsers);
        report.setTotalEvents(totalEvents);
        
        // 发送统计报告
        context.forward(new Record<>("STATS_REPORT", report, timestamp));
    }
    
    @Override
    public void close() {
        // 清理资源
    }
}
```

### 2.3 处理器拓扑构建

```java
@Component
public class ProcessorTopologyBuilder {
    
    @Autowired
    public void buildProcessorTopology(StreamsBuilder streamsBuilder) {
        
        // 创建状态存储
        StoreBuilder<KeyValueStore<String, UserProfile>> userProfileStoreBuilder = 
            Stores.keyValueStoreBuilder(
                Stores.persistentKeyValueStore("user-profile-store"),
                Serdes.String(),
                getUserProfileSerde()
            );
        
        StoreBuilder<KeyValueStore<String, UserBehaviorStats>> behaviorStatsStoreBuilder = 
            Stores.keyValueStoreBuilder(
                Stores.persistentKeyValueStore("behavior-stats-store"),
                Serdes.String(),
                getBehaviorStatsSerde()
            );
        
        // 添加状态存储到拓扑
        streamsBuilder.addStateStore(userProfileStoreBuilder);
        streamsBuilder.addStateStore(behaviorStatsStoreBuilder);
        
        // 构建处理器拓扑
        streamsBuilder
            .stream("user-events", Consumed.with(Serdes.String(), getUserEventSerde()))
            .process(
                () -> new UserBehaviorProcessor(),
                Named.as("user-behavior-processor"),
                "user-profile-store",
                "behavior-stats-store"
            )
            .branch(
                Named.as("output-branch"),
                Predicate.of((key, value) -> key.startsWith("ANOMALY_"), Branched.as("anomaly")),
                Predicate.of((key, value) -> key.startsWith("REC_"), Branched.as("recommendation")),
                Predicate.of((key, value) -> key.startsWith("ERROR_"), Branched.as("error")),
                Predicate.of((key, value) -> key.startsWith("STATS_"), Branched.as("stats"))
            )
            .get("output-branch-anomaly")
            .to("anomaly-alerts");
        
        streamsBuilder
            .stream("output-branch-recommendation")
            .to("user-recommendations");
        
        streamsBuilder
            .stream("output-branch-error")
            .to("processing-errors");
        
        streamsBuilder
            .stream("output-branch-stats")
            .to("stats-reports");
    }
    
    private Serde<UserProfile> getUserProfileSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserProfile.class)
        );
    }
    
    private Serde<UserBehaviorStats> getBehaviorStatsSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserBehaviorStats.class)
        );
    }
    
    private Serde<UserEvent> getUserEventSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserEvent.class)
        );
    }
}
```

## 3. 拓扑优化

### 3.1 拓扑优化策略

```java
@Component
public class TopologyOptimizer {
    
    @Autowired
    public void buildOptimizedTopology(StreamsBuilder streamsBuilder) {
        
        // 1. 合并相似的操作
        KStream<String, String> sourceStream = streamsBuilder
            .stream("input-topic");
        
        // 不优化的写法：多次过滤和映射
        /*
        KStream<String, String> filtered1 = sourceStream.filter((k, v) -> v != null);
        KStream<String, String> filtered2 = filtered1.filter((k, v) -> !v.isEmpty());
        KStream<String, String> mapped1 = filtered2.map((k, v) -> KeyValue.pair(k, v.trim()));
        KStream<String, String> mapped2 = mapped1.map((k, v) -> KeyValue.pair(k, v.toLowerCase()));
        */
        
        // 优化后的写法：合并操作
        KStream<String, String> optimizedStream = sourceStream
            .filter((k, v) -> v != null && !v.isEmpty())
            .mapValues(v -> v.trim().toLowerCase());
        
        // 2. 使用合适的分区策略
        KStream<String, String> repartitionedStream = optimizedStream
            .selectKey((key, value) -> {
                // 使用业务相关的键进行分区
                return extractBusinessKey(value);
            })
            .repartition(Repartitioned.<String, String>as("business-key-repartition")
                .withNumberOfPartitions(12) // 根据负载设置分区数
                .withKeySerde(Serdes.String())
                .withValueSerde(Serdes.String()));
        
        // 3. 优化聚合操作
        KTable<String, Long> optimizedAggregation = repartitionedStream
            .groupByKey(Grouped.with(Serdes.String(), Serdes.String()))
            .count(Materialized.<String, Long, KeyValueStore<Bytes, byte[]>>as("optimized-count")
                .withCachingEnabled() // 启用缓存
                .withLoggingEnabled(Map.of(
                    TopicConfig.CLEANUP_POLICY_CONFIG, TopicConfig.CLEANUP_POLICY_COMPACT,
                    TopicConfig.MIN_COMPACTION_LAG_MS_CONFIG, "60000"
                ))
                .withKeySerde(Serdes.String())
                .withValueSerde(Serdes.Long()));
        
        // 4. 批量处理优化
        optimizedStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
            .aggregate(
                ArrayList::new,
                (key, value, aggregate) -> {
                    aggregate.add(value);
                    return aggregate;
                },
                Materialized.<String, List<String>, WindowStore<Bytes, byte[]>>as("batch-aggregation")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getListSerde())
            )
            .toStream()
            .filter((windowedKey, batch) -> batch.size() >= 10) // 只处理批量数据
            .mapValues(this::processBatch)
            .to("batch-processed-output");
        
        // 5. 并行处理优化
        optimizedStream
            .split(Named.as("parallel-processing-"))
            .branch((key, value) -> value.startsWith("A"), Branched.as("group-a"))
            .branch((key, value) -> value.startsWith("B"), Branched.as("group-b"))
            .branch((key, value) -> value.startsWith("C"), Branched.as("group-c"))
            .defaultBranch(Branched.as("group-default"));
        
        // 并行处理不同分组
        processGroupA(streamsBuilder.stream("parallel-processing-group-a"));
        processGroupB(streamsBuilder.stream("parallel-processing-group-b"));
        processGroupC(streamsBuilder.stream("parallel-processing-group-c"));
        processGroupDefault(streamsBuilder.stream("parallel-processing-group-default"));
    }
    
    private String extractBusinessKey(String value) {
        // 从消息中提取业务键
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(value);
            return node.get("businessId").asText();
        } catch (Exception e) {
            return "default";
        }
    }
    
    private String processBatch(List<String> batch) {
        // 批量处理逻辑
        return String.format("Processed batch of %d items", batch.size());
    }
    
    private void processGroupA(KStream<String, String> stream) {
        stream
            .mapValues(value -> "GROUP_A: " + value)
            .to("group-a-output");
    }
    
    private void processGroupB(KStream<String, String> stream) {
        stream
            .mapValues(value -> "GROUP_B: " + value)
            .to("group-b-output");
    }
    
    private void processGroupC(KStream<String, String> stream) {
        stream
            .mapValues(value -> "GROUP_C: " + value)
            .to("group-c-output");
    }
    
    private void processGroupDefault(KStream<String, String> stream) {
        stream
            .mapValues(value -> "DEFAULT: " + value)
            .to("default-output");
    }
    
    private Serde<List<String>> getListSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(List.class)
        );
    }
}
```

### 3.2 性能监控和调优

```java
@Component
public class StreamsPerformanceMonitor {
    
    private final MeterRegistry meterRegistry;
    private final Timer processingTimer;
    private final Counter recordsProcessedCounter;
    private final Gauge lagGauge;
    
    public StreamsPerformanceMonitor(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        
        this.processingTimer = Timer.builder("streams.processing.time")
            .description("Time taken to process records")
            .register(meterRegistry);
            
        this.recordsProcessedCounter = Counter.builder("streams.records.processed")
            .description("Number of records processed")
            .register(meterRegistry);
            
        this.lagGauge = Gauge.builder("streams.consumer.lag")
            .description("Consumer lag in milliseconds")
            .register(meterRegistry, this, StreamsPerformanceMonitor::getCurrentLag);
    }
    
    @EventListener
    public void handleStreamsMetrics(KafkaStreamsMetrics metrics) {
        // 处理Kafka Streams指标
        metrics.getMetrics().forEach((metricName, metric) -> {
            String name = metricName.name();
            String group = metricName.group();
            
            if ("stream-metrics".equals(group)) {
                recordStreamMetric(name, metric.metricValue());
            } else if ("stream-processor-node-metrics".equals(group)) {
                recordProcessorMetric(name, metric.metricValue());
            }
        });
    }
    
    private void recordStreamMetric(String metricName, Object value) {
        if (value instanceof Number) {
            double numericValue = ((Number) value).doubleValue();
            
            switch (metricName) {
                case "process-rate":
                    Gauge.builder("streams.process.rate")
                        .register(meterRegistry, () -> numericValue);
                    break;
                case "process-latency-avg":
                    Gauge.builder("streams.process.latency.avg")
                        .register(meterRegistry, () -> numericValue);
                    break;
                case "commit-rate":
                    Gauge.builder("streams.commit.rate")
                        .register(meterRegistry, () -> numericValue);
                    break;
            }
        }
    }
    
    private void recordProcessorMetric(String metricName, Object value) {
        if (value instanceof Number) {
            double numericValue = ((Number) value).doubleValue();
            
            switch (metricName) {
                case "process-total":
                    recordsProcessedCounter.increment(numericValue);
                    break;
                case "process-latency-max":
                    Gauge.builder("streams.processor.latency.max")
                        .register(meterRegistry, () -> numericValue);
                    break;
            }
        }
    }
    
    private double getCurrentLag() {
        // 计算当前消费者滞后
        // 这里简化实现，实际应该从Kafka Streams获取真实的lag信息
        return 0.0;
    }
    
    @Scheduled(fixedRate = 30000) // 每30秒执行一次
    public void reportPerformanceMetrics() {
        // 生成性能报告
        PerformanceReport report = new PerformanceReport();
        report.setTimestamp(System.currentTimeMillis());
        report.setProcessingRate(getProcessingRate());
        report.setAverageLatency(getAverageLatency());
        report.setMemoryUsage(getMemoryUsage());
        report.setCpuUsage(getCpuUsage());
        
        // 发送性能报告
        publishPerformanceReport(report);
        
        // 检查性能阈值
        checkPerformanceThresholds(report);
    }
    
    private double getProcessingRate() {
        return processingTimer.count() / (processingTimer.totalTime(TimeUnit.SECONDS) / 60.0);
    }
    
    private double getAverageLatency() {
        return processingTimer.mean(TimeUnit.MILLISECONDS);
    }
    
    private double getMemoryUsage() {
        MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
        MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
        return (double) heapUsage.getUsed() / heapUsage.getMax() * 100;
    }
    
    private double getCpuUsage() {
        OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
        if (osBean instanceof com.sun.management.OperatingSystemMXBean) {
            return ((com.sun.management.OperatingSystemMXBean) osBean).getProcessCpuLoad() * 100;
        }
        return 0.0;
    }
    
    private void publishPerformanceReport(PerformanceReport report) {
        // 发布性能报告到监控系统
        logger.info("Performance Report: {}", report);
    }
    
    private void checkPerformanceThresholds(PerformanceReport report) {
        // 检查性能阈值并发送告警
        if (report.getAverageLatency() > 1000) { // 延迟超过1秒
            sendAlert("High Latency Alert", 
                String.format("Average latency: %.2f ms", report.getAverageLatency()));
        }
        
        if (report.getMemoryUsage() > 80) { // 内存使用超过80%
            sendAlert("High Memory Usage Alert", 
                String.format("Memory usage: %.2f%%", report.getMemoryUsage()));
        }
        
        if (report.getCpuUsage() > 90) { // CPU使用超过90%
            sendAlert("High CPU Usage Alert", 
                String.format("CPU usage: %.2f%%", report.getCpuUsage()));
        }
    }
    
    private void sendAlert(String title, String message) {
        // 发送告警
        logger.warn("ALERT: {} - {}", title, message);
        // 这里可以集成实际的告警系统
    }
}
```

## 4. 错误处理和异常恢复

### 4.1 全局异常处理器

```java
@Component
public class GlobalExceptionHandler implements StreamsUncaughtExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @Autowired
    private AlertService alertService;
    
    @Autowired
    private MetricsService metricsService;
    
    @Override
    public StreamThreadExceptionResponse handle(Throwable exception) {
        logger.error("Uncaught exception in Kafka Streams thread", exception);
        
        // 记录异常指标
        metricsService.recordException(exception);
        
        // 根据异常类型决定处理策略
        if (exception instanceof SerializationException) {
            return handleSerializationException((SerializationException) exception);
        } else if (exception instanceof ProcessorStateException) {
            return handleStateException((ProcessorStateException) exception);
        } else if (exception instanceof StreamsException) {
            return handleStreamsException((StreamsException) exception);
        } else {
            return handleGenericException(exception);
        }
    }
    
    private StreamThreadExceptionResponse handleSerializationException(SerializationException e) {
        logger.error("Serialization error occurred", e);
        
        // 发送告警
        alertService.sendAlert(
            "Kafka Streams Serialization Error",
            "Serialization error: " + e.getMessage()
        );
        
        // 序列化错误通常是数据问题，继续处理其他消息
        return StreamThreadExceptionResponse.REPLACE_THREAD;
    }
    
    private StreamThreadExceptionResponse handleStateException(ProcessorStateException e) {
        logger.error("State store error occurred", e);
        
        // 状态存储错误可能需要重建状态
        alertService.sendAlert(
            "Kafka Streams State Error",
            "State store error: " + e.getMessage()
        );
        
        // 尝试恢复状态
        return StreamThreadExceptionResponse.REPLACE_THREAD;
    }
    
    private StreamThreadExceptionResponse handleStreamsException(StreamsException e) {
        logger.error("Kafka Streams error occurred", e);
        
        alertService.sendAlert(
            "Kafka Streams Error",
            "Streams error: " + e.getMessage()
        );
        
        // 检查是否是致命错误
        if (isFatalError(e)) {
            return StreamThreadExceptionResponse.SHUTDOWN_APPLICATION;
        } else {
            return StreamThreadExceptionResponse.REPLACE_THREAD;
        }
    }
    
    private StreamThreadExceptionResponse handleGenericException(Throwable e) {
        logger.error("Generic error occurred", e);
        
        alertService.sendAlert(
            "Kafka Streams Generic Error",
            "Generic error: " + e.getMessage()
        );
        
        // 对于未知错误，采用保守策略
        return StreamThreadExceptionResponse.REPLACE_THREAD;
    }
    
    private boolean isFatalError(StreamsException e) {
        // 判断是否是致命错误
        String message = e.getMessage().toLowerCase();
        return message.contains("authentication") ||
               message.contains("authorization") ||
               message.contains("security") ||
               message.contains("broker not available");
    }
}
```

### 4.2 自定义错误处理策略

```java
@Component
public class CustomErrorHandlingProcessor implements Processor<String, String, String, Object> {
    
    private ProcessorContext<String, Object> context;
    private KeyValueStore<String, ErrorRecord> errorStore;
    private final AtomicLong errorCount = new AtomicLong(0);
    
    @Override
    public void init(ProcessorContext<String, Object> context) {
        this.context = context;
        this.errorStore = context.getStateStore("error-store");
        
        // 定期清理错误记录
        context.schedule(
            Duration.ofHours(6),
            PunctuationType.WALL_CLOCK_TIME,
            this::cleanupErrorRecords
        );
    }
    
    @Override
    public void process(Record<String, String> record) {
        String key = record.key();
        String value = record.value();
        
        try {
            // 尝试处理记录
            Object processedValue = processRecord(key, value);
            
            // 处理成功，转发结果
            context.forward(record.withValue(processedValue));
            
            // 清除之前的错误记录
            clearErrorRecord(key);
            
        } catch (Exception e) {
            // 处理失败，执行错误处理策略
            handleProcessingError(record, e);
        }
    }
    
    private Object processRecord(String key, String value) throws Exception {
        // 模拟可能出错的处理逻辑
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Empty value");
        }
        
        if (value.contains("error")) {
            throw new ProcessingException("Simulated processing error");
        }
        
        // 正常处理逻辑
        return value.toUpperCase();
    }
    
    private void handleProcessingError(Record<String, String> record, Exception e) {
        String key = record.key();
        
        // 获取或创建错误记录
        ErrorRecord errorRecord = errorStore.get(key);
        if (errorRecord == null) {
            errorRecord = new ErrorRecord(key);
        }
        
        // 更新错误信息
        errorRecord.addError(e, record.value(), record.timestamp());
        
        // 根据错误次数决定处理策略
        ErrorHandlingStrategy strategy = determineErrorStrategy(errorRecord);
        
        switch (strategy) {
            case RETRY:
                handleRetry(record, errorRecord);
                break;
            case SKIP:
                handleSkip(record, errorRecord);
                break;
            case DEAD_LETTER:
                handleDeadLetter(record, errorRecord);
                break;
            case ALERT:
                handleAlert(record, errorRecord);
                break;
        }
        
        // 保存错误记录
        errorStore.put(key, errorRecord);
        
        // 更新错误计数
        errorCount.incrementAndGet();
    }
    
    private ErrorHandlingStrategy determineErrorStrategy(ErrorRecord errorRecord) {
        int errorCount = errorRecord.getErrorCount();
        String lastErrorType = errorRecord.getLastErrorType();
        
        // 根据错误次数和类型决定策略
        if (errorCount <= 3 && !"SerializationException".equals(lastErrorType)) {
            return ErrorHandlingStrategy.RETRY;
        } else if (errorCount <= 5 && "IllegalArgumentException".equals(lastErrorType)) {
            return ErrorHandlingStrategy.SKIP;
        } else if (errorCount > 10) {
            return ErrorHandlingStrategy.ALERT;
        } else {
            return ErrorHandlingStrategy.DEAD_LETTER;
        }
    }
    
    private void handleRetry(Record<String, String> record, ErrorRecord errorRecord) {
        // 延迟重试
        long delay = calculateRetryDelay(errorRecord.getErrorCount());
        
        // 创建重试任务
        RetryTask retryTask = new RetryTask(
            record.key(),
            record.value(),
            record.timestamp(),
            System.currentTimeMillis() + delay
        );
        
        // 发送到重试Topic
        context.forward(record.withKey("RETRY_" + record.key()).withValue(retryTask));
        
        logger.info("Scheduled retry for key: {}, attempt: {}", 
            record.key(), errorRecord.getErrorCount());
    }
    
    private void handleSkip(Record<String, String> record, ErrorRecord errorRecord) {
        // 跳过处理，记录日志
        logger.warn("Skipping record due to repeated errors: key={}, errors={}", 
            record.key(), errorRecord.getErrorCount());
        
        // 发送跳过通知
        SkipNotification notification = new SkipNotification(
            record.key(),
            record.value(),
            errorRecord.getLastErrorMessage(),
            System.currentTimeMillis()
        );
        
        context.forward(record.withKey("SKIP_" + record.key()).withValue(notification));
    }
    
    private void handleDeadLetter(Record<String, String> record, ErrorRecord errorRecord) {
        // 发送到死信队列
        DeadLetterRecord dlqRecord = new DeadLetterRecord(
            record.key(),
            record.value(),
            record.timestamp(),
            errorRecord.getAllErrors(),
            System.currentTimeMillis()
        );
        
        context.forward(record.withKey("DLQ_" + record.key()).withValue(dlqRecord));
        
        logger.error("Sent record to dead letter queue: key={}, errors={}", 
            record.key(), errorRecord.getErrorCount());
    }
    
    private void handleAlert(Record<String, String> record, ErrorRecord errorRecord) {
        // 发送告警
        CriticalAlert alert = new CriticalAlert(
            record.key(),
            "High error rate detected",
            String.format("Record %s has failed %d times", 
                record.key(), errorRecord.getErrorCount()),
            System.currentTimeMillis()
        );
        
        context.forward(record.withKey("ALERT_" + record.key()).withValue(alert));
        
        logger.error("Critical alert sent for key: {}, errors={}", 
            record.key(), errorRecord.getErrorCount());
    }
    
    private long calculateRetryDelay(int attemptCount) {
        // 指数退避算法
        return Math.min(1000L * (1L << attemptCount), 60000L); // 最大1分钟
    }
    
    private void clearErrorRecord(String key) {
        ErrorRecord errorRecord = errorStore.get(key);
        if (errorRecord != null) {
            errorStore.delete(key);
        }
    }
    
    private void cleanupErrorRecords(long timestamp) {
        // 清理过期的错误记录
        try (KeyValueIterator<String, ErrorRecord> iterator = errorStore.all()) {
            while (iterator.hasNext()) {
                KeyValue<String, ErrorRecord> entry = iterator.next();
                ErrorRecord errorRecord = entry.value;
                
                // 如果错误记录超过24小时，删除它
                if (timestamp - errorRecord.getLastErrorTime() > Duration.ofHours(24).toMillis()) {
                    errorStore.delete(entry.key);
                }
            }
        }
    }
    
    @Override
    public void close() {
        logger.info("Closing error handling processor. Total errors processed: {}", 
            errorCount.get());
    }
}

// 错误处理策略枚举
enum ErrorHandlingStrategy {
    RETRY,
    SKIP,
    DEAD_LETTER,
    ALERT
}
```

### 4.3 状态恢复和容错

```java
@Component
public class StateRecoveryManager {
    
    private static final Logger logger = LoggerFactory.getLogger(StateRecoveryManager.class);
    
    @Autowired
    private KafkaStreams kafkaStreams;
    
    @EventListener
    public void handleStateChange(KafkaStreams.StateListener.StateChangeEvent event) {
        KafkaStreams.State newState = event.newState();
        KafkaStreams.State oldState = event.oldState();
        
        logger.info("Kafka Streams state changed from {} to {}", oldState, newState);
        
        switch (newState) {
            case REBALANCING:
                handleRebalancing();
                break;
            case RUNNING:
                handleRunning(oldState);
                break;
            case ERROR:
                handleError();
                break;
            case NOT_RUNNING:
                handleNotRunning();
                break;
        }
    }
    
    private void handleRebalancing() {
        logger.info("Kafka Streams is rebalancing...");
        // 可以在这里暂停某些操作或发送通知
    }
    
    private void handleRunning(KafkaStreams.State previousState) {
        logger.info("Kafka Streams is now running");
        
        if (previousState == KafkaStreams.State.REBALANCING) {
            logger.info("Rebalancing completed, resuming normal operations");
            // 恢复正常操作
        } else if (previousState == KafkaStreams.State.ERROR) {
            logger.info("Recovered from error state");
            // 从错误状态恢复
            performStateValidation();
        }
    }
    
    private void handleError() {
        logger.error("Kafka Streams entered error state");
        
        // 尝试自动恢复
        scheduleRecoveryAttempt();
    }
    
    private void handleNotRunning() {
        logger.warn("Kafka Streams is not running");
        // 可能需要重启应用或发送告警
    }
    
    private void performStateValidation() {
        // 验证状态存储的完整性
        try {
            validateStateStores();
            logger.info("State validation completed successfully");
        } catch (Exception e) {
            logger.error("State validation failed", e);
            // 可能需要重建状态
            scheduleStateRebuild();
        }
    }
    
    private void validateStateStores() {
        // 验证关键状态存储
        validateKeyValueStore("user-profile-store");
        validateKeyValueStore("behavior-stats-store");
        validateWindowStore("user-activity-windows");
    }
    
    private void validateKeyValueStore(String storeName) {
        try {
            ReadOnlyKeyValueStore<String, String> store = kafkaStreams
                .store(StoreQueryParameters.fromNameAndType(
                    storeName,
                    QueryableStoreTypes.keyValueStore()
                ));
            
            // 简单的验证：检查存储是否可访问
            long count = store.approximateNumEntries();
            logger.info("Store {} contains approximately {} entries", storeName, count);
            
        } catch (Exception e) {
            throw new StateValidationException("Failed to validate store: " + storeName, e);
        }
    }
    
    private void validateWindowStore(String storeName) {
        try {
            ReadOnlyWindowStore<String, String> windowStore = kafkaStreams
                .store(StoreQueryParameters.fromNameAndType(
                    storeName,
                    QueryableStoreTypes.windowStore()
                ));
            
            // 验证窗口存储
            Instant now = Instant.now();
            Instant from = now.minus(Duration.ofHours(1));
            
            // 尝试查询最近1小时的数据
            try (KeyValueIterator<Windowed<String>, String> iterator = 
                    windowStore.fetchAll(from, now)) {
                
                int count = 0;
                while (iterator.hasNext() && count < 10) {
                    iterator.next();
                    count++;
                }
                
                logger.info("Window store {} validation completed, sample size: {}", 
                    storeName, count);
            }
            
        } catch (Exception e) {
            throw new StateValidationException("Failed to validate window store: " + storeName, e);
        }
    }
    
    private void scheduleRecoveryAttempt() {
        // 延迟重试恢复
        CompletableFuture.delayedExecutor(30, TimeUnit.SECONDS)
            .execute(() -> {
                try {
                    logger.info("Attempting to recover Kafka Streams...");
                    
                    // 尝试重启流处理
                    if (kafkaStreams.state() == KafkaStreams.State.ERROR) {
                        kafkaStreams.cleanUp();
                        kafkaStreams.start();
                    }
                    
                } catch (Exception e) {
                    logger.error("Recovery attempt failed", e);
                    // 可以发送告警或尝试其他恢复策略
                }
            });
    }
    
    private void scheduleStateRebuild() {
        // 安排状态重建
        logger.info("Scheduling state rebuild...");
        
        CompletableFuture.runAsync(() -> {
            try {
                // 停止流处理
                kafkaStreams.close();
                
                // 清理本地状态
                kafkaStreams.cleanUp();
                
                // 重新启动（这将触发状态重建）
                kafkaStreams.start();
                
                logger.info("State rebuild initiated");
                
            } catch (Exception e) {
                logger.error("State rebuild failed", e);
            }
        });
    }
}

// 自定义异常类
class StateValidationException extends RuntimeException {
    public StateValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}

class ProcessingException extends RuntimeException {
    public ProcessingException(String message) {
        super(message);
    }
}
```

## 实战案例：金融交易实时风控系统

### 案例背景
构建一个金融交易实时风控系统，对交易进行实时监控、风险评估和异常检测。

### 系统架构
```
交易事件 -> Kafka -> Stream处理 -> [风险评估, 异常检测, 实时告警]
    ↓          ↓         ↓              ↓
  交易数据   分区处理   规则引擎      风控决策
    ↓          ↓         ↓              ↓
  用户画像   状态存储   机器学习      自动拦截
```

### 核心实现

```java
@Component
public class RiskControlProcessor {
    
    @Autowired
    public void buildRiskControlPipeline(StreamsBuilder streamsBuilder) {
        
        // 交易事件流
        KStream<String, String> transactionStream = streamsBuilder
            .stream("transaction-events");
        
        // 解析交易事件
        KStream<String, Transaction> parsedTransactionStream = transactionStream
            .mapValues(value -> {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    return mapper.readValue(value, Transaction.class);
                } catch (Exception e) {
                    return null;
                }
            })
            .filter((key, value) -> value != null)
            .selectKey((key, transaction) -> transaction.getUserId());
        
        // 用户风险画像表
        KTable<String, UserRiskProfile> userRiskTable = streamsBuilder
            .table("user-risk-profiles", Consumed.with(Serdes.String(), getUserRiskProfileSerde()));
        
        // 富化交易数据
        KStream<String, EnrichedTransaction> enrichedTransactionStream = parsedTransactionStream
            .leftJoin(
                userRiskTable,
                (transaction, riskProfile) -> {
                    EnrichedTransaction enriched = new EnrichedTransaction(transaction);
                    if (riskProfile != null) {
                        enriched.setUserRiskLevel(riskProfile.getRiskLevel());
                        enriched.setHistoricalBehavior(riskProfile.getHistoricalBehavior());
                    }
                    return enriched;
                }
            );
        
        // 实时风险评估
        KStream<String, RiskAssessmentResult> riskAssessmentStream = enrichedTransactionStream
            .mapValues(this::assessTransactionRisk);
        
        // 异常检测（基于滑动窗口）
        KTable<Windowed<String>, AnomalyDetectionResult> anomalyDetectionTable = enrichedTransactionStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeAndGrace(
                Duration.ofMinutes(15), // 15分钟窗口
                Duration.ofMinutes(1)   // 1分钟宽限期
            ).advanceBy(Duration.ofMinutes(5))) // 每5分钟滑动
            .aggregate(
                TransactionWindow::new,
                (key, transaction, window) -> {
                    window.addTransaction(transaction);
                    return window;
                },
                Materialized.<String, TransactionWindow, WindowStore<Bytes, byte[]>>as("transaction-windows")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getTransactionWindowSerde())
            )
            .mapValues(this::detectAnomalies);
        
        // 风控决策
        KStream<String, RiskControlDecision> decisionStream = riskAssessmentStream
            .map((key, assessment) -> {
                RiskControlDecision decision = makeRiskControlDecision(assessment);
                return KeyValue.pair(key, decision);
            });
        
        // 分流处理不同风险级别的交易
        Map<String, KStream<String, RiskControlDecision>> riskBranches = decisionStream
            .split(Named.as("risk-level-"))
            .branch((key, decision) -> decision.getRiskLevel() == RiskLevel.HIGH, 
                Branched.as("high"))
            .branch((key, decision) -> decision.getRiskLevel() == RiskLevel.MEDIUM, 
                Branched.as("medium"))
            .branch((key, decision) -> decision.getRiskLevel() == RiskLevel.LOW, 
                Branched.as("low"))
            .defaultBranch(Branched.as("unknown"));
        
        // 高风险交易处理
        riskBranches.get("risk-level-high")
            .mapValues(this::createHighRiskAlert)
            .to("high-risk-alerts");
        
        // 中风险交易处理
        riskBranches.get("risk-level-medium")
            .mapValues(this::createMediumRiskWarning)
            .to("medium-risk-warnings");
        
        // 低风险交易正常处理
        riskBranches.get("risk-level-low")
            .mapValues(this::createLowRiskLog)
            .to("transaction-logs");
        
        // 异常检测结果处理
        anomalyDetectionTable
            .toStream()
            .filter((windowedKey, result) -> result.isAnomalyDetected())
            .map((windowedKey, result) -> {
                String key = windowedKey.key();
                AnomalyAlert alert = new AnomalyAlert(
                    key,
                    result.getAnomalyType(),
                    result.getAnomalyScore(),
                    windowedKey.window().start(),
                    windowedKey.window().end()
                );
                return KeyValue.pair(key, alert);
            })
            .to("anomaly-alerts");
    }
    
    private RiskAssessmentResult assessTransactionRisk(EnrichedTransaction transaction) {
        RiskAssessmentResult result = new RiskAssessmentResult();
        result.setTransactionId(transaction.getTransactionId());
        result.setUserId(transaction.getUserId());
        result.setTimestamp(System.currentTimeMillis());
        
        double riskScore = 0.0;
        List<String> riskFactors = new ArrayList<>();
        
        // 1. 交易金额风险评估
        if (transaction.getAmount() > 100000) { // 大额交易
            riskScore += 30;
            riskFactors.add("HIGH_AMOUNT");
        } else if (transaction.getAmount() > 50000) {
            riskScore += 15;
            riskFactors.add("MEDIUM_AMOUNT");
        }
        
        // 2. 交易时间风险评估
        LocalTime transactionTime = LocalTime.ofInstant(
            Instant.ofEpochMilli(transaction.getTimestamp()), 
            ZoneId.systemDefault()
        );
        
        if (transactionTime.isBefore(LocalTime.of(6, 0)) || 
            transactionTime.isAfter(LocalTime.of(23, 0))) {
            riskScore += 20;
            riskFactors.add("OFF_HOURS");
        }
        
        // 3. 用户历史行为风险评估
        if (transaction.getUserRiskLevel() == UserRiskLevel.HIGH) {
            riskScore += 40;
            riskFactors.add("HIGH_RISK_USER");
        } else if (transaction.getUserRiskLevel() == UserRiskLevel.MEDIUM) {
            riskScore += 20;
            riskFactors.add("MEDIUM_RISK_USER");
        }
        
        // 4. 交易类型风险评估
        if ("TRANSFER".equals(transaction.getTransactionType())) {
            riskScore += 10;
            riskFactors.add("TRANSFER_TRANSACTION");
        } else if ("WITHDRAWAL".equals(transaction.getTransactionType())) {
            riskScore += 15;
            riskFactors.add("WITHDRAWAL_TRANSACTION");
        }
        
        // 5. 地理位置风险评估
        if (transaction.getLocation() != null && 
            !transaction.getLocation().equals(transaction.getHistoricalBehavior().getCommonLocation())) {
            riskScore += 25;
            riskFactors.add("UNUSUAL_LOCATION");
        }
        
        // 确定风险级别
        RiskLevel riskLevel;
        if (riskScore >= 70) {
            riskLevel = RiskLevel.HIGH;
        } else if (riskScore >= 40) {
            riskLevel = RiskLevel.MEDIUM;
        } else {
            riskLevel = RiskLevel.LOW;
        }
        
        result.setRiskScore(riskScore);
        result.setRiskLevel(riskLevel);
        result.setRiskFactors(riskFactors);
        
        return result;
    }
    
    private AnomalyDetectionResult detectAnomalies(TransactionWindow window) {
        AnomalyDetectionResult result = new AnomalyDetectionResult();
        result.setUserId(window.getUserId());
        result.setWindowStart(window.getWindowStart());
        result.setWindowEnd(window.getWindowEnd());
        
        List<EnrichedTransaction> transactions = window.getTransactions();
        
        // 1. 频率异常检测
        if (transactions.size() > 20) { // 15分钟内超过20笔交易
            result.setAnomalyDetected(true);
            result.setAnomalyType("HIGH_FREQUENCY");
            result.setAnomalyScore(80.0);
            return result;
        }
        
        // 2. 金额异常检测
        double totalAmount = transactions.stream()
            .mapToDouble(EnrichedTransaction::getAmount)
            .sum();
        
        if (totalAmount > 500000) { // 15分钟内总金额超过50万
            result.setAnomalyDetected(true);
            result.setAnomalyType("HIGH_AMOUNT");
            result.setAnomalyScore(90.0);
            return result;
        }
        
        // 3. 行为模式异常检测
        Set<String> uniqueLocations = transactions.stream()
            .map(EnrichedTransaction::getLocation)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        
        if (uniqueLocations.size() > 3) { // 15分钟内在超过3个不同地点交易
            result.setAnomalyDetected(true);
            result.setAnomalyType("LOCATION_JUMPING");
            result.setAnomalyScore(75.0);
            return result;
        }
        
        // 4. 时间模式异常检测
        boolean hasNightTransactions = transactions.stream()
            .anyMatch(t -> {
                LocalTime time = LocalTime.ofInstant(
                    Instant.ofEpochMilli(t.getTimestamp()),
                    ZoneId.systemDefault()
                );
                return time.isBefore(LocalTime.of(5, 0)) || time.isAfter(LocalTime.of(23, 30));
            });
        
        if (hasNightTransactions && transactions.size() > 5) {
            result.setAnomalyDetected(true);
            result.setAnomalyType("NIGHT_ACTIVITY");
            result.setAnomalyScore(60.0);
            return result;
        }
        
        result.setAnomalyDetected(false);
        result.setAnomalyScore(0.0);
        return result;
    }
    
    private RiskControlDecision makeRiskControlDecision(RiskAssessmentResult assessment) {
        RiskControlDecision decision = new RiskControlDecision();
        decision.setTransactionId(assessment.getTransactionId());
        decision.setUserId(assessment.getUserId());
        decision.setRiskLevel(assessment.getRiskLevel());
        decision.setRiskScore(assessment.getRiskScore());
        decision.setTimestamp(System.currentTimeMillis());
        
        // 根据风险级别做出决策
        switch (assessment.getRiskLevel()) {
            case HIGH:
                decision.setAction("BLOCK");
                decision.setReason("High risk transaction detected: " + 
                    String.join(", ", assessment.getRiskFactors()));
                decision.setRequiresManualReview(true);
                break;
            case MEDIUM:
                decision.setAction("REVIEW");
                decision.setReason("Medium risk transaction requires review: " + 
                    String.join(", ", assessment.getRiskFactors()));
                decision.setRequiresManualReview(true);
                break;
            case LOW:
                decision.setAction("APPROVE");
                decision.setReason("Low risk transaction approved");
                decision.setRequiresManualReview(false);
                break;
        }
        
        return decision;
    }
    
    private HighRiskAlert createHighRiskAlert(RiskControlDecision decision) {
        return new HighRiskAlert(
            decision.getTransactionId(),
            decision.getUserId(),
            decision.getRiskScore(),
            decision.getReason(),
            System.currentTimeMillis()
        );
    }
    
    private MediumRiskWarning createMediumRiskWarning(RiskControlDecision decision) {
        return new MediumRiskWarning(
            decision.getTransactionId(),
            decision.getUserId(),
            decision.getRiskScore(),
            decision.getReason(),
            System.currentTimeMillis()
        );
    }
    
    private TransactionLog createLowRiskLog(RiskControlDecision decision) {
        return new TransactionLog(
            decision.getTransactionId(),
            decision.getUserId(),
            "APPROVED",
            System.currentTimeMillis()
        );
    }
    
    // Serde工厂方法
    private Serde<UserRiskProfile> getUserRiskProfileSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserRiskProfile.class)
        );
    }
    
    private Serde<TransactionWindow> getTransactionWindowSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(TransactionWindow.class)
        );
    }
}
```

## 实战练习

### 练习1：自定义序列化器实现

**任务**：为电商订单对象实现自定义的二进制序列化器。

**要求**：
1. 实现高效的二进制序列化
2. 支持版本兼容性
3. 处理null值和异常情况
4. 添加性能测试

### 练习2：复杂事件处理

**任务**：使用处理器API实现复杂事件处理系统。

**要求**：
1. 检测事件序列模式
2. 维护事件状态机
3. 实现超时处理
4. 生成复合事件

### 练习3：性能优化实战

**任务**：优化现有的流处理拓扑性能。

**要求**：
1. 分析性能瓶颈
2. 实施优化策略
3. 监控优化效果
4. 编写性能测试报告

## 课后作业

### 作业1：构建实时推荐系统

**要求**：
1. 使用自定义序列化器处理用户行为数据
2. 实现基于处理器API的推荐算法
3. 优化拓扑性能
4. 实现完整的错误处理和恢复机制

### 作业2：金融风控系统扩展

**要求**：
1. 扩展风险评估规则
2. 实现机器学习模型集成
3. 添加实时监控和告警
4. 实现A/B测试框架

### 作业3：性能基准测试

**要求**：
1. 设计性能测试方案
2. 对比不同序列化方式的性能
3. 测试不同拓扑结构的吞吐量
4. 分析内存和CPU使用情况

## 课程总结

### 关键知识点回顾

1. **自定义序列化器**
   - JSON序列化器实现
   - Avro集成和Schema Registry
   - 二进制序列化优化
   - 版本兼容性处理

2. **处理器API**
   - 底层流处理控制
   - 状态存储直接访问
   - 自定义时间语义
   - 复杂业务逻辑实现

3. **拓扑优化**
   - 操作合并和重排
   - 分区策略优化
   - 缓存和批处理
   - 并行处理设计

4. **错误处理**
   - 全局异常处理器
   - 重试和死信队列
   - 状态恢复机制
   - 容错设计模式

5. **性能监控**
   - JMX指标收集
   - 自定义监控指标
   - 性能阈值告警
   - 资源使用优化

### 最佳实践

1. **序列化选择**
   - 根据数据特点选择合适的序列化方式
   - 考虑性能、兼容性和可读性
   - 实现版本演进策略

2. **拓扑设计**
   - 合理规划数据流向
   - 避免不必要的重分区
   - 优化状态存储使用

3. **错误处理**
   - 实现分层错误处理策略
   - 设计优雅降级机制
   - 建立完整的监控体系

4. **性能优化**
   - 持续监控关键指标
   - 定期进行性能测试
   - 根据业务需求调整配置

### 下节预告

下一节课我们将学习**Kafka Connect深入应用**，包括：
- Connect架构和原理
- 自定义Connector开发
- 数据管道构建
- 监控和运维
- 与各种数据源的集成

请提前准备：
1. 安装Kafka Connect
2. 了解常用的Connector插件
3. 准备数据源（数据库、文件系统等）
4. 复习Java开发基础