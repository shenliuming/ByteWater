# 第15天：Kafka Stream流处理基础

## 课程目标
- 理解Kafka Streams的核心概念和架构
- 掌握KStream和KTable的使用
- 学会构建流处理拓扑
- 了解窗口操作和时间语义
- 掌握状态存储的使用

## 1. Kafka Streams概述

### 1.1 什么是Kafka Streams

Kafka Streams是Apache Kafka提供的流处理库：
- **轻量级**：无需单独的集群，作为应用程序的一部分运行
- **容错性**：自动处理故障和重平衡
- **可扩展**：支持水平扩展
- **精确一次**：支持exactly-once语义
- **实时处理**：低延迟流处理

### 1.2 核心概念

#### 流(Stream)
- 无界的、持续更新的数据集
- 由键值对组成的记录序列
- 按时间顺序排列

#### 流处理拓扑(Topology)
- 流处理逻辑的图形表示
- 由处理器节点和连接边组成
- 定义数据流转换的步骤

#### 处理器(Processor)
- 拓扑中的节点
- 接收输入记录，进行处理，产生输出记录

### 1.3 架构特点

```
输入Topic -> Stream处理应用 -> 输出Topic
     ↓           ↓              ↓
  分区数据    并行处理        结果数据
     ↓           ↓              ↓
  自动重平衡   状态存储      容错恢复
```

## 2. 环境搭建和配置

### 2.1 Maven依赖

```xml
<dependencies>
    <!-- Kafka Streams -->
    <dependency>
        <groupId>org.apache.kafka</groupId>
        <artifactId>kafka-streams</artifactId>
        <version>3.5.0</version>
    </dependency>
    
    <!-- Spring Boot Kafka Streams -->
    <dependency>
        <groupId>org.springframework.kafka</groupId>
        <artifactId>spring-kafka</artifactId>
    </dependency>
    
    <!-- JSON处理 -->
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>
    
    <!-- 测试依赖 -->
    <dependency>
        <groupId>org.apache.kafka</groupId>
        <artifactId>kafka-streams-test-utils</artifactId>
        <version>3.5.0</version>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### 2.2 基础配置

```yaml
# application.yml
spring:
  application:
    name: kafka-streams-demo
  kafka:
    bootstrap-servers: localhost:9092
    streams:
      application-id: ${spring.application.name}
      bootstrap-servers: ${spring.kafka.bootstrap-servers}
      default-key-serde: org.apache.kafka.common.serialization.Serdes$StringSerde
      default-value-serde: org.apache.kafka.common.serialization.Serdes$StringSerde
      properties:
        # 状态存储目录
        state.dir: /tmp/kafka-streams
        # 提交间隔
        commit.interval.ms: 1000
        # 缓存大小
        cache.max.bytes.buffering: 10240
        # 重试配置
        retries: 3
        # 处理保证
        processing.guarantee: exactly_once_v2
```

### 2.3 Streams配置类

```java
@Configuration
@EnableKafka
@EnableKafkaStreams
public class KafkaStreamsConfig {
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    @Value("${spring.kafka.streams.application-id}")
    private String applicationId;
    
    @Bean(name = KafkaStreamsDefaultConfiguration.DEFAULT_STREAMS_CONFIG_BEAN_NAME)
    public KafkaStreamsConfiguration kStreamsConfig() {
        Map<String, Object> props = new HashMap<>();
        
        // 基础配置
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, applicationId);
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        
        // 序列化配置
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        
        // 状态存储配置
        props.put(StreamsConfig.STATE_DIR_CONFIG, "/tmp/kafka-streams");
        
        // 处理保证
        props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, 
            StreamsConfig.EXACTLY_ONCE_V2);
        
        // 性能配置
        props.put(StreamsConfig.COMMIT_INTERVAL_MS_CONFIG, 1000);
        props.put(StreamsConfig.CACHE_MAX_BYTES_BUFFERING_CONFIG, 10 * 1024 * 1024L);
        
        // 重试配置
        props.put(StreamsConfig.RETRIES_CONFIG, 3);
        props.put(StreamsConfig.RETRY_BACKOFF_MS_CONFIG, 1000);
        
        return new KafkaStreamsConfiguration(props);
    }
    
    @Bean
    public Serde<JsonNode> jsonSerde() {
        return Serdes.serdeFrom(new JsonSerializer(), new JsonDeserializer());
    }
}
```

## 3. KStream基础操作

### 3.1 KStream创建和基本转换

```java
@Component
public class BasicStreamProcessor {
    
    private static final Logger logger = LoggerFactory.getLogger(BasicStreamProcessor.class);
    
    @Autowired
    public void buildPipeline(StreamsBuilder streamsBuilder) {
        
        // 1. 创建KStream
        KStream<String, String> sourceStream = streamsBuilder
            .stream("input-topic", Consumed.with(Serdes.String(), Serdes.String()));
        
        // 2. 过滤操作
        KStream<String, String> filteredStream = sourceStream
            .filter((key, value) -> {
                // 过滤掉空值和测试数据
                return value != null && !value.contains("test");
            });
        
        // 3. 映射操作
        KStream<String, String> mappedStream = filteredStream
            .map((key, value) -> {
                // 转换为大写
                return KeyValue.pair(key, value.toUpperCase());
            });
        
        // 4. 平面映射
        KStream<String, String> flatMappedStream = mappedStream
            .flatMap((key, value) -> {
                // 将句子分割为单词
                String[] words = value.split("\\s+");
                List<KeyValue<String, String>> result = new ArrayList<>();
                for (String word : words) {
                    result.add(KeyValue.pair(key, word));
                }
                return result;
            });
        
        // 5. 输出到目标Topic
        flatMappedStream.to("output-topic", Produced.with(Serdes.String(), Serdes.String()));
        
        // 6. 打印到控制台（调试用）
        flatMappedStream.print(Printed.<String, String>toSysOut().withLabel("processed"));
    }
}
```

### 3.2 分支和合并操作

```java
@Component
public class BranchMergeProcessor {
    
    @Autowired
    public void buildBranchMergePipeline(StreamsBuilder streamsBuilder) {
        
        KStream<String, String> sourceStream = streamsBuilder
            .stream("user-events");
        
        // 分支操作
        Map<String, KStream<String, String>> branches = sourceStream
            .split(Named.as("user-type-"))
            .branch((key, value) -> value.contains("VIP"), Branched.as("vip"))
            .branch((key, value) -> value.contains("PREMIUM"), Branched.as("premium"))
            .defaultBranch(Branched.as("regular"));
        
        // 处理VIP用户事件
        KStream<String, String> vipStream = branches.get("user-type-vip")
            .map((key, value) -> KeyValue.pair(key, "[VIP] " + value));
        
        // 处理高级用户事件
        KStream<String, String> premiumStream = branches.get("user-type-premium")
            .map((key, value) -> KeyValue.pair(key, "[PREMIUM] " + value));
        
        // 处理普通用户事件
        KStream<String, String> regularStream = branches.get("user-type-regular")
            .map((key, value) -> KeyValue.pair(key, "[REGULAR] " + value));
        
        // 合并流
        KStream<String, String> mergedStream = vipStream
            .merge(premiumStream)
            .merge(regularStream);
        
        // 输出合并结果
        mergedStream.to("processed-user-events");
    }
}
```

### 3.3 连接操作

```java
@Component
public class JoinProcessor {
    
    @Autowired
    public void buildJoinPipeline(StreamsBuilder streamsBuilder) {
        
        // 用户流
        KStream<String, String> userStream = streamsBuilder
            .stream("user-stream", Consumed.with(Serdes.String(), Serdes.String()));
        
        // 订单流
        KStream<String, String> orderStream = streamsBuilder
            .stream("order-stream", Consumed.with(Serdes.String(), Serdes.String()));
        
        // Stream-Stream Join
        KStream<String, String> joinedStream = userStream
            .join(
                orderStream,
                (userValue, orderValue) -> {
                    // 连接逻辑
                    return String.format("User: %s, Order: %s", userValue, orderValue);
                },
                JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)),
                StreamJoined.with(Serdes.String(), Serdes.String(), Serdes.String())
            );
        
        // 左连接
        KStream<String, String> leftJoinedStream = userStream
            .leftJoin(
                orderStream,
                (userValue, orderValue) -> {
                    if (orderValue != null) {
                        return String.format("User: %s, Order: %s", userValue, orderValue);
                    } else {
                        return String.format("User: %s, No Order", userValue);
                    }
                },
                JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)),
                StreamJoined.with(Serdes.String(), Serdes.String(), Serdes.String())
            );
        
        // 外连接
        KStream<String, String> outerJoinedStream = userStream
            .outerJoin(
                orderStream,
                (userValue, orderValue) -> {
                    String user = userValue != null ? userValue : "Unknown User";
                    String order = orderValue != null ? orderValue : "No Order";
                    return String.format("User: %s, Order: %s", user, order);
                },
                JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)),
                StreamJoined.with(Serdes.String(), Serdes.String(), Serdes.String())
            );
        
        // 输出结果
        joinedStream.to("joined-results");
        leftJoinedStream.to("left-joined-results");
        outerJoinedStream.to("outer-joined-results");
    }
}
```

## 4. KTable操作

### 4.1 KTable创建和基本操作

```java
@Component
public class TableProcessor {
    
    @Autowired
    public void buildTablePipeline(StreamsBuilder streamsBuilder) {
        
        // 1. 创建KTable
        KTable<String, String> userTable = streamsBuilder
            .table("user-table", Consumed.with(Serdes.String(), Serdes.String()));
        
        // 2. 过滤KTable
        KTable<String, String> activeUserTable = userTable
            .filter((key, value) -> {
                // 只保留活跃用户
                return value != null && value.contains("active");
            });
        
        // 3. 映射KTable
        KTable<String, String> transformedUserTable = activeUserTable
            .mapValues(value -> {
                // 转换用户信息
                return "ACTIVE_" + value.toUpperCase();
            });
        
        // 4. 转换为KStream
        KStream<String, String> userStream = transformedUserTable.toStream();
        
        // 5. 输出到Topic
        userStream.to("active-users");
        
        // 6. 物化视图
        Materialized<String, String, KeyValueStore<Bytes, byte[]>> materialized = 
            Materialized.<String, String, KeyValueStore<Bytes, byte[]>>as("user-store")
                .withKeySerde(Serdes.String())
                .withValueSerde(Serdes.String());
        
        KTable<String, String> materializedTable = userTable
            .filter((key, value) -> value != null)
            .toTable(Named.as("filtered-users"), materialized);
    }
}
```

### 4.2 KTable聚合操作

```java
@Component
public class TableAggregationProcessor {
    
    @Autowired
    public void buildAggregationPipeline(StreamsBuilder streamsBuilder) {
        
        // 订单流
        KStream<String, String> orderStream = streamsBuilder
            .stream("orders");
        
        // 按用户ID分组并聚合
        KTable<String, Long> orderCountTable = orderStream
            .groupByKey()
            .count(Materialized.as("order-count-store"));
        
        // 按用户ID分组并计算总金额
        KTable<String, Double> orderAmountTable = orderStream
            .mapValues(value -> {
                // 假设value是JSON格式的订单信息
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    JsonNode orderNode = mapper.readTree(value);
                    return orderNode.get("amount").asDouble();
                } catch (Exception e) {
                    return 0.0;
                }
            })
            .groupByKey()
            .aggregate(
                () -> 0.0, // 初始值
                (key, value, aggregate) -> aggregate + value, // 聚合函数
                Materialized.<String, Double, KeyValueStore<Bytes, byte[]>>as("order-amount-store")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(Serdes.Double())
            );
        
        // 自定义聚合
        KTable<String, OrderSummary> orderSummaryTable = orderStream
            .mapValues(value -> {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    return mapper.readValue(value, Order.class);
                } catch (Exception e) {
                    return null;
                }
            })
            .filter((key, value) -> value != null)
            .groupByKey()
            .aggregate(
                OrderSummary::new, // 初始化器
                (key, order, summary) -> {
                    // 聚合逻辑
                    summary.setTotalOrders(summary.getTotalOrders() + 1);
                    summary.setTotalAmount(summary.getTotalAmount() + order.getAmount());
                    summary.setLastOrderTime(order.getOrderTime());
                    return summary;
                },
                Materialized.<String, OrderSummary, KeyValueStore<Bytes, byte[]>>as("order-summary-store")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getOrderSummarySerde())
            );
        
        // 输出聚合结果
        orderCountTable.toStream().to("order-counts");
        orderAmountTable.toStream().to("order-amounts");
        orderSummaryTable.toStream().to("order-summaries");
    }
    
    private Serde<OrderSummary> getOrderSummarySerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(OrderSummary.class)
        );
    }
}
```

### 4.3 KTable连接操作

```java
@Component
public class TableJoinProcessor {
    
    @Autowired
    public void buildTableJoinPipeline(StreamsBuilder streamsBuilder) {
        
        // 用户表
        KTable<String, String> userTable = streamsBuilder
            .table("users", Consumed.with(Serdes.String(), Serdes.String()));
        
        // 用户配置表
        KTable<String, String> userConfigTable = streamsBuilder
            .table("user-configs", Consumed.with(Serdes.String(), Serdes.String()));
        
        // Table-Table Join
        KTable<String, String> joinedTable = userTable
            .join(
                userConfigTable,
                (userValue, configValue) -> {
                    return String.format("User: %s, Config: %s", userValue, configValue);
                }
            );
        
        // 左连接
        KTable<String, String> leftJoinedTable = userTable
            .leftJoin(
                userConfigTable,
                (userValue, configValue) -> {
                    if (configValue != null) {
                        return String.format("User: %s, Config: %s", userValue, configValue);
                    } else {
                        return String.format("User: %s, No Config", userValue);
                    }
                }
            );
        
        // 外连接
        KTable<String, String> outerJoinedTable = userTable
            .outerJoin(
                userConfigTable,
                (userValue, configValue) -> {
                    String user = userValue != null ? userValue : "Unknown User";
                    String config = configValue != null ? configValue : "No Config";
                    return String.format("User: %s, Config: %s", user, config);
                }
            );
        
        // Stream-Table Join
        KStream<String, String> orderStream = streamsBuilder
            .stream("orders");
        
        KStream<String, String> enrichedOrderStream = orderStream
            .join(
                userTable,
                (orderValue, userValue) -> {
                    return String.format("Order: %s, User: %s", orderValue, userValue);
                }
            );
        
        // 输出结果
        joinedTable.toStream().to("joined-user-configs");
        leftJoinedTable.toStream().to("left-joined-user-configs");
        outerJoinedTable.toStream().to("outer-joined-user-configs");
        enrichedOrderStream.to("enriched-orders");
    }
}
```

## 5. 窗口操作

### 5.1 时间窗口

```java
@Component
public class WindowProcessor {
    
    @Autowired
    public void buildWindowPipeline(StreamsBuilder streamsBuilder) {
        
        KStream<String, String> clickStream = streamsBuilder
            .stream("user-clicks");
        
        // 1. 滚动窗口 (Tumbling Window)
        KTable<Windowed<String>, Long> tumblingWindowCounts = clickStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
            .count(Materialized.as("tumbling-window-counts"));
        
        // 2. 滑动窗口 (Hopping Window)
        KTable<Windowed<String>, Long> hoppingWindowCounts = clickStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeAndGrace(
                Duration.ofMinutes(10), // 窗口大小
                Duration.ofMinutes(1)   // 滑动间隔
            ).advanceBy(Duration.ofMinutes(2)))
            .count(Materialized.as("hopping-window-counts"));
        
        // 3. 会话窗口 (Session Window)
        KTable<Windowed<String>, Long> sessionWindowCounts = clickStream
            .groupByKey()
            .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
            .count(Materialized.as("session-window-counts"));
        
        // 输出窗口结果
        tumblingWindowCounts
            .toStream()
            .map((windowedKey, count) -> {
                String key = String.format("%s@%d-%d", 
                    windowedKey.key(),
                    windowedKey.window().start(),
                    windowedKey.window().end());
                return KeyValue.pair(key, count.toString());
            })
            .to("tumbling-window-results");
        
        hoppingWindowCounts
            .toStream()
            .map((windowedKey, count) -> {
                String key = String.format("%s@%d-%d", 
                    windowedKey.key(),
                    windowedKey.window().start(),
                    windowedKey.window().end());
                return KeyValue.pair(key, count.toString());
            })
            .to("hopping-window-results");
        
        sessionWindowCounts
            .toStream()
            .map((windowedKey, count) -> {
                String key = String.format("%s@%d-%d", 
                    windowedKey.key(),
                    windowedKey.window().start(),
                    windowedKey.window().end());
                return KeyValue.pair(key, count.toString());
            })
            .to("session-window-results");
    }
}
```

### 5.2 窗口聚合操作

```java
@Component
public class WindowAggregationProcessor {
    
    @Autowired
    public void buildWindowAggregationPipeline(StreamsBuilder streamsBuilder) {
        
        KStream<String, String> salesStream = streamsBuilder
            .stream("sales-events");
        
        // 解析销售数据
        KStream<String, SalesEvent> parsedSalesStream = salesStream
            .mapValues(value -> {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    return mapper.readValue(value, SalesEvent.class);
                } catch (Exception e) {
                    return null;
                }
            })
            .filter((key, value) -> value != null);
        
        // 按产品分组的5分钟滚动窗口销售统计
        KTable<Windowed<String>, SalesSummary> salesSummaryTable = parsedSalesStream
            .groupBy((key, value) -> value.getProductId())
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
            .aggregate(
                SalesSummary::new, // 初始化器
                (key, salesEvent, summary) -> {
                    // 聚合逻辑
                    summary.setProductId(salesEvent.getProductId());
                    summary.setTotalSales(summary.getTotalSales() + 1);
                    summary.setTotalRevenue(summary.getTotalRevenue() + salesEvent.getAmount());
                    summary.setAverageAmount(
                        summary.getTotalRevenue() / summary.getTotalSales()
                    );
                    return summary;
                },
                Materialized.<String, SalesSummary, WindowStore<Bytes, byte[]>>as("sales-summary-store")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getSalesSummarySerde())
            );
        
        // 实时销售排行榜（每分钟更新）
        KTable<Windowed<String>, Long> productRankingTable = parsedSalesStream
            .groupBy((key, value) -> value.getProductId())
            .windowedBy(TimeWindows.ofSizeAndGrace(
                Duration.ofHours(1), // 1小时窗口
                Duration.ofMinutes(1) // 1分钟宽限期
            ).advanceBy(Duration.ofMinutes(1))) // 每分钟滑动
            .count(Materialized.as("product-ranking-store"));
        
        // 用户会话分析
        KTable<Windowed<String>, UserSession> userSessionTable = parsedSalesStream
            .groupBy((key, value) -> value.getUserId())
            .windowedBy(SessionWindows.ofInactivityGapAndGrace(
                Duration.ofMinutes(30), // 30分钟不活跃间隔
                Duration.ofMinutes(5)   // 5分钟宽限期
            ))
            .aggregate(
                UserSession::new,
                (key, salesEvent, session) -> {
                    session.setUserId(salesEvent.getUserId());
                    session.setEventCount(session.getEventCount() + 1);
                    session.setTotalSpent(session.getTotalSpent() + salesEvent.getAmount());
                    session.setLastEventTime(salesEvent.getTimestamp());
                    if (session.getFirstEventTime() == null) {
                        session.setFirstEventTime(salesEvent.getTimestamp());
                    }
                    return session;
                },
                Materialized.<String, UserSession, SessionStore<Bytes, byte[]>>as("user-session-store")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getUserSessionSerde())
            );
        
        // 输出聚合结果
        salesSummaryTable
            .toStream()
            .map((windowedKey, summary) -> {
                summary.setWindowStart(windowedKey.window().start());
                summary.setWindowEnd(windowedKey.window().end());
                return KeyValue.pair(windowedKey.key(), summary);
            })
            .to("sales-summary-results", Produced.with(Serdes.String(), getSalesSummarySerde()));
        
        productRankingTable
            .toStream()
            .map((windowedKey, count) -> {
                ProductRanking ranking = new ProductRanking(
                    windowedKey.key(),
                    count,
                    windowedKey.window().start(),
                    windowedKey.window().end()
                );
                return KeyValue.pair(windowedKey.key(), ranking);
            })
            .to("product-ranking-results", Produced.with(Serdes.String(), getProductRankingSerde()));
        
        userSessionTable
            .toStream()
            .map((windowedKey, session) -> {
                session.setSessionStart(windowedKey.window().start());
                session.setSessionEnd(windowedKey.window().end());
                return KeyValue.pair(windowedKey.key(), session);
            })
            .to("user-session-results", Produced.with(Serdes.String(), getUserSessionSerde()));
    }
    
    private Serde<SalesSummary> getSalesSummarySerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(SalesSummary.class)
        );
    }
    
    private Serde<ProductRanking> getProductRankingSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(ProductRanking.class)
        );
    }
    
    private Serde<UserSession> getUserSessionSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserSession.class)
        );
    }
}
```

## 6. 状态存储

### 6.1 状态存储类型

```java
@Component
public class StateStoreProcessor {
    
    @Autowired
    public void buildStateStorePipeline(StreamsBuilder streamsBuilder) {
        
        // 1. 键值存储
        StoreBuilder<KeyValueStore<String, String>> keyValueStoreBuilder = 
            Stores.keyValueStoreBuilder(
                Stores.persistentKeyValueStore("user-preferences"),
                Serdes.String(),
                Serdes.String()
            );
        
        streamsBuilder.addStateStore(keyValueStoreBuilder);
        
        // 2. 窗口存储
        StoreBuilder<WindowStore<String, String>> windowStoreBuilder = 
            Stores.windowStoreBuilder(
                Stores.persistentWindowStore(
                    "user-activity-windows",
                    Duration.ofDays(7), // 保留期
                    Duration.ofMinutes(5), // 窗口大小
                    false // 不保留重复
                ),
                Serdes.String(),
                Serdes.String()
            );
        
        streamsBuilder.addStateStore(windowStoreBuilder);
        
        // 3. 会话存储
        StoreBuilder<SessionStore<String, String>> sessionStoreBuilder = 
            Stores.sessionStoreBuilder(
                Stores.persistentSessionStore(
                    "user-sessions",
                    Duration.ofHours(24) // 保留期
                ),
                Serdes.String(),
                Serdes.String()
            );
        
        streamsBuilder.addStateStore(sessionStoreBuilder);
        
        // 使用状态存储的处理器
        KStream<String, String> userEventStream = streamsBuilder
            .stream("user-events");
        
        userEventStream
            .process(
                () -> new UserPreferenceProcessor(),
                "user-preferences"
            );
    }
}
```

### 6.2 自定义处理器使用状态存储

```java
public class UserPreferenceProcessor implements Processor<String, String, String, String> {
    
    private ProcessorContext<String, String> context;
    private KeyValueStore<String, String> stateStore;
    
    @Override
    public void init(ProcessorContext<String, String> context) {
        this.context = context;
        this.stateStore = context.getStateStore("user-preferences");
        
        // 定期提交
        context.schedule(
            Duration.ofSeconds(30),
            PunctuationType.WALL_CLOCK_TIME,
            this::punctuate
        );
    }
    
    @Override
    public void process(Record<String, String> record) {
        String userId = record.key();
        String eventData = record.value();
        
        try {
            // 解析事件数据
            ObjectMapper mapper = new ObjectMapper();
            JsonNode eventNode = mapper.readTree(eventData);
            String eventType = eventNode.get("type").asText();
            String preference = eventNode.get("preference").asText();
            
            // 从状态存储获取用户偏好
            String currentPreferences = stateStore.get(userId);
            
            // 更新用户偏好
            UserPreferences userPrefs;
            if (currentPreferences != null) {
                userPrefs = mapper.readValue(currentPreferences, UserPreferences.class);
            } else {
                userPrefs = new UserPreferences(userId);
            }
            
            // 根据事件类型更新偏好
            switch (eventType) {
                case "click":
                    userPrefs.addClickPreference(preference);
                    break;
                case "purchase":
                    userPrefs.addPurchasePreference(preference);
                    break;
                case "view":
                    userPrefs.addViewPreference(preference);
                    break;
            }
            
            // 保存更新后的偏好
            String updatedPreferences = mapper.writeValueAsString(userPrefs);
            stateStore.put(userId, updatedPreferences);
            
            // 转发处理结果
            context.forward(record.withValue(updatedPreferences));
            
        } catch (Exception e) {
            // 错误处理
            context.forward(record.withValue("Error processing: " + e.getMessage()));
        }
    }
    
    private void punctuate(long timestamp) {
        // 定期清理过期数据
        try (KeyValueIterator<String, String> iterator = stateStore.all()) {
            while (iterator.hasNext()) {
                KeyValue<String, String> entry = iterator.next();
                
                // 检查数据是否过期（这里简化处理）
                if (isExpired(entry.value, timestamp)) {
                    stateStore.delete(entry.key);
                }
            }
        }
    }
    
    private boolean isExpired(String preferencesJson, long currentTimestamp) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            UserPreferences prefs = mapper.readValue(preferencesJson, UserPreferences.class);
            
            // 如果超过7天没有更新，则认为过期
            return (currentTimestamp - prefs.getLastUpdated()) > Duration.ofDays(7).toMillis();
        } catch (Exception e) {
            return true; // 解析失败的数据也认为过期
        }
    }
    
    @Override
    public void close() {
        // 清理资源
    }
}
```

### 6.3 状态存储查询

```java
@RestController
@RequestMapping("/api/streams")
public class StreamsQueryController {
    
    @Autowired
    private KafkaStreams kafkaStreams;
    
    /**
     * 查询用户偏好
     */
    @GetMapping("/user-preferences/{userId}")
    public ResponseEntity<String> getUserPreferences(@PathVariable String userId) {
        try {
            ReadOnlyKeyValueStore<String, String> store = kafkaStreams
                .store(StoreQueryParameters.fromNameAndType(
                    "user-preferences",
                    QueryableStoreTypes.keyValueStore()
                ));
            
            String preferences = store.get(userId);
            
            if (preferences != null) {
                return ResponseEntity.ok(preferences);
            } else {
                return ResponseEntity.notFound().build();
            }
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Error querying store: " + e.getMessage());
        }
    }
    
    /**
     * 查询所有用户偏好
     */
    @GetMapping("/user-preferences")
    public ResponseEntity<Map<String, String>> getAllUserPreferences() {
        try {
            ReadOnlyKeyValueStore<String, String> store = kafkaStreams
                .store(StoreQueryParameters.fromNameAndType(
                    "user-preferences",
                    QueryableStoreTypes.keyValueStore()
                ));
            
            Map<String, String> allPreferences = new HashMap<>();
            
            try (KeyValueIterator<String, String> iterator = store.all()) {
                while (iterator.hasNext()) {
                    KeyValue<String, String> entry = iterator.next();
                    allPreferences.put(entry.key, entry.value);
                }
            }
            
            return ResponseEntity.ok(allPreferences);
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Error querying store: " + e.getMessage()));
        }
    }
    
    /**
     * 查询窗口数据
     */
    @GetMapping("/user-activity/{userId}")
    public ResponseEntity<List<Map<String, Object>>> getUserActivity(
            @PathVariable String userId,
            @RequestParam(required = false) Long fromTime,
            @RequestParam(required = false) Long toTime) {
        
        try {
            ReadOnlyWindowStore<String, String> windowStore = kafkaStreams
                .store(StoreQueryParameters.fromNameAndType(
                    "user-activity-windows",
                    QueryableStoreTypes.windowStore()
                ));
            
            List<Map<String, Object>> activities = new ArrayList<>();
            
            Instant from = fromTime != null ? Instant.ofEpochMilli(fromTime) : 
                Instant.now().minus(Duration.ofHours(24));
            Instant to = toTime != null ? Instant.ofEpochMilli(toTime) : Instant.now();
            
            try (WindowStoreIterator<String> iterator = 
                    windowStore.fetch(userId, from, to)) {
                
                while (iterator.hasNext()) {
                    KeyValue<Long, String> entry = iterator.next();
                    
                    Map<String, Object> activity = new HashMap<>();
                    activity.put("timestamp", entry.key);
                    activity.put("data", entry.value);
                    
                    activities.add(activity);
                }
            }
            
            return ResponseEntity.ok(activities);
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(List.of(Map.of("error", "Error querying window store: " + e.getMessage())));
        }
    }
}
```

## 实战案例：实时用户行为分析系统

### 案例背景
构建一个实时用户行为分析系统，分析用户的点击、浏览、购买行为，生成用户画像和实时推荐。

### 系统架构
```
用户行为事件 -> Kafka -> Stream处理 -> [用户画像, 实时推荐, 行为统计]
     ↓              ↓         ↓              ↓
  点击/浏览/购买   分区处理   窗口聚合      状态存储
```

### 核心实现

```java
@Component
public class UserBehaviorAnalysisProcessor {
    
    @Autowired
    public void buildUserBehaviorPipeline(StreamsBuilder streamsBuilder) {
        
        // 用户行为事件流
        KStream<String, String> behaviorStream = streamsBuilder
            .stream("user-behavior-events");
        
        // 解析和过滤事件
        KStream<String, UserBehaviorEvent> parsedBehaviorStream = behaviorStream
            .mapValues(value -> {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    return mapper.readValue(value, UserBehaviorEvent.class);
                } catch (Exception e) {
                    return null;
                }
            })
            .filter((key, value) -> value != null && value.getUserId() != null);
        
        // 按用户ID重新分区
        KStream<String, UserBehaviorEvent> repartitionedStream = parsedBehaviorStream
            .selectKey((key, value) -> value.getUserId());
        
        // 实时用户活跃度统计（5分钟滚动窗口）
        KTable<Windowed<String>, Long> userActivityTable = repartitionedStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
            .count(Materialized.as("user-activity-count"));
        
        // 用户行为类型统计
        KTable<Windowed<String>, Map<String, Long>> behaviorTypeTable = repartitionedStream
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(15)))
            .aggregate(
                HashMap::new,
                (key, event, aggregate) -> {
                    String behaviorType = event.getBehaviorType();
                    aggregate.put(behaviorType, aggregate.getOrDefault(behaviorType, 0L) + 1);
                    return aggregate;
                },
                Materialized.<String, Map<String, Long>, WindowStore<Bytes, byte[]>>as("behavior-type-count")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getMapSerde())
            );
        
        // 用户购买力分析（1小时滑动窗口）
        KTable<Windowed<String>, Double> purchasePowerTable = repartitionedStream
            .filter((key, event) -> "purchase".equals(event.getBehaviorType()))
            .groupByKey()
            .windowedBy(TimeWindows.ofSizeAndGrace(
                Duration.ofHours(1),
                Duration.ofMinutes(5)
            ).advanceBy(Duration.ofMinutes(15)))
            .aggregate(
                () -> 0.0,
                (key, event, aggregate) -> aggregate + event.getAmount(),
                Materialized.<String, Double, WindowStore<Bytes, byte[]>>as("purchase-power")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(Serdes.Double())
            );
        
        // 用户会话分析
        KTable<Windowed<String>, UserSession> userSessionTable = repartitionedStream
            .groupByKey()
            .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
            .aggregate(
                UserSession::new,
                (key, event, session) -> {
                    session.setUserId(event.getUserId());
                    session.addEvent(event);
                    return session;
                },
                Materialized.<String, UserSession, SessionStore<Bytes, byte[]>>as("user-sessions")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(getUserSessionSerde())
            );
        
        // 输出分析结果
        userActivityTable
            .toStream()
            .map((windowedKey, count) -> {
                UserActivitySummary summary = new UserActivitySummary(
                    windowedKey.key(),
                    count,
                    windowedKey.window().start(),
                    windowedKey.window().end()
                );
                return KeyValue.pair(windowedKey.key(), summary);
            })
            .to("user-activity-summary", Produced.with(Serdes.String(), getUserActivitySummarySerde()));
        
        behaviorTypeTable
            .toStream()
            .map((windowedKey, behaviorMap) -> {
                BehaviorTypeSummary summary = new BehaviorTypeSummary(
                    windowedKey.key(),
                    behaviorMap,
                    windowedKey.window().start(),
                    windowedKey.window().end()
                );
                return KeyValue.pair(windowedKey.key(), summary);
            })
            .to("behavior-type-summary", Produced.with(Serdes.String(), getBehaviorTypeSummarySerde()));
        
        purchasePowerTable
            .toStream()
            .map((windowedKey, amount) -> {
                PurchasePowerSummary summary = new PurchasePowerSummary(
                    windowedKey.key(),
                    amount,
                    windowedKey.window().start(),
                    windowedKey.window().end()
                );
                return KeyValue.pair(windowedKey.key(), summary);
            })
            .to("purchase-power-summary", Produced.with(Serdes.String(), getPurchasePowerSummarySerde()));
        
        userSessionTable
            .toStream()
            .to("user-session-analysis", Produced.with(Serdes.String(), getUserSessionSerde()));
    }
    
    // Serde方法实现...
    private Serde<Map<String, Long>> getMapSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(Map.class)
        );
    }
    
    private Serde<UserSession> getUserSessionSerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserSession.class)
        );
    }
    
    private Serde<UserActivitySummary> getUserActivitySummarySerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(UserActivitySummary.class)
        );
    }
    
    private Serde<BehaviorTypeSummary> getBehaviorTypeSummarySerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(BehaviorTypeSummary.class)
        );
    }
    
    private Serde<PurchasePowerSummary> getPurchasePowerSummarySerde() {
        return Serdes.serdeFrom(
            new JsonSerializer<>(),
            new JsonDeserializer<>(PurchasePowerSummary.class)
        );
    }
}
```

## 实战练习

### 练习1：基础流处理
1. 创建一个简单的KStream处理管道
2. 实现消息过滤、转换和路由
3. 测试不同的操作组合

### 练习2：窗口聚合
1. 实现滚动窗口统计
2. 实现滑动窗口分析
3. 实现会话窗口处理

### 练习3：状态存储应用
1. 创建自定义处理器
2. 使用状态存储保存中间结果
3. 实现状态查询API

### 练习4：流表连接
1. 实现Stream-Stream连接
2. 实现Stream-Table连接
3. 实现Table-Table连接

## 课后作业

### 作业1：电商实时分析系统
设计并实现一个电商实时分析系统：
- 商品浏览统计
- 用户购买行为分析
- 实时销售排行榜
- 异常行为检测

### 作业2：社交媒体情感分析
实现社交媒体实时情感分析：
- 消息情感分类
- 热门话题统计
- 用户情感趋势分析
- 实时情感仪表板

### 作业3：IoT设备监控系统
开发IoT设备实时监控系统：
- 设备状态监控
- 异常检测和告警
- 设备性能统计
- 预测性维护

## 课程总结

### 关键知识点回顾
1. **Kafka Streams架构**：轻量级、容错、可扩展的流处理
2. **KStream操作**：过滤、映射、连接、分支等转换操作
3. **KTable操作**：表语义、聚合、连接操作
4. **窗口操作**：时间窗口、会话窗口、窗口聚合
5. **状态存储**：本地状态管理、查询接口

### 最佳实践
1. 合理选择KStream和KTable
2. 正确配置窗口大小和宽限期
3. 有效使用状态存储
4. 优化序列化性能
5. 监控流处理应用状态

### 下节预告
下一节课我们将学习**Kafka Stream高级特性**，包括：
- 自定义序列化器
- 处理器API
- 拓扑优化
- 错误处理策略
- 性能调优