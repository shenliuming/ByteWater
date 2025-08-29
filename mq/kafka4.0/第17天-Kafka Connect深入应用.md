# 第17天：Kafka Connect深入应用

## 课程目标
- 深入理解Kafka Connect架构和工作原理
- 掌握自定义Connector的开发方法
- 学会构建复杂的数据管道
- 了解Connect集群的监控和运维
- 实现与各种数据源的集成

## 1. Kafka Connect架构深入

### 1.1 Connect架构概述

Kafka Connect是一个用于在Kafka和其他数据系统之间可扩展且可靠地流式传输数据的工具。

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Source   │    │  Kafka Connect  │    │   Data Sink     │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │ Database  │  │◄──►│  │ Source    │  │◄──►│  │ Database  │  │
│  │           │  │    │  │ Connector │  │    │  │           │  │
│  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │   File    │  │◄──►│  │   Sink    │  │◄──►│  │   File    │  │
│  │  System   │  │    │  │ Connector │  │    │  │  System   │  │
│  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.2 核心组件

#### Worker进程
```java
// Connect Worker配置
public class ConnectWorkerConfig {
    
    // 基础配置
    public static final String BOOTSTRAP_SERVERS_CONFIG = "bootstrap.servers";
    public static final String KEY_CONVERTER_CLASS_CONFIG = "key.converter";
    public static final String VALUE_CONVERTER_CLASS_CONFIG = "value.converter";
    public static final String OFFSET_STORAGE_TOPIC_CONFIG = "offset.storage.topic";
    public static final String CONFIG_STORAGE_TOPIC_CONFIG = "config.storage.topic";
    public static final String STATUS_STORAGE_TOPIC_CONFIG = "status.storage.topic";
    
    // 集群配置
    public static final String GROUP_ID_CONFIG = "group.id";
    public static final String SESSION_TIMEOUT_MS_CONFIG = "session.timeout.ms";
    public static final String HEARTBEAT_INTERVAL_MS_CONFIG = "heartbeat.interval.ms";
    
    // 任务配置
    public static final String TASK_SHUTDOWN_GRACEFUL_TIMEOUT_MS_CONFIG = 
        "task.shutdown.graceful.timeout.ms";
    public static final String OFFSET_COMMIT_INTERVAL_MS_CONFIG = 
        "offset.commit.interval.ms";
    public static final String OFFSET_COMMIT_TIMEOUT_MS_CONFIG = 
        "offset.commit.timeout.ms";
    
    public static Properties getWorkerProperties() {
        Properties props = new Properties();
        
        // Kafka集群配置
        props.put(BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(GROUP_ID_CONFIG, "connect-cluster");
        
        // 转换器配置
        props.put(KEY_CONVERTER_CLASS_CONFIG, 
            "org.apache.kafka.connect.json.JsonConverter");
        props.put(VALUE_CONVERTER_CLASS_CONFIG, 
            "org.apache.kafka.connect.json.JsonConverter");
        props.put("key.converter.schemas.enable", "false");
        props.put("value.converter.schemas.enable", "false");
        
        // 内部Topic配置
        props.put(OFFSET_STORAGE_TOPIC_CONFIG, "connect-offsets");
        props.put(CONFIG_STORAGE_TOPIC_CONFIG, "connect-configs");
        props.put(STATUS_STORAGE_TOPIC_CONFIG, "connect-status");
        
        // 副本因子配置
        props.put("offset.storage.replication.factor", "3");
        props.put("config.storage.replication.factor", "3");
        props.put("status.storage.replication.factor", "3");
        
        // 性能调优
        props.put(OFFSET_COMMIT_INTERVAL_MS_CONFIG, "10000");
        props.put(TASK_SHUTDOWN_GRACEFUL_TIMEOUT_MS_CONFIG, "10000");
        
        return props;
    }
}
```

#### Connector和Task
```java
// Connector抽象基类
public abstract class BaseConnector extends Connector {
    
    protected Map<String, String> configProperties;
    protected ConnectorContext context;
    
    @Override
    public void start(Map<String, String> props) {
        this.configProperties = new HashMap<>(props);
        validateConfig(props);
        initializeConnector(props);
    }
    
    @Override
    public void stop() {
        cleanup();
    }
    
    @Override
    public ConfigDef config() {
        return getConfigDef();
    }
    
    // 抽象方法，子类实现
    protected abstract void validateConfig(Map<String, String> props);
    protected abstract void initializeConnector(Map<String, String> props);
    protected abstract void cleanup();
    protected abstract ConfigDef getConfigDef();
    
    // 通用配置验证
    protected void validateCommonConfig(Map<String, String> props) {
        if (!props.containsKey("name")) {
            throw new ConnectException("Connector name is required");
        }
        
        if (!props.containsKey("topics") && !props.containsKey("topics.regex")) {
            throw new ConnectException("Either 'topics' or 'topics.regex' must be specified");
        }
    }
    
    // 获取通用配置定义
    protected ConfigDef getCommonConfigDef() {
        return new ConfigDef()
            .define("name", ConfigDef.Type.STRING, ConfigDef.Importance.HIGH,
                "Connector name")
            .define("topics", ConfigDef.Type.LIST, null, ConfigDef.Importance.HIGH,
                "List of topics to process")
            .define("topics.regex", ConfigDef.Type.STRING, null, ConfigDef.Importance.HIGH,
                "Regular expression for topic selection")
            .define("tasks.max", ConfigDef.Type.INT, 1, ConfigDef.Importance.HIGH,
                "Maximum number of tasks")
            .define("key.converter", ConfigDef.Type.STRING, null, ConfigDef.Importance.MEDIUM,
                "Key converter class")
            .define("value.converter", ConfigDef.Type.STRING, null, ConfigDef.Importance.MEDIUM,
                "Value converter class");
    }
}

// Task抽象基类
public abstract class BaseTask extends Task {
    
    protected Map<String, String> config;
    protected TaskMetrics metrics;
    
    @Override
    public void start(Map<String, String> props) {
        this.config = new HashMap<>(props);
        this.metrics = new TaskMetrics();
        initializeTask(props);
    }
    
    @Override
    public void stop() {
        cleanup();
        if (metrics != null) {
            metrics.close();
        }
    }
    
    // 抽象方法，子类实现
    protected abstract void initializeTask(Map<String, String> props);
    protected abstract void cleanup();
    
    // 错误处理
    protected void handleError(String operation, Exception e) {
        metrics.recordError(operation);
        
        if (e instanceof RetriableException) {
            throw e; // 可重试异常，让框架处理
        } else {
            throw new ConnectException("Non-retriable error in " + operation, e);
        }
    }
    
    // 指标记录
    protected void recordProcessed(int count) {
        metrics.recordProcessed(count);
    }
}
```

### 1.3 数据转换和序列化

#### 自定义转换器
```java
// 自定义Avro转换器
public class CustomAvroConverter implements Converter {
    
    private SchemaRegistryClient schemaRegistry;
    private AvroSerializer serializer;
    private AvroDeserializer deserializer;
    private boolean isKey;
    
    @Override
    public void configure(Map<String, ?> configs, boolean isKey) {
        this.isKey = isKey;
        
        String schemaRegistryUrl = (String) configs.get("schema.registry.url");
        if (schemaRegistryUrl == null) {
            throw new ConfigException("schema.registry.url is required");
        }
        
        this.schemaRegistry = new CachedSchemaRegistryClient(schemaRegistryUrl, 100);
        this.serializer = new AvroSerializer(schemaRegistry);
        this.deserializer = new AvroDeserializer(schemaRegistry);
    }
    
    @Override
    public byte[] fromConnectData(String topic, Schema schema, Object value) {
        if (value == null) {
            return null;
        }
        
        try {
            // 将Connect数据转换为Avro格式
            GenericRecord avroRecord = convertToAvro(schema, value);
            
            // 序列化为字节数组
            return serializer.serialize(topic, avroRecord);
            
        } catch (Exception e) {
            throw new DataException("Failed to serialize Avro data", e);
        }
    }
    
    @Override
    public SchemaAndValue toConnectData(String topic, byte[] value) {
        if (value == null) {
            return SchemaAndValue.NULL;
        }
        
        try {
            // 反序列化Avro数据
            GenericRecord avroRecord = (GenericRecord) deserializer.deserialize(topic, value);
            
            // 转换为Connect格式
            Schema connectSchema = convertToConnectSchema(avroRecord.getSchema());
            Object connectValue = convertToConnectData(connectSchema, avroRecord);
            
            return new SchemaAndValue(connectSchema, connectValue);
            
        } catch (Exception e) {
            throw new DataException("Failed to deserialize Avro data", e);
        }
    }
    
    private GenericRecord convertToAvro(Schema connectSchema, Object connectValue) {
        // 实现Connect Schema到Avro Schema的转换
        org.apache.avro.Schema avroSchema = convertConnectSchemaToAvro(connectSchema);
        GenericRecord record = new GenericData.Record(avroSchema);
        
        if (connectSchema.type() == Schema.Type.STRUCT) {
            Struct struct = (Struct) connectValue;
            for (Field field : connectSchema.fields()) {
                Object fieldValue = struct.get(field);
                record.put(field.name(), convertFieldValue(field.schema(), fieldValue));
            }
        }
        
        return record;
    }
    
    private Object convertFieldValue(Schema fieldSchema, Object value) {
        if (value == null) {
            return null;
        }
        
        switch (fieldSchema.type()) {
            case STRING:
                return value.toString();
            case INT32:
                return ((Number) value).intValue();
            case INT64:
                return ((Number) value).longValue();
            case FLOAT64:
                return ((Number) value).doubleValue();
            case BOOLEAN:
                return (Boolean) value;
            case BYTES:
                return ByteBuffer.wrap((byte[]) value);
            default:
                return value;
        }
    }
    
    private org.apache.avro.Schema convertConnectSchemaToAvro(Schema connectSchema) {
        // 简化实现，实际需要完整的转换逻辑
        SchemaBuilder.RecordBuilder<org.apache.avro.Schema> builder = 
            SchemaBuilder.record("ConnectRecord");
        
        for (Field field : connectSchema.fields()) {
            builder = builder.name(field.name()).type().nullable().stringType().noDefault();
        }
        
        return builder.endRecord();
    }
    
    private Schema convertToConnectSchema(org.apache.avro.Schema avroSchema) {
        // 实现Avro Schema到Connect Schema的转换
        SchemaBuilder schemaBuilder = SchemaBuilder.struct();
        
        for (org.apache.avro.Schema.Field field : avroSchema.getFields()) {
            schemaBuilder.field(field.name(), Schema.OPTIONAL_STRING_SCHEMA);
        }
        
        return schemaBuilder.build();
    }
    
    private Object convertToConnectData(Schema connectSchema, GenericRecord avroRecord) {
        Struct struct = new Struct(connectSchema);
        
        for (Field field : connectSchema.fields()) {
            Object value = avroRecord.get(field.name());
            struct.put(field, value);
        }
        
        return struct;
    }
}
```

## 2. 自定义Source Connector开发

### 2.1 数据库Source Connector

```java
// 数据库Source Connector
public class DatabaseSourceConnector extends BaseConnector {
    
    private static final Logger logger = LoggerFactory.getLogger(DatabaseSourceConnector.class);
    
    // 配置常量
    public static final String CONNECTION_URL_CONFIG = "connection.url";
    public static final String CONNECTION_USER_CONFIG = "connection.user";
    public static final String CONNECTION_PASSWORD_CONFIG = "connection.password";
    public static final String TABLE_WHITELIST_CONFIG = "table.whitelist";
    public static final String POLL_INTERVAL_MS_CONFIG = "poll.interval.ms";
    public static final String TIMESTAMP_COLUMN_CONFIG = "timestamp.column.name";
    public static final String INCREMENTING_COLUMN_CONFIG = "incrementing.column.name";
    public static final String TOPIC_PREFIX_CONFIG = "topic.prefix";
    
    private DatabaseSourceConnectorConfig config;
    
    @Override
    public String version() {
        return "1.0.0";
    }
    
    @Override
    protected void validateConfig(Map<String, String> props) {
        validateCommonConfig(props);
        
        if (!props.containsKey(CONNECTION_URL_CONFIG)) {
            throw new ConfigException("Database connection URL is required");
        }
        
        if (!props.containsKey(TABLE_WHITELIST_CONFIG)) {
            throw new ConfigException("Table whitelist is required");
        }
    }
    
    @Override
    protected void initializeConnector(Map<String, String> props) {
        this.config = new DatabaseSourceConnectorConfig(props);
        logger.info("Initialized DatabaseSourceConnector with config: {}", config);
    }
    
    @Override
    protected void cleanup() {
        logger.info("Cleaning up DatabaseSourceConnector");
    }
    
    @Override
    protected ConfigDef getConfigDef() {
        return DatabaseSourceConnectorConfig.CONFIG_DEF;
    }
    
    @Override
    public Class<? extends Task> taskClass() {
        return DatabaseSourceTask.class;
    }
    
    @Override
    public List<Map<String, String>> taskConfigs(int maxTasks) {
        List<String> tables = config.getTableWhitelist();
        List<Map<String, String>> taskConfigs = new ArrayList<>();
        
        // 将表分配给不同的任务
        int tablesPerTask = Math.max(1, tables.size() / maxTasks);
        
        for (int i = 0; i < maxTasks && i * tablesPerTask < tables.size(); i++) {
            Map<String, String> taskConfig = new HashMap<>(configProperties);
            
            int startIndex = i * tablesPerTask;
            int endIndex = Math.min(startIndex + tablesPerTask, tables.size());
            List<String> taskTables = tables.subList(startIndex, endIndex);
            
            taskConfig.put("task.tables", String.join(",", taskTables));
            taskConfig.put("task.id", String.valueOf(i));
            
            taskConfigs.add(taskConfig);
        }
        
        logger.info("Generated {} task configs for {} tables", taskConfigs.size(), tables.size());
        return taskConfigs;
    }
}

// 数据库Source Task
public class DatabaseSourceTask extends BaseTask implements SourceTask {
    
    private static final Logger logger = LoggerFactory.getLogger(DatabaseSourceTask.class);
    
    private DatabaseSourceConnectorConfig config;
    private Connection connection;
    private List<String> tables;
    private Map<String, Object> lastOffsets;
    private long lastPollTime;
    
    @Override
    public String version() {
        return "1.0.0";
    }
    
    @Override
    protected void initializeTask(Map<String, String> props) {
        this.config = new DatabaseSourceConnectorConfig(props);
        this.tables = Arrays.asList(props.get("task.tables").split(","));
        this.lastOffsets = new HashMap<>();
        this.lastPollTime = System.currentTimeMillis();
        
        // 初始化数据库连接
        initializeConnection();
        
        logger.info("Initialized DatabaseSourceTask for tables: {}", tables);
    }
    
    @Override
    protected void cleanup() {
        if (connection != null) {
            try {
                connection.close();
            } catch (SQLException e) {
                logger.warn("Error closing database connection", e);
            }
        }
    }
    
    @Override
    public List<SourceRecord> poll() throws InterruptedException {
        long currentTime = System.currentTimeMillis();
        
        // 检查轮询间隔
        if (currentTime - lastPollTime < config.getPollIntervalMs()) {
            Thread.sleep(config.getPollIntervalMs() - (currentTime - lastPollTime));
        }
        
        List<SourceRecord> records = new ArrayList<>();
        
        try {
            for (String table : tables) {
                List<SourceRecord> tableRecords = pollTable(table);
                records.addAll(tableRecords);
            }
            
            lastPollTime = System.currentTimeMillis();
            recordProcessed(records.size());
            
        } catch (SQLException e) {
            handleError("polling data", e);
        }
        
        return records;
    }
    
    private void initializeConnection() {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
            this.connection = DriverManager.getConnection(
                config.getConnectionUrl(),
                config.getConnectionUser(),
                config.getConnectionPassword()
            );
            
            // 设置连接属性
            connection.setAutoCommit(false);
            connection.setReadOnly(true);
            
        } catch (Exception e) {
            throw new ConnectException("Failed to initialize database connection", e);
        }
    }
    
    private List<SourceRecord> pollTable(String table) throws SQLException {
        List<SourceRecord> records = new ArrayList<>();
        
        // 构建查询SQL
        String query = buildQuery(table);
        
        try (PreparedStatement stmt = connection.prepareStatement(query)) {
            // 设置查询参数
            setQueryParameters(stmt, table);
            
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    SourceRecord record = createSourceRecord(table, rs);
                    records.add(record);
                    
                    // 更新偏移量
                    updateOffset(table, rs);
                }
            }
        }
        
        return records;
    }
    
    private String buildQuery(String table) {
        StringBuilder query = new StringBuilder("SELECT * FROM ").append(table);
        
        // 添加WHERE条件
        List<String> conditions = new ArrayList<>();
        
        if (config.getTimestampColumnName() != null) {
            conditions.add(config.getTimestampColumnName() + " > ?");
        }
        
        if (config.getIncrementingColumnName() != null) {
            conditions.add(config.getIncrementingColumnName() + " > ?");
        }
        
        if (!conditions.isEmpty()) {
            query.append(" WHERE ").append(String.join(" AND ", conditions));
        }
        
        // 添加ORDER BY
        List<String> orderBy = new ArrayList<>();
        if (config.getTimestampColumnName() != null) {
            orderBy.add(config.getTimestampColumnName());
        }
        if (config.getIncrementingColumnName() != null) {
            orderBy.add(config.getIncrementingColumnName());
        }
        
        if (!orderBy.isEmpty()) {
            query.append(" ORDER BY ").append(String.join(", ", orderBy));
        }
        
        // 添加LIMIT
        query.append(" LIMIT 1000");
        
        return query.toString();
    }
    
    private void setQueryParameters(PreparedStatement stmt, String table) throws SQLException {
        int paramIndex = 1;
        
        Object lastOffset = lastOffsets.get(table);
        
        if (config.getTimestampColumnName() != null) {
            Timestamp lastTimestamp = lastOffset instanceof Map ? 
                (Timestamp) ((Map<?, ?>) lastOffset).get("timestamp") : 
                new Timestamp(0);
            stmt.setTimestamp(paramIndex++, lastTimestamp);
        }
        
        if (config.getIncrementingColumnName() != null) {
            Long lastId = lastOffset instanceof Map ? 
                (Long) ((Map<?, ?>) lastOffset).get("incrementing") : 
                0L;
            stmt.setLong(paramIndex++, lastId);
        }
    }
    
    private SourceRecord createSourceRecord(String table, ResultSet rs) throws SQLException {
        // 创建源分区
        Map<String, Object> sourcePartition = Collections.singletonMap("table", table);
        
        // 创建源偏移量
        Map<String, Object> sourceOffset = new HashMap<>();
        if (config.getTimestampColumnName() != null) {
            sourceOffset.put("timestamp", rs.getTimestamp(config.getTimestampColumnName()));
        }
        if (config.getIncrementingColumnName() != null) {
            sourceOffset.put("incrementing", rs.getLong(config.getIncrementingColumnName()));
        }
        
        // 创建记录键
        String key = null;
        if (config.getIncrementingColumnName() != null) {
            key = String.valueOf(rs.getLong(config.getIncrementingColumnName()));
        }
        
        // 创建记录值
        Struct value = createRecordValue(rs);
        
        // 确定Topic名称
        String topic = config.getTopicPrefix() + table;
        
        return new SourceRecord(
            sourcePartition,
            sourceOffset,
            topic,
            null, // 分区由Kafka决定
            Schema.OPTIONAL_STRING_SCHEMA,
            key,
            value.schema(),
            value
        );
    }
    
    private Struct createRecordValue(ResultSet rs) throws SQLException {
        ResultSetMetaData metaData = rs.getMetaData();
        int columnCount = metaData.getColumnCount();
        
        // 构建Schema
        SchemaBuilder schemaBuilder = SchemaBuilder.struct();
        for (int i = 1; i <= columnCount; i++) {
            String columnName = metaData.getColumnName(i);
            Schema fieldSchema = getFieldSchema(metaData.getColumnType(i));
            schemaBuilder.field(columnName, fieldSchema);
        }
        Schema schema = schemaBuilder.build();
        
        // 构建Struct
        Struct struct = new Struct(schema);
        for (int i = 1; i <= columnCount; i++) {
            String columnName = metaData.getColumnName(i);
            Object value = rs.getObject(i);
            struct.put(columnName, value);
        }
        
        return struct;
    }
    
    private Schema getFieldSchema(int sqlType) {
        switch (sqlType) {
            case Types.BOOLEAN:
                return Schema.OPTIONAL_BOOLEAN_SCHEMA;
            case Types.TINYINT:
            case Types.SMALLINT:
            case Types.INTEGER:
                return Schema.OPTIONAL_INT32_SCHEMA;
            case Types.BIGINT:
                return Schema.OPTIONAL_INT64_SCHEMA;
            case Types.REAL:
            case Types.FLOAT:
                return Schema.OPTIONAL_FLOAT32_SCHEMA;
            case Types.DOUBLE:
                return Schema.OPTIONAL_FLOAT64_SCHEMA;
            case Types.DECIMAL:
            case Types.NUMERIC:
                return Decimal.schema(2);
            case Types.DATE:
                return Date.SCHEMA;
            case Types.TIME:
                return Time.SCHEMA;
            case Types.TIMESTAMP:
                return Timestamp.SCHEMA;
            case Types.BINARY:
            case Types.VARBINARY:
            case Types.LONGVARBINARY:
                return Schema.OPTIONAL_BYTES_SCHEMA;
            default:
                return Schema.OPTIONAL_STRING_SCHEMA;
        }
    }
    
    private void updateOffset(String table, ResultSet rs) throws SQLException {
        Map<String, Object> offset = new HashMap<>();
        
        if (config.getTimestampColumnName() != null) {
            offset.put("timestamp", rs.getTimestamp(config.getTimestampColumnName()));
        }
        
        if (config.getIncrementingColumnName() != null) {
            offset.put("incrementing", rs.getLong(config.getIncrementingColumnName()));
        }
        
        lastOffsets.put(table, offset);
    }
}
```

### 2.2 配置类实现

```java
// 数据库Source Connector配置类
public class DatabaseSourceConnectorConfig extends AbstractConfig {
    
    public static final ConfigDef CONFIG_DEF = createConfigDef();
    
    // 数据库连接配置
    public static final String CONNECTION_URL_CONFIG = "connection.url";
    public static final String CONNECTION_USER_CONFIG = "connection.user";
    public static final String CONNECTION_PASSWORD_CONFIG = "connection.password";
    public static final String CONNECTION_ATTEMPTS_CONFIG = "connection.attempts";
    public static final String CONNECTION_BACKOFF_CONFIG = "connection.backoff.ms";
    
    // 表配置
    public static final String TABLE_WHITELIST_CONFIG = "table.whitelist";
    public static final String TABLE_BLACKLIST_CONFIG = "table.blacklist";
    public static final String CATALOG_PATTERN_CONFIG = "catalog.pattern";
    public static final String SCHEMA_PATTERN_CONFIG = "schema.pattern";
    
    // 轮询配置
    public static final String POLL_INTERVAL_MS_CONFIG = "poll.interval.ms";
    public static final String BATCH_MAX_ROWS_CONFIG = "batch.max.rows";
    
    // 增量配置
    public static final String TIMESTAMP_COLUMN_CONFIG = "timestamp.column.name";
    public static final String INCREMENTING_COLUMN_CONFIG = "incrementing.column.name";
    public static final String TIMESTAMP_DELAY_INTERVAL_MS_CONFIG = "timestamp.delay.interval.ms";
    
    // Topic配置
    public static final String TOPIC_PREFIX_CONFIG = "topic.prefix";
    public static final String TABLE_TOPIC_CONFIG_PREFIX = "table.";
    public static final String TABLE_TOPIC_CONFIG_SUFFIX = ".topic.name";
    
    // 数据类型配置
    public static final String NUMERIC_PRECISION_MAPPING_CONFIG = "numeric.precision.mapping";
    public static final String NUMERIC_MAPPING_CONFIG = "numeric.mapping";
    
    public DatabaseSourceConnectorConfig(Map<String, String> props) {
        super(CONFIG_DEF, props);
    }
    
    private static ConfigDef createConfigDef() {
        ConfigDef configDef = new ConfigDef();
        
        // 数据库连接配置
        configDef.define(
            CONNECTION_URL_CONFIG,
            ConfigDef.Type.STRING,
            ConfigDef.NO_DEFAULT_VALUE,
            ConfigDef.Importance.HIGH,
            "JDBC connection URL for the database"
        );
        
        configDef.define(
            CONNECTION_USER_CONFIG,
            ConfigDef.Type.STRING,
            null,
            ConfigDef.Importance.HIGH,
            "Database username"
        );
        
        configDef.define(
            CONNECTION_PASSWORD_CONFIG,
            ConfigDef.Type.PASSWORD,
            null,
            ConfigDef.Importance.HIGH,
            "Database password"
        );
        
        configDef.define(
            CONNECTION_ATTEMPTS_CONFIG,
            ConfigDef.Type.INT,
            3,
            ConfigDef.Range.atLeast(1),
            ConfigDef.Importance.LOW,
            "Maximum number of attempts to retrieve a valid JDBC connection"
        );
        
        configDef.define(
            CONNECTION_BACKOFF_CONFIG,
            ConfigDef.Type.LONG,
            10000L,
            ConfigDef.Importance.LOW,
            "Backoff time in milliseconds between connection attempts"
        );
        
        // 表配置
        configDef.define(
            TABLE_WHITELIST_CONFIG,
            ConfigDef.Type.LIST,
            Collections.emptyList(),
            ConfigDef.Importance.MEDIUM,
            "List of tables to include in copying"
        );
        
        configDef.define(
            TABLE_BLACKLIST_CONFIG,
            ConfigDef.Type.LIST,
            Collections.emptyList(),
            ConfigDef.Importance.MEDIUM,
            "List of tables to exclude from copying"
        );
        
        // 轮询配置
        configDef.define(
            POLL_INTERVAL_MS_CONFIG,
            ConfigDef.Type.INT,
            5000,
            ConfigDef.Range.atLeast(1),
            ConfigDef.Importance.HIGH,
            "Frequency in ms to poll for new data in each table"
        );
        
        configDef.define(
            BATCH_MAX_ROWS_CONFIG,
            ConfigDef.Type.INT,
            100,
            ConfigDef.Range.atLeast(1),
            ConfigDef.Importance.LOW,
            "Maximum number of rows to include in a single batch"
        );
        
        // 增量配置
        configDef.define(
            TIMESTAMP_COLUMN_CONFIG,
            ConfigDef.Type.STRING,
            "",
            ConfigDef.Importance.MEDIUM,
            "Name of the timestamp column to use for incremental loading"
        );
        
        configDef.define(
            INCREMENTING_COLUMN_CONFIG,
            ConfigDef.Type.STRING,
            "",
            ConfigDef.Importance.MEDIUM,
            "Name of the incrementing column to use for incremental loading"
        );
        
        configDef.define(
            TIMESTAMP_DELAY_INTERVAL_MS_CONFIG,
            ConfigDef.Type.LONG,
            0L,
            ConfigDef.Importance.HIGH,
            "Time to wait before a row with certain timestamp appears in a table"
        );
        
        // Topic配置
        configDef.define(
            TOPIC_PREFIX_CONFIG,
            ConfigDef.Type.STRING,
            "",
            ConfigDef.Importance.MEDIUM,
            "Prefix to prepend to table names to generate the name of the Kafka topic"
        );
        
        return configDef;
    }
    
    // Getter方法
    public String getConnectionUrl() {
        return getString(CONNECTION_URL_CONFIG);
    }
    
    public String getConnectionUser() {
        return getString(CONNECTION_USER_CONFIG);
    }
    
    public String getConnectionPassword() {
        Password password = getPassword(CONNECTION_PASSWORD_CONFIG);
        return password != null ? password.value() : null;
    }
    
    public int getConnectionAttempts() {
        return getInt(CONNECTION_ATTEMPTS_CONFIG);
    }
    
    public long getConnectionBackoffMs() {
        return getLong(CONNECTION_BACKOFF_CONFIG);
    }
    
    public List<String> getTableWhitelist() {
        return getList(TABLE_WHITELIST_CONFIG);
    }
    
    public List<String> getTableBlacklist() {
        return getList(TABLE_BLACKLIST_CONFIG);
    }
    
    public int getPollIntervalMs() {
        return getInt(POLL_INTERVAL_MS_CONFIG);
    }
    
    public int getBatchMaxRows() {
        return getInt(BATCH_MAX_ROWS_CONFIG);
    }
    
    public String getTimestampColumnName() {
        String value = getString(TIMESTAMP_COLUMN_CONFIG);
        return value.isEmpty() ? null : value;
    }
    
    public String getIncrementingColumnName() {
        String value = getString(INCREMENTING_COLUMN_CONFIG);
        return value.isEmpty() ? null : value;
    }
    
    public long getTimestampDelayIntervalMs() {
        return getLong(TIMESTAMP_DELAY_INTERVAL_MS_CONFIG);
    }
    
    public String getTopicPrefix() {
        return getString(TOPIC_PREFIX_CONFIG);
    }
    
    // 验证配置
    public void validate() {
        // 验证数据库连接配置
        if (getConnectionUrl() == null || getConnectionUrl().trim().isEmpty()) {
            throw new ConfigException("Database connection URL cannot be empty");
        }
        
        // 验证表配置
        List<String> whitelist = getTableWhitelist();
        List<String> blacklist = getTableBlacklist();
        
        if (whitelist.isEmpty() && blacklist.isEmpty()) {
            throw new ConfigException("Either table whitelist or blacklist must be specified");
        }
        
        if (!whitelist.isEmpty() && !blacklist.isEmpty()) {
            throw new ConfigException("Cannot specify both table whitelist and blacklist");
        }
        
        // 验证增量配置
        String timestampColumn = getTimestampColumnName();
        String incrementingColumn = getIncrementingColumnName();
        
        if (timestampColumn == null && incrementingColumn == null) {
            throw new ConfigException(
                "At least one of timestamp.column.name or incrementing.column.name must be specified"
            );
        }
    }
}
```

## 3. 自定义Sink Connector开发

### 3.1 Elasticsearch Sink Connector

```java
// Elasticsearch Sink Connector
public class ElasticsearchSinkConnector extends BaseConnector {
    
    private static final Logger logger = LoggerFactory.getLogger(ElasticsearchSinkConnector.class);
    
    // 配置常量
    public static final String CONNECTION_URL_CONFIG = "connection.url";
    public static final String CONNECTION_USERNAME_CONFIG = "connection.username";
    public static final String CONNECTION_PASSWORD_CONFIG = "connection.password";
    public static final String INDEX_PREFIX_CONFIG = "index.prefix";
    public static final String TYPE_NAME_CONFIG = "type.name";
    public static final String BATCH_SIZE_CONFIG = "batch.size";
    public static final String FLUSH_TIMEOUT_MS_CONFIG = "flush.timeout.ms";
    public static final String MAX_RETRIES_CONFIG = "max.retries";
    public static final String RETRY_BACKOFF_MS_CONFIG = "retry.backoff.ms";
    
    private ElasticsearchSinkConnectorConfig config;
    
    @Override
    public String version() {
        return "1.0.0";
    }
    
    @Override
    protected void validateConfig(Map<String, String> props) {
        validateCommonConfig(props);
        
        if (!props.containsKey(CONNECTION_URL_CONFIG)) {
            throw new ConfigException("Elasticsearch connection URL is required");
        }
    }
    
    @Override
    protected void initializeConnector(Map<String, String> props) {
        this.config = new ElasticsearchSinkConnectorConfig(props);
        logger.info("Initialized ElasticsearchSinkConnector with config: {}", config);
    }
    
    @Override
    protected void cleanup() {
        logger.info("Cleaning up ElasticsearchSinkConnector");
    }
    
    @Override
    protected ConfigDef getConfigDef() {
        return ElasticsearchSinkConnectorConfig.CONFIG_DEF;
    }
    
    @Override
    public Class<? extends Task> taskClass() {
        return ElasticsearchSinkTask.class;
    }
    
    @Override
    public List<Map<String, String>> taskConfigs(int maxTasks) {
        List<Map<String, String>> taskConfigs = new ArrayList<>();
        
        for (int i = 0; i < maxTasks; i++) {
            Map<String, String> taskConfig = new HashMap<>(configProperties);
            taskConfig.put("task.id", String.valueOf(i));
            taskConfigs.add(taskConfig);
        }
        
        logger.info("Generated {} task configs", taskConfigs.size());
        return taskConfigs;
    }
}

// Elasticsearch Sink Task
public class ElasticsearchSinkTask extends BaseTask implements SinkTask {
    
    private static final Logger logger = LoggerFactory.getLogger(ElasticsearchSinkTask.class);
    
    private ElasticsearchSinkConnectorConfig config;
    private ElasticsearchClient client;
    private List<SinkRecord> buffer;
    private long lastFlushTime;
    
    @Override
    public String version() {
        return "1.0.0";
    }
    
    @Override
    protected void initializeTask(Map<String, String> props) {
        this.config = new ElasticsearchSinkConnectorConfig(props);
        this.buffer = new ArrayList<>();
        this.lastFlushTime = System.currentTimeMillis();
        
        // 初始化Elasticsearch客户端
        initializeClient();
        
        logger.info("Initialized ElasticsearchSinkTask");
    }
    
    @Override
    protected void cleanup() {
        // 刷新剩余的记录
        if (!buffer.isEmpty()) {
            try {
                flushRecords();
            } catch (Exception e) {
                logger.error("Error flushing remaining records during cleanup", e);
            }
        }
        
        // 关闭客户端
        if (client != null) {
            try {
                client.close();
            } catch (Exception e) {
                logger.warn("Error closing Elasticsearch client", e);
            }
        }
    }
    
    @Override
    public void put(Collection<SinkRecord> records) {
        if (records.isEmpty()) {
            return;
        }
        
        try {
            // 添加记录到缓冲区
            buffer.addAll(records);
            
            // 检查是否需要刷新
            if (shouldFlush()) {
                flushRecords();
            }
            
            recordProcessed(records.size());
            
        } catch (Exception e) {
            handleError("putting records", e);
        }
    }
    
    @Override
    public void flush(Map<TopicPartition, OffsetAndMetadata> offsets) {
        try {
            if (!buffer.isEmpty()) {
                flushRecords();
            }
        } catch (Exception e) {
            handleError("flushing records", e);
        }
    }
    
    private void initializeClient() {
        try {
            // 创建Elasticsearch客户端
            RestClientBuilder builder = RestClient.builder(
                HttpHost.create(config.getConnectionUrl())
            );
            
            // 设置认证
            if (config.getConnectionUsername() != null && config.getConnectionPassword() != null) {
                CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
                credentialsProvider.setCredentials(
                    AuthScope.ANY,
                    new UsernamePasswordCredentials(
                        config.getConnectionUsername(),
                        config.getConnectionPassword()
                    )
                );
                
                builder.setHttpClientConfigCallback(httpClientBuilder ->
                    httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider)
                );
            }
            
            // 设置超时
            builder.setRequestConfigCallback(requestConfigBuilder ->
                requestConfigBuilder
                    .setConnectTimeout(5000)
                    .setSocketTimeout(60000)
            );
            
            RestClient restClient = builder.build();
            this.client = new ElasticsearchClient(
                new RestClientTransport(restClient, new JacksonJsonpMapper())
            );
            
            // 测试连接
            testConnection();
            
        } catch (Exception e) {
            throw new ConnectException("Failed to initialize Elasticsearch client", e);
        }
    }
    
    private void testConnection() {
        try {
            InfoResponse info = client.info();
            logger.info("Connected to Elasticsearch cluster: {}, version: {}", 
                info.clusterName(), info.version().number());
        } catch (Exception e) {
            throw new ConnectException("Failed to connect to Elasticsearch", e);
        }
    }
    
    private boolean shouldFlush() {
        long currentTime = System.currentTimeMillis();
        
        return buffer.size() >= config.getBatchSize() ||
               (currentTime - lastFlushTime) >= config.getFlushTimeoutMs();
    }
    
    private void flushRecords() throws Exception {
        if (buffer.isEmpty()) {
            return;
        }
        
        List<SinkRecord> recordsToFlush = new ArrayList<>(buffer);
        buffer.clear();
        
        int retries = 0;
        Exception lastException = null;
        
        while (retries <= config.getMaxRetries()) {
            try {
                performBulkIndex(recordsToFlush);
                lastFlushTime = System.currentTimeMillis();
                return;
                
            } catch (Exception e) {
                lastException = e;
                retries++;
                
                if (retries <= config.getMaxRetries()) {
                    logger.warn("Bulk index failed, retrying ({}/{})", retries, config.getMaxRetries(), e);
                    Thread.sleep(config.getRetryBackoffMs() * retries);
                } else {
                    logger.error("Bulk index failed after {} retries", config.getMaxRetries(), e);
                }
            }
        }
        
        // 重试失败，重新添加到缓冲区
        buffer.addAll(0, recordsToFlush);
        throw new RetriableException("Failed to flush records after retries", lastException);
    }
    
    private void performBulkIndex(List<SinkRecord> records) throws Exception {
        BulkRequest.Builder bulkBuilder = new BulkRequest.Builder();
        
        for (SinkRecord record : records) {
            BulkOperation operation = createBulkOperation(record);
            bulkBuilder.operations(operation);
        }
        
        BulkRequest bulkRequest = bulkBuilder.build();
        BulkResponse bulkResponse = client.bulk(bulkRequest);
        
        // 检查响应
        if (bulkResponse.errors()) {
            handleBulkErrors(bulkResponse, records);
        } else {
            logger.debug("Successfully indexed {} records", records.size());
        }
    }
    
    private BulkOperation createBulkOperation(SinkRecord record) {
        String index = determineIndex(record);
        String id = determineDocumentId(record);
        
        // 转换记录值为JSON
        Map<String, Object> document = convertRecordToDocument(record);
        
        // 创建索引操作
        IndexOperation<Map<String, Object>> indexOp = IndexOperation.of(i -> i
            .index(index)
            .id(id)
            .document(document)
        );
        
        return BulkOperation.of(b -> b.index(indexOp));
    }
    
    private String determineIndex(SinkRecord record) {
        String indexPrefix = config.getIndexPrefix();
        String topic = record.topic();
        
        if (indexPrefix != null && !indexPrefix.isEmpty()) {
            return indexPrefix + "-" + topic.toLowerCase();
        } else {
            return topic.toLowerCase();
        }
    }
    
    private String determineDocumentId(SinkRecord record) {
        if (record.key() != null) {
            return record.key().toString();
        } else {
            // 使用topic-partition-offset作为ID
            return String.format("%s-%d-%d", 
                record.topic(), record.kafkaPartition(), record.kafkaOffset());
        }
    }
    
    private Map<String, Object> convertRecordToDocument(SinkRecord record) {
        Map<String, Object> document = new HashMap<>();
        
        // 添加Kafka元数据
        document.put("_kafka_topic", record.topic());
        document.put("_kafka_partition", record.kafkaPartition());
        document.put("_kafka_offset", record.kafkaOffset());
        document.put("_kafka_timestamp", record.timestamp());
        
        // 转换记录值
        Object value = record.value();
        if (value instanceof Struct) {
            document.putAll(convertStructToMap((Struct) value));
        } else if (value instanceof Map) {
            document.putAll((Map<String, Object>) value);
        } else if (value != null) {
            document.put("value", value);
        }
        
        return document;
    }
    
    private Map<String, Object> convertStructToMap(Struct struct) {
        Map<String, Object> map = new HashMap<>();
        
        for (Field field : struct.schema().fields()) {
            Object value = struct.get(field);
            if (value instanceof Struct) {
                map.put(field.name(), convertStructToMap((Struct) value));
            } else {
                map.put(field.name(), value);
            }
        }
        
        return map;
    }
    
    private void handleBulkErrors(BulkResponse bulkResponse, List<SinkRecord> records) {
        List<String> errors = new ArrayList<>();
        
        for (int i = 0; i < bulkResponse.items().size(); i++) {
            BulkResponseItem item = bulkResponse.items().get(i);
            
            if (item.error() != null) {
                SinkRecord record = records.get(i);
                String error = String.format(
                    "Failed to index record from topic %s, partition %d, offset %d: %s",
                    record.topic(), record.kafkaPartition(), record.kafkaOffset(),
                    item.error().reason()
                );
                errors.add(error);
            }
        }
        
        if (!errors.isEmpty()) {
            throw new ConnectException("Bulk indexing errors: " + String.join("; ", errors));
        }
    }
}
```

### 3.2 Elasticsearch Sink配置类

```java
// Elasticsearch Sink Connector配置类
public class ElasticsearchSinkConnectorConfig extends AbstractConfig {
    
    public static final ConfigDef CONFIG_DEF = createConfigDef();
    
    // 连接配置
    public static final String CONNECTION_URL_CONFIG = "connection.url";
    public static final String CONNECTION_USERNAME_CONFIG = "connection.username";
    public static final String CONNECTION_PASSWORD_CONFIG = "connection.password";
    public static final String CONNECTION_TIMEOUT_MS_CONFIG = "connection.timeout.ms";
    
    // 索引配置
    public static final String INDEX_PREFIX_CONFIG = "index.prefix";
    public static final String TYPE_NAME_CONFIG = "type.name";
    public static final String WRITE_METHOD_CONFIG = "write.method";
    
    // 批处理配置
    public static final String BATCH_SIZE_CONFIG = "batch.size";
    public static final String FLUSH_TIMEOUT_MS_CONFIG = "flush.timeout.ms";
    public static final String MAX_BUFFERED_RECORDS_CONFIG = "max.buffered.records";
    
    // 重试配置
    public static final String MAX_RETRIES_CONFIG = "max.retries";
    public static final String RETRY_BACKOFF_MS_CONFIG = "retry.backoff.ms";
    
    // 映射配置
    public static final String SCHEMA_IGNORE_CONFIG = "schema.ignore";
    public static final String COMPACT_MAP_ENTRIES_CONFIG = "compact.map.entries";
    
    public ElasticsearchSinkConnectorConfig(Map<String, String> props) {
        super(CONFIG_DEF, props);
    }
    
    private static ConfigDef createConfigDef() {
        ConfigDef configDef = new ConfigDef();
        
        // 连接配置
        configDef.define(
            CONNECTION_URL_CONFIG,
            ConfigDef.Type.STRING,
            ConfigDef.NO_DEFAULT_VALUE,
            ConfigDef.Importance.HIGH,
            "Elasticsearch connection URL"
        );
        
        configDef.define(
            CONNECTION_USERNAME_CONFIG,
            ConfigDef.Type.STRING,
            null,
            ConfigDef.Importance.MEDIUM,
            "Elasticsearch username"
        );
        
        configDef.define(
            CONNECTION_PASSWORD_CONFIG,
            ConfigDef.Type.PASSWORD,
            null,
            ConfigDef.Importance.MEDIUM,
            "Elasticsearch password"
        );
        
        configDef.define(
            CONNECTION_TIMEOUT_MS_CONFIG,
            ConfigDef.Type.INT,
            5000,
            ConfigDef.Range.atLeast(1000),
            ConfigDef.Importance.LOW,
            "Connection timeout in milliseconds"
        );
        
        // 索引配置
        configDef.define(
            INDEX_PREFIX_CONFIG,
            ConfigDef.Type.STRING,
            "",
            ConfigDef.Importance.MEDIUM,
            "Prefix for Elasticsearch index names"
        );
        
        configDef.define(
            TYPE_NAME_CONFIG,
            ConfigDef.Type.STRING,
            "_doc",
            ConfigDef.Importance.LOW,
            "Elasticsearch document type name"
        );
        
        configDef.define(
            WRITE_METHOD_CONFIG,
            ConfigDef.Type.STRING,
            "INSERT",
            ConfigDef.ValidString.in("INSERT", "UPSERT"),
            ConfigDef.Importance.MEDIUM,
            "Write method: INSERT or UPSERT"
        );
        
        // 批处理配置
        configDef.define(
            BATCH_SIZE_CONFIG,
            ConfigDef.Type.INT,
            100,
            ConfigDef.Range.atLeast(1),
            ConfigDef.Importance.MEDIUM,
            "Number of records to batch before sending to Elasticsearch"
        );
        
        configDef.define(
            FLUSH_TIMEOUT_MS_CONFIG,
            ConfigDef.Type.LONG,
            10000L,
            ConfigDef.Range.atLeast(1000L),
            ConfigDef.Importance.MEDIUM,
            "Maximum time to wait before flushing records"
        );
        
        configDef.define(
            MAX_BUFFERED_RECORDS_CONFIG,
            ConfigDef.Type.INT,
            1000,
            ConfigDef.Range.atLeast(1),
            ConfigDef.Importance.LOW,
            "Maximum number of records to buffer"
        );
        
        // 重试配置
        configDef.define(
            MAX_RETRIES_CONFIG,
            ConfigDef.Type.INT,
            3,
            ConfigDef.Range.atLeast(0),
            ConfigDef.Importance.MEDIUM,
            "Maximum number of retries for failed requests"
        );
        
        configDef.define(
            RETRY_BACKOFF_MS_CONFIG,
            ConfigDef.Type.LONG,
            1000L,
            ConfigDef.Range.atLeast(100L),
            ConfigDef.Importance.LOW,
            "Backoff time between retries in milliseconds"
        );
        
        // 映射配置
        configDef.define(
            SCHEMA_IGNORE_CONFIG,
            ConfigDef.Type.BOOLEAN,
            false,
            ConfigDef.Importance.LOW,
            "Whether to ignore schema information"
        );
        
        configDef.define(
            COMPACT_MAP_ENTRIES_CONFIG,
            ConfigDef.Type.BOOLEAN,
            true,
            ConfigDef.Importance.LOW,
            "Whether to compact map entries"
        );
        
        return configDef;
    }
    
    // Getter方法
    public String getConnectionUrl() {
        return getString(CONNECTION_URL_CONFIG);
    }
    
    public String getConnectionUsername() {
        return getString(CONNECTION_USERNAME_CONFIG);
    }
    
    public String getConnectionPassword() {
        Password password = getPassword(CONNECTION_PASSWORD_CONFIG);
        return password != null ? password.value() : null;
    }
    
    public int getConnectionTimeoutMs() {
        return getInt(CONNECTION_TIMEOUT_MS_CONFIG);
    }
    
    public String getIndexPrefix() {
        return getString(INDEX_PREFIX_CONFIG);
    }
    
    public String getTypeName() {
        return getString(TYPE_NAME_CONFIG);
    }
    
    public String getWriteMethod() {
        return getString(WRITE_METHOD_CONFIG);
    }
    
    public int getBatchSize() {
        return getInt(BATCH_SIZE_CONFIG);
    }
    
    public long getFlushTimeoutMs() {
        return getLong(FLUSH_TIMEOUT_MS_CONFIG);
    }
    
    public int getMaxBufferedRecords() {
        return getInt(MAX_BUFFERED_RECORDS_CONFIG);
    }
    
    public int getMaxRetries() {
        return getInt(MAX_RETRIES_CONFIG);
    }
    
    public long getRetryBackoffMs() {
        return getLong(RETRY_BACKOFF_MS_CONFIG);
    }
    
    public boolean isSchemaIgnore() {
        return getBoolean(SCHEMA_IGNORE_CONFIG);
    }
    
    public boolean isCompactMapEntries() {
        return getBoolean(COMPACT_MAP_ENTRIES_CONFIG);
    }
}
```

## 4. 数据管道构建

### 4.1 复杂数据管道设计

```java
// 数据管道管理器
@Component
public class DataPipelineManager {
    
    private static final Logger logger = LoggerFactory.getLogger(DataPipelineManager.class);
    
    @Autowired
    private KafkaConnectClient connectClient;
    
    @Autowired
    private PipelineConfigurationService configService;
    
    @Autowired
    private PipelineMonitoringService monitoringService;
    
    // 创建数据管道
    public void createDataPipeline(DataPipelineConfig pipelineConfig) {
        try {
            logger.info("Creating data pipeline: {}", pipelineConfig.getName());
            
            // 验证管道配置
            validatePipelineConfig(pipelineConfig);
            
            // 创建Source Connector
            if (pipelineConfig.getSourceConfig() != null) {
                createSourceConnector(pipelineConfig.getSourceConfig());
            }
            
            // 创建Sink Connector
            if (pipelineConfig.getSinkConfig() != null) {
                createSinkConnector(pipelineConfig.getSinkConfig());
            }
            
            // 创建数据转换
            if (pipelineConfig.getTransformConfigs() != null) {
                createTransforms(pipelineConfig.getTransformConfigs());
            }
            
            // 启动监控
            monitoringService.startMonitoring(pipelineConfig.getName());
            
            logger.info("Data pipeline created successfully: {}", pipelineConfig.getName());
            
        } catch (Exception e) {
            logger.error("Failed to create data pipeline: {}", pipelineConfig.getName(), e);
            throw new DataPipelineException("Failed to create data pipeline", e);
        }
    }
    
    private void validatePipelineConfig(DataPipelineConfig config) {
        if (config.getName() == null || config.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Pipeline name is required");
        }
        
        if (config.getSourceConfig() == null && config.getSinkConfig() == null) {
            throw new IllegalArgumentException("At least one of source or sink config must be provided");
        }
    }
    
    private void createSourceConnector(ConnectorConfig sourceConfig) {
        Map<String, String> config = sourceConfig.getProperties();
        config.put("connector.class", sourceConfig.getConnectorClass());
        config.put("tasks.max", String.valueOf(sourceConfig.getMaxTasks()));
        
        connectClient.createConnector(sourceConfig.getName(), config);
        logger.info("Source connector created: {}", sourceConfig.getName());
    }
    
    private void createSinkConnector(ConnectorConfig sinkConfig) {
        Map<String, String> config = sinkConfig.getProperties();
        config.put("connector.class", sinkConfig.getConnectorClass());
        config.put("tasks.max", String.valueOf(sinkConfig.getMaxTasks()));
        
        connectClient.createConnector(sinkConfig.getName(), config);
        logger.info("Sink connector created: {}", sinkConfig.getName());
    }
    
    private void createTransforms(List<TransformConfig> transformConfigs) {
        for (TransformConfig transformConfig : transformConfigs) {
            // 转换配置会在Connector配置中指定
            logger.info("Transform configured: {}", transformConfig.getName());
        }
    }
}

// 数据管道配置
public class DataPipelineConfig {
    private String name;
    private String description;
    private ConnectorConfig sourceConfig;
    private ConnectorConfig sinkConfig;
    private List<TransformConfig> transformConfigs;
    private Map<String, String> globalProperties;
    
    // 构造函数
    public DataPipelineConfig(String name) {
        this.name = name;
        this.transformConfigs = new ArrayList<>();
        this.globalProperties = new HashMap<>();
    }
    
    // Getter和Setter方法
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public ConnectorConfig getSourceConfig() { return sourceConfig; }
    public void setSourceConfig(ConnectorConfig sourceConfig) { this.sourceConfig = sourceConfig; }
    
    public ConnectorConfig getSinkConfig() { return sinkConfig; }
    public void setSinkConfig(ConnectorConfig sinkConfig) { this.sinkConfig = sinkConfig; }
    
    public List<TransformConfig> getTransformConfigs() { return transformConfigs; }
    public void setTransformConfigs(List<TransformConfig> transformConfigs) { 
        this.transformConfigs = transformConfigs; 
    }
    
    public Map<String, String> getGlobalProperties() { return globalProperties; }
    public void setGlobalProperties(Map<String, String> globalProperties) { 
        this.globalProperties = globalProperties; 
    }
}

// Connector配置
public class ConnectorConfig {
    private String name;
    private String connectorClass;
    private int maxTasks;
    private Map<String, String> properties;
    
    public ConnectorConfig(String name, String connectorClass) {
        this.name = name;
        this.connectorClass = connectorClass;
        this.maxTasks = 1;
        this.properties = new HashMap<>();
    }
    
    // Getter和Setter方法
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getConnectorClass() { return connectorClass; }
    public void setConnectorClass(String connectorClass) { this.connectorClass = connectorClass; }
    
    public int getMaxTasks() { return maxTasks; }
    public void setMaxTasks(int maxTasks) { this.maxTasks = maxTasks; }
    
    public Map<String, String> getProperties() { return properties; }
    public void setProperties(Map<String, String> properties) { this.properties = properties; }
    
    public void addProperty(String key, String value) {
        this.properties.put(key, value);
    }
}

// 转换配置
public class TransformConfig {
    private String name;
    private String transformClass;
    private Map<String, String> properties;
    
    public TransformConfig(String name, String transformClass) {
        this.name = name;
        this.transformClass = transformClass;
        this.properties = new HashMap<>();
    }
    
    // Getter和Setter方法
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getTransformClass() { return transformClass; }
    public void setTransformClass(String transformClass) { this.transformClass = transformClass; }
    
    public Map<String, String> getProperties() { return properties; }
    public void setProperties(Map<String, String> properties) { this.properties = properties; }
    
    public void addProperty(String key, String value) {
        this.properties.put(key, value);
    }
}
```

### 4.2 数据管道示例

```java
// 电商数据管道构建器
@Service
public class EcommercePipelineBuilder {
    
    @Autowired
    private DataPipelineManager pipelineManager;
    
    // 构建用户行为分析管道
    public void buildUserBehaviorPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("user-behavior-pipeline");
        pipeline.setDescription("用户行为数据分析管道");
        
        // 配置数据库Source
        ConnectorConfig sourceConfig = new ConnectorConfig(
            "user-behavior-source", 
            "com.example.DatabaseSourceConnector"
        );
        sourceConfig.setMaxTasks(3);
        sourceConfig.addProperty("connection.url", "jdbc:mysql://localhost:3306/ecommerce");
        sourceConfig.addProperty("connection.user", "kafka_user");
        sourceConfig.addProperty("connection.password", "kafka_password");
        sourceConfig.addProperty("table.whitelist", "user_events,page_views,clicks");
        sourceConfig.addProperty("timestamp.column.name", "created_at");
        sourceConfig.addProperty("incrementing.column.name", "id");
        sourceConfig.addProperty("topic.prefix", "ecommerce.");
        sourceConfig.addProperty("poll.interval.ms", "5000");
        
        pipeline.setSourceConfig(sourceConfig);
        
        // 配置Elasticsearch Sink
        ConnectorConfig sinkConfig = new ConnectorConfig(
            "user-behavior-sink", 
            "com.example.ElasticsearchSinkConnector"
        );
        sinkConfig.setMaxTasks(2);
        sinkConfig.addProperty("connection.url", "http://localhost:9200");
        sinkConfig.addProperty("topics", "ecommerce.user_events,ecommerce.page_views,ecommerce.clicks");
        sinkConfig.addProperty("index.prefix", "ecommerce");
        sinkConfig.addProperty("batch.size", "100");
        sinkConfig.addProperty("flush.timeout.ms", "10000");
        
        pipeline.setSinkConfig(sinkConfig);
        
        // 配置数据转换
        List<TransformConfig> transforms = new ArrayList<>();
        
        // 添加时间戳转换
        TransformConfig timestampTransform = new TransformConfig(
            "timestamp-convert", 
            "org.apache.kafka.connect.transforms.TimestampConverter$Value"
        );
        timestampTransform.addProperty("target.type", "Timestamp");
        timestampTransform.addProperty("field", "created_at");
        timestampTransform.addProperty("format", "yyyy-MM-dd HH:mm:ss");
        transforms.add(timestampTransform);
        
        // 添加字段重命名
        TransformConfig renameTransform = new TransformConfig(
            "field-rename", 
            "org.apache.kafka.connect.transforms.ReplaceField$Value"
        );
        renameTransform.addProperty("renames", "user_id:userId,event_type:eventType");
        transforms.add(renameTransform);
        
        pipeline.setTransformConfigs(transforms);
        
        // 创建管道
        pipelineManager.createDataPipeline(pipeline);
    }
    
    // 构建订单数据同步管道
    public void buildOrderSyncPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("order-sync-pipeline");
        pipeline.setDescription("订单数据同步管道");
        
        // 配置数据库Source
        ConnectorConfig sourceConfig = new ConnectorConfig(
            "order-source", 
            "io.debezium.connector.mysql.MySqlConnector"
        );
        sourceConfig.setMaxTasks(1);
        sourceConfig.addProperty("database.hostname", "localhost");
        sourceConfig.addProperty("database.port", "3306");
        sourceConfig.addProperty("database.user", "debezium");
        sourceConfig.addProperty("database.password", "dbz");
        sourceConfig.addProperty("database.server.id", "184054");
        sourceConfig.addProperty("database.server.name", "ecommerce");
        sourceConfig.addProperty("database.include.list", "ecommerce");
        sourceConfig.addProperty("table.include.list", "ecommerce.orders,ecommerce.order_items");
        sourceConfig.addProperty("database.history.kafka.bootstrap.servers", "localhost:9092");
        sourceConfig.addProperty("database.history.kafka.topic", "schema-changes.ecommerce");
        
        pipeline.setSourceConfig(sourceConfig);
        
        // 配置Redis Sink（自定义）
        ConnectorConfig sinkConfig = new ConnectorConfig(
            "order-redis-sink", 
            "com.example.RedisSinkConnector"
        );
        sinkConfig.setMaxTasks(2);
        sinkConfig.addProperty("redis.host", "localhost");
        sinkConfig.addProperty("redis.port", "6379");
        sinkConfig.addProperty("redis.database", "0");
        sinkConfig.addProperty("topics", "ecommerce.ecommerce.orders,ecommerce.ecommerce.order_items");
        sinkConfig.addProperty("key.prefix", "order:");
        sinkConfig.addProperty("batch.size", "50");
        
        pipeline.setSinkConfig(sinkConfig);
        
        // 创建管道
        pipelineManager.createDataPipeline(pipeline);
    }
}
```

## 5. Connect集群监控和运维

### 5.1 监控指标收集

```java
// Connect集群监控服务
@Service
public class ConnectClusterMonitoringService {
    
    private static final Logger logger = LoggerFactory.getLogger(ConnectClusterMonitoringService.class);
    
    @Autowired
    private KafkaConnectClient connectClient;
    
    @Autowired
    private MetricsCollector metricsCollector;
    
    @Autowired
    private AlertManager alertManager;
    
    @Scheduled(fixedRate = 30000) // 每30秒执行一次
    public void collectClusterMetrics() {
        try {
            // 收集集群状态
            ClusterStatus clusterStatus = collectClusterStatus();
            metricsCollector.recordClusterMetrics(clusterStatus);
            
            // 收集Connector状态
            List<ConnectorStatus> connectorStatuses = collectConnectorStatuses();
            metricsCollector.recordConnectorMetrics(connectorStatuses);
            
            // 收集Task状态
            List<TaskStatus> taskStatuses = collectTaskStatuses();
            metricsCollector.recordTaskMetrics(taskStatuses);
            
            // 检查告警条件
            checkAlertConditions(clusterStatus, connectorStatuses, taskStatuses);
            
        } catch (Exception e) {
            logger.error("Error collecting Connect cluster metrics", e);
        }
    }
    
    private ClusterStatus collectClusterStatus() {
        ClusterStatus status = new ClusterStatus();
        
        try {
            // 获取集群信息
            ConnectClusterState clusterState = connectClient.getClusterState();
            status.setWorkerCount(clusterState.getWorkers().size());
            status.setLeaderUrl(clusterState.getLeaderUrl());
            status.setVersion(clusterState.getVersion());
            status.setCommit(clusterState.getCommit());
            
            // 获取连接器数量
            List<String> connectors = connectClient.getConnectors();
            status.setConnectorCount(connectors.size());
            
            // 计算总任务数
            int totalTasks = 0;
            for (String connector : connectors) {
                ConnectorInfo info = connectClient.getConnectorInfo(connector);
                totalTasks += info.getTasks().size();
            }
            status.setTaskCount(totalTasks);
            
            status.setHealthy(true);
            
        } catch (Exception e) {
            logger.error("Error collecting cluster status", e);
            status.setHealthy(false);
            status.setErrorMessage(e.getMessage());
        }
        
        return status;
    }
    
    private List<ConnectorStatus> collectConnectorStatuses() {
        List<ConnectorStatus> statuses = new ArrayList<>();
        
        try {
            List<String> connectors = connectClient.getConnectors();
            
            for (String connectorName : connectors) {
                ConnectorStatus status = new ConnectorStatus();
                status.setName(connectorName);
                
                try {
                    // 获取连接器状态
                    ConnectorStateInfo stateInfo = connectClient.getConnectorStatus(connectorName);
                    status.setState(stateInfo.getConnector().getState());
                    status.setWorkerUrl(stateInfo.getConnector().getWorkerUrl());
                    
                    // 获取连接器配置
                    ConnectorInfo info = connectClient.getConnectorInfo(connectorName);
                    status.setConnectorClass(info.getConfig().get("connector.class"));
                    status.setTaskCount(info.getTasks().size());
                    
                    // 计算任务状态统计
                    Map<String, Integer> taskStateCount = new HashMap<>();
                    for (TaskInfo task : stateInfo.getTasks()) {
                        String taskState = task.getState();
                        taskStateCount.put(taskState, taskStateCount.getOrDefault(taskState, 0) + 1);
                    }
                    status.setTaskStateCount(taskStateCount);
                    
                    status.setHealthy("RUNNING".equals(status.getState()));
                    
                } catch (Exception e) {
                    logger.error("Error collecting status for connector: {}", connectorName, e);
                    status.setHealthy(false);
                    status.setErrorMessage(e.getMessage());
                }
                
                statuses.add(status);
            }
            
        } catch (Exception e) {
            logger.error("Error collecting connector statuses", e);
        }
        
        return statuses;
    }
    
    private List<TaskStatus> collectTaskStatuses() {
        List<TaskStatus> statuses = new ArrayList<>();
        
        try {
            List<String> connectors = connectClient.getConnectors();
            
            for (String connectorName : connectors) {
                try {
                    ConnectorStateInfo stateInfo = connectClient.getConnectorStatus(connectorName);
                    
                    for (TaskInfo taskInfo : stateInfo.getTasks()) {
                        TaskStatus status = new TaskStatus();
                        status.setConnectorName(connectorName);
                        status.setTaskId(taskInfo.getId());
                        status.setState(taskInfo.getState());
                        status.setWorkerUrl(taskInfo.getWorkerUrl());
                        status.setHealthy("RUNNING".equals(taskInfo.getState()));
                        
                        if (taskInfo.getTrace() != null) {
                            status.setErrorMessage(taskInfo.getTrace());
                        }
                        
                        statuses.add(status);
                    }
                    
                } catch (Exception e) {
                    logger.error("Error collecting task statuses for connector: {}", connectorName, e);
                }
            }
            
        } catch (Exception e) {
            logger.error("Error collecting task statuses", e);
        }
        
        return statuses;
    }
    
    private void checkAlertConditions(ClusterStatus clusterStatus, 
                                    List<ConnectorStatus> connectorStatuses, 
                                    List<TaskStatus> taskStatuses) {
        
        // 检查集群健康状态
        if (!clusterStatus.isHealthy()) {
            alertManager.sendAlert(AlertLevel.CRITICAL, 
                "Connect cluster is unhealthy", clusterStatus.getErrorMessage());
        }
        
        // 检查连接器状态
        for (ConnectorStatus status : connectorStatuses) {
            if (!status.isHealthy()) {
                alertManager.sendAlert(AlertLevel.HIGH, 
                    String.format("Connector %s is not running", status.getName()), 
                    status.getErrorMessage());
            }
        }
        
        // 检查任务状态
        long failedTasks = taskStatuses.stream()
            .filter(status -> "FAILED".equals(status.getState()))
            .count();
        
        if (failedTasks > 0) {
            alertManager.sendAlert(AlertLevel.MEDIUM, 
                String.format("%d tasks are in FAILED state", failedTasks), 
                "Check task logs for details");
        }
        
        // 检查任务分布
        Map<String, Long> workerTaskCount = taskStatuses.stream()
            .collect(Collectors.groupingBy(TaskStatus::getWorkerUrl, Collectors.counting()));
        
        if (workerTaskCount.size() > 1) {
            long maxTasks = Collections.max(workerTaskCount.values());
            long minTasks = Collections.min(workerTaskCount.values());
            
            if (maxTasks - minTasks > 5) { // 任务分布不均衡
                alertManager.sendAlert(AlertLevel.LOW, 
                    "Task distribution is unbalanced across workers", 
                    String.format("Max tasks per worker: %d, Min tasks per worker: %d", maxTasks, minTasks));
            }
        }
    }
}

// 状态类定义
public class ClusterStatus {
    private int workerCount;
    private String leaderUrl;
    private String version;
    private String commit;
    private int connectorCount;
    private int taskCount;
    private boolean healthy;
    private String errorMessage;
    private long timestamp;
    
    public ClusterStatus() {
        this.timestamp = System.currentTimeMillis();
    }
    
    // Getter和Setter方法
    public int getWorkerCount() { return workerCount; }
    public void setWorkerCount(int workerCount) { this.workerCount = workerCount; }
    
    public String getLeaderUrl() { return leaderUrl; }
    public void setLeaderUrl(String leaderUrl) { this.leaderUrl = leaderUrl; }
    
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    
    public String getCommit() { return commit; }
    public void setCommit(String commit) { this.commit = commit; }
    
    public int getConnectorCount() { return connectorCount; }
    public void setConnectorCount(int connectorCount) { this.connectorCount = connectorCount; }
    
    public int getTaskCount() { return taskCount; }
    public void setTaskCount(int taskCount) { this.taskCount = taskCount; }
    
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
```

### 5.2 运维自动化

```java
// Connect运维自动化服务
@Service
public class ConnectOpsService {
    
    private static final Logger logger = LoggerFactory.getLogger(ConnectOpsService.class);
    
    @Autowired
    private KafkaConnectClient connectClient;
    
    @Autowired
    private ConnectClusterMonitoringService monitoringService;
    
    // 自动重启失败的连接器
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void autoRestartFailedConnectors() {
        try {
            List<String> connectors = connectClient.getConnectors();
            
            for (String connectorName : connectors) {
                ConnectorStateInfo stateInfo = connectClient.getConnectorStatus(connectorName);
                
                // 检查连接器状态
                if ("FAILED".equals(stateInfo.getConnector().getState())) {
                    logger.warn("Connector {} is in FAILED state, attempting restart", connectorName);
                    restartConnector(connectorName);
                }
                
                // 检查任务状态
                for (TaskInfo task : stateInfo.getTasks()) {
                    if ("FAILED".equals(task.getState())) {
                        logger.warn("Task {}-{} is in FAILED state, attempting restart", 
                            connectorName, task.getId());
                        restartTask(connectorName, task.getId());
                    }
                }
            }
            
        } catch (Exception e) {
            logger.error("Error in auto restart process", e);
        }
    }
    
    // 重启连接器
    public void restartConnector(String connectorName) {
        try {
            connectClient.restartConnector(connectorName);
            logger.info("Connector {} restarted successfully", connectorName);
            
            // 等待一段时间后检查状态
            Thread.sleep(5000);
            
            ConnectorStateInfo stateInfo = connectClient.getConnectorStatus(connectorName);
            if ("RUNNING".equals(stateInfo.getConnector().getState())) {
                logger.info("Connector {} is now running", connectorName);
            } else {
                logger.warn("Connector {} restart failed, current state: {}", 
                    connectorName, stateInfo.getConnector().getState());
            }
            
        } catch (Exception e) {
            logger.error("Failed to restart connector: {}", connectorName, e);
        }
    }
    
    // 重启任务
    public void restartTask(String connectorName, int taskId) {
        try {
            connectClient.restartTask(connectorName, taskId);
            logger.info("Task {}-{} restarted successfully", connectorName, taskId);
            
        } catch (Exception e) {
            logger.error("Failed to restart task {}-{}", connectorName, taskId, e);
        }
    }
    
    // 连接器健康检查
    public ConnectorHealthReport performHealthCheck(String connectorName) {
        ConnectorHealthReport report = new ConnectorHealthReport(connectorName);
        
        try {
            // 获取连接器状态
            ConnectorStateInfo stateInfo = connectClient.getConnectorStatus(connectorName);
            report.setConnectorState(stateInfo.getConnector().getState());
            report.setWorkerUrl(stateInfo.getConnector().getWorkerUrl());
            
            // 检查任务状态
            List<TaskHealthInfo> taskHealthInfos = new ArrayList<>();
            for (TaskInfo task : stateInfo.getTasks()) {
                TaskHealthInfo taskHealth = new TaskHealthInfo();
                taskHealth.setTaskId(task.getId());
                taskHealth.setState(task.getState());
                taskHealth.setWorkerUrl(task.getWorkerUrl());
                taskHealth.setHealthy("RUNNING".equals(task.getState()));
                
                if (task.getTrace() != null) {
                    taskHealth.setErrorMessage(task.getTrace());
                }
                
                taskHealthInfos.add(taskHealth);
            }
            report.setTaskHealthInfos(taskHealthInfos);
            
            // 获取连接器配置
            ConnectorInfo info = connectClient.getConnectorInfo(connectorName);
            report.setConnectorClass(info.getConfig().get("connector.class"));
            report.setMaxTasks(Integer.parseInt(info.getConfig().getOrDefault("tasks.max", "1")));
            
            // 计算整体健康状态
            boolean isHealthy = "RUNNING".equals(report.getConnectorState()) &&
                taskHealthInfos.stream().allMatch(TaskHealthInfo::isHealthy);
            report.setHealthy(isHealthy);
            
        } catch (Exception e) {
            logger.error("Error performing health check for connector: {}", connectorName, e);
            report.setHealthy(false);
            report.setErrorMessage(e.getMessage());
        }
        
        return report;
    }
    
    // 批量健康检查
    public List<ConnectorHealthReport> performBatchHealthCheck() {
        List<ConnectorHealthReport> reports = new ArrayList<>();
        
        try {
            List<String> connectors = connectClient.getConnectors();
            
            for (String connectorName : connectors) {
                ConnectorHealthReport report = performHealthCheck(connectorName);
                reports.add(report);
            }
            
        } catch (Exception e) {
            logger.error("Error performing batch health check", e);
        }
        
        return reports;
    }
}

// 连接器健康报告
public class ConnectorHealthReport {
    private String connectorName;
    private String connectorState;
    private String workerUrl;
    private String connectorClass;
    private int maxTasks;
    private List<TaskHealthInfo> taskHealthInfos;
    private boolean healthy;
    private String errorMessage;
    private long timestamp;
    
    public ConnectorHealthReport(String connectorName) {
        this.connectorName = connectorName;
        this.timestamp = System.currentTimeMillis();
        this.taskHealthInfos = new ArrayList<>();
    }
    
    // Getter和Setter方法
    public String getConnectorName() { return connectorName; }
    public void setConnectorName(String connectorName) { this.connectorName = connectorName; }
    
    public String getConnectorState() { return connectorState; }
    public void setConnectorState(String connectorState) { this.connectorState = connectorState; }
    
    public String getWorkerUrl() { return workerUrl; }
    public void setWorkerUrl(String workerUrl) { this.workerUrl = workerUrl; }
    
    public String getConnectorClass() { return connectorClass; }
    public void setConnectorClass(String connectorClass) { this.connectorClass = connectorClass; }
    
    public int getMaxTasks() { return maxTasks; }
    public void setMaxTasks(int maxTasks) { this.maxTasks = maxTasks; }
    
    public List<TaskHealthInfo> getTaskHealthInfos() { return taskHealthInfos; }
    public void setTaskHealthInfos(List<TaskHealthInfo> taskHealthInfos) { 
        this.taskHealthInfos = taskHealthInfos; 
    }
    
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}

// 任务健康信息
public class TaskHealthInfo {
    private int taskId;
    private String state;
    private String workerUrl;
    private boolean healthy;
    private String errorMessage;
    
    // Getter和Setter方法
    public int getTaskId() { return taskId; }
    public void setTaskId(int taskId) { this.taskId = taskId; }
    
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    
    public String getWorkerUrl() { return workerUrl; }
    public void setWorkerUrl(String workerUrl) { this.workerUrl = workerUrl; }
    
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
```

## 6. 实战案例：构建企业级数据集成平台

### 6.1 案例背景

构建一个企业级数据集成平台，实现以下功能：
- 从多个数据源（MySQL、PostgreSQL、MongoDB）同步数据到Kafka
- 将数据实时同步到多个目标系统（Elasticsearch、Redis、HDFS）
- 支持数据转换和过滤
- 提供监控和告警功能

### 6.2 平台架构实现

```java
// 企业级数据集成平台
@Service
public class EnterpriseDataIntegrationPlatform {
    
    private static final Logger logger = LoggerFactory.getLogger(EnterpriseDataIntegrationPlatform.class);
    
    @Autowired
    private DataPipelineManager pipelineManager;
    
    @Autowired
    private ConnectOpsService opsService;
    
    @Autowired
    private ConnectClusterMonitoringService monitoringService;
    
    // 初始化数据集成平台
    @PostConstruct
    public void initializePlatform() {
        logger.info("Initializing Enterprise Data Integration Platform");
        
        try {
            // 创建用户数据管道
            createUserDataPipeline();
            
            // 创建订单数据管道
            createOrderDataPipeline();
            
            // 创建产品数据管道
            createProductDataPipeline();
            
            // 创建日志数据管道
            createLogDataPipeline();
            
            logger.info("Enterprise Data Integration Platform initialized successfully");
            
        } catch (Exception e) {
            logger.error("Failed to initialize platform", e);
            throw new RuntimeException("Platform initialization failed", e);
        }
    }
    
    // 创建用户数据管道
    private void createUserDataPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("user-data-pipeline");
        pipeline.setDescription("用户数据集成管道");
        
        // MySQL Source
        ConnectorConfig mysqlSource = new ConnectorConfig(
            "mysql-user-source", 
            "io.debezium.connector.mysql.MySqlConnector"
        );
        mysqlSource.setMaxTasks(2);
        mysqlSource.addProperty("database.hostname", "mysql-server");
        mysqlSource.addProperty("database.port", "3306");
        mysqlSource.addProperty("database.user", "debezium");
        mysqlSource.addProperty("database.password", "dbz");
        mysqlSource.addProperty("database.server.id", "184054");
        mysqlSource.addProperty("database.server.name", "mysql-users");
        mysqlSource.addProperty("database.include.list", "userdb");
        mysqlSource.addProperty("table.include.list", "userdb.users,userdb.user_profiles");
        mysqlSource.addProperty("database.history.kafka.bootstrap.servers", "kafka:9092");
        mysqlSource.addProperty("database.history.kafka.topic", "schema-changes.users");
        
        pipeline.setSourceConfig(mysqlSource);
        
        // Elasticsearch Sink
        ConnectorConfig esSink = new ConnectorConfig(
            "elasticsearch-user-sink", 
            "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector"
        );
        esSink.setMaxTasks(2);
        esSink.addProperty("connection.url", "http://elasticsearch:9200");
        esSink.addProperty("topics", "mysql-users.userdb.users,mysql-users.userdb.user_profiles");
        esSink.addProperty("type.name", "_doc");
        esSink.addProperty("key.ignore", "false");
        esSink.addProperty("schema.ignore", "true");
        esSink.addProperty("batch.size", "100");
        
        pipeline.setSinkConfig(esSink);
        
        // 数据转换
        List<TransformConfig> transforms = new ArrayList<>();
        
        // 提取嵌套字段
        TransformConfig extractField = new TransformConfig(
            "extract-after", 
            "io.debezium.transforms.ExtractNewRecordState"
        );
        extractField.addProperty("drop.tombstones", "false");
        transforms.add(extractField);
        
        // 添加时间戳
        TransformConfig addTimestamp = new TransformConfig(
            "add-timestamp", 
            "org.apache.kafka.connect.transforms.InsertField$Value"
        );
        addTimestamp.addProperty("timestamp.field", "sync_timestamp");
        transforms.add(addTimestamp);
        
        pipeline.setTransformConfigs(transforms);
        
        pipelineManager.createDataPipeline(pipeline);
    }
    
    // 创建订单数据管道
    private void createOrderDataPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("order-data-pipeline");
        pipeline.setDescription("订单数据集成管道");
        
        // PostgreSQL Source
        ConnectorConfig pgSource = new ConnectorConfig(
            "postgresql-order-source", 
            "io.debezium.connector.postgresql.PostgresConnector"
        );
        pgSource.setMaxTasks(2);
        pgSource.addProperty("database.hostname", "postgresql-server");
        pgSource.addProperty("database.port", "5432");
        pgSource.addProperty("database.user", "postgres");
        pgSource.addProperty("database.password", "postgres");
        pgSource.addProperty("database.dbname", "orderdb");
        pgSource.addProperty("database.server.name", "postgresql-orders");
        pgSource.addProperty("table.include.list", "public.orders,public.order_items");
        pgSource.addProperty("plugin.name", "pgoutput");
        
        pipeline.setSourceConfig(pgSource);
        
        // Redis Sink (自定义)
        ConnectorConfig redisSink = new ConnectorConfig(
            "redis-order-sink", 
            "com.example.RedisSinkConnector"
        );
        redisSink.setMaxTasks(2);
        redisSink.addProperty("redis.host", "redis-server");
        redisSink.addProperty("redis.port", "6379");
        redisSink.addProperty("redis.database", "0");
        redisSink.addProperty("topics", "postgresql-orders.public.orders,postgresql-orders.public.order_items");
        redisSink.addProperty("key.prefix", "order:");
        redisSink.addProperty("batch.size", "50");
        redisSink.addProperty("flush.timeout.ms", "5000");
        
        pipeline.setSinkConfig(redisSink);
        
        pipelineManager.createDataPipeline(pipeline);
    }
    
    // 创建产品数据管道
    private void createProductDataPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("product-data-pipeline");
        pipeline.setDescription("产品数据集成管道");
        
        // MongoDB Source
        ConnectorConfig mongoSource = new ConnectorConfig(
            "mongodb-product-source", 
            "io.debezium.connector.mongodb.MongoDbConnector"
        );
        mongoSource.setMaxTasks(1);
        mongoSource.addProperty("mongodb.hosts", "mongodb-server:27017");
        mongoSource.addProperty("mongodb.name", "mongodb-products");
        mongoSource.addProperty("database.include.list", "productdb");
        mongoSource.addProperty("collection.include.list", "productdb.products,productdb.categories");
        
        pipeline.setSourceConfig(mongoSource);
        
        // HDFS Sink
        ConnectorConfig hdfsSink = new ConnectorConfig(
            "hdfs-product-sink", 
            "io.confluent.connect.hdfs.HdfsSinkConnector"
        );
        hdfsSink.setMaxTasks(2);
        hdfsSink.addProperty("hdfs.url", "hdfs://namenode:9000");
        hdfsSink.addProperty("topics", "mongodb-products.productdb.products,mongodb-products.productdb.categories");
        hdfsSink.addProperty("topics.dir", "/kafka-connect");
        hdfsSink.addProperty("flush.size", "1000");
        hdfsSink.addProperty("rotate.interval.ms", "60000");
        hdfsSink.addProperty("format.class", "io.confluent.connect.hdfs.json.JsonFormat");
        hdfsSink.addProperty("partitioner.class", "io.confluent.connect.hdfs.partitioner.TimeBasedPartitioner");
        hdfsSink.addProperty("partition.duration.ms", "3600000");
        hdfsSink.addProperty("path.format", "'year'=YYYY/'month'=MM/'day'=dd/'hour'=HH");
        
        pipeline.setSinkConfig(hdfsSink);
        
        pipelineManager.createDataPipeline(pipeline);
    }
    
    // 创建日志数据管道
    private void createLogDataPipeline() {
        DataPipelineConfig pipeline = new DataPipelineConfig("log-data-pipeline");
        pipeline.setDescription("日志数据集成管道");
        
        // File Source
        ConnectorConfig fileSource = new ConnectorConfig(
            "file-log-source", 
            "org.apache.kafka.connect.file.FileStreamSourceConnector"
        );
        fileSource.setMaxTasks(1);
        fileSource.addProperty("file", "/var/log/application.log");
        fileSource.addProperty("topic", "application-logs");
        
        pipeline.setSourceConfig(fileSource);
        
        // Elasticsearch Sink for logs
        ConnectorConfig esLogSink = new ConnectorConfig(
            "elasticsearch-log-sink", 
            "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector"
        );
        esLogSink.setMaxTasks(1);
        esLogSink.addProperty("connection.url", "http://elasticsearch:9200");
        esLogSink.addProperty("topics", "application-logs");
        esLogSink.addProperty("type.name", "_doc");
        esLogSink.addProperty("key.ignore", "true");
        esLogSink.addProperty("schema.ignore", "true");
        esLogSink.addProperty("batch.size", "500");
        
        pipeline.setSinkConfig(esLogSink);
        
        // 日志解析转换
        List<TransformConfig> transforms = new ArrayList<>();
        
        // 正则表达式解析
        TransformConfig regexTransform = new TransformConfig(
            "regex-parse", 
            "org.apache.kafka.connect.transforms.RegexRouter"
        );
        regexTransform.addProperty("regex", "([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}) ([A-Z]+) (.*)");
        regexTransform.addProperty("replacement", "parsed-logs");
        transforms.add(regexTransform);
        
        pipeline.setTransformConfigs(transforms);
        
        pipelineManager.createDataPipeline(pipeline);
    }
    
    // 获取平台状态
    public PlatformStatus getPlatformStatus() {
        PlatformStatus status = new PlatformStatus();
        
        try {
            // 获取所有连接器的健康报告
            List<ConnectorHealthReport> healthReports = opsService.performBatchHealthCheck();
            status.setConnectorHealthReports(healthReports);
            
            // 计算整体健康状态
            long healthyConnectors = healthReports.stream()
                .filter(ConnectorHealthReport::isHealthy)
                .count();
            
            status.setTotalConnectors(healthReports.size());
            status.setHealthyConnectors((int) healthyConnectors);
            status.setOverallHealthy(healthyConnectors == healthReports.size());
            
            // 计算总任务数
            int totalTasks = healthReports.stream()
                .mapToInt(report -> report.getTaskHealthInfos().size())
                .sum();
            status.setTotalTasks(totalTasks);
            
            // 计算健康任务数
            int healthyTasks = healthReports.stream()
                .mapToInt(report -> (int) report.getTaskHealthInfos().stream()
                    .filter(TaskHealthInfo::isHealthy)
                    .count())
                .sum();
            status.setHealthyTasks(healthyTasks);
            
        } catch (Exception e) {
            logger.error("Error getting platform status", e);
            status.setOverallHealthy(false);
            status.setErrorMessage(e.getMessage());
        }
        
        return status;
    }
}

// 平台状态
public class PlatformStatus {
    private int totalConnectors;
    private int healthyConnectors;
    private int totalTasks;
    private int healthyTasks;
    private boolean overallHealthy;
    private String errorMessage;
    private List<ConnectorHealthReport> connectorHealthReports;
    private long timestamp;
    
    public PlatformStatus() {
        this.timestamp = System.currentTimeMillis();
        this.connectorHealthReports = new ArrayList<>();
    }
    
    // Getter和Setter方法
    public int getTotalConnectors() { return totalConnectors; }
    public void setTotalConnectors(int totalConnectors) { this.totalConnectors = totalConnectors; }
    
    public int getHealthyConnectors() { return healthyConnectors; }
    public void setHealthyConnectors(int healthyConnectors) { this.healthyConnectors = healthyConnectors; }
    
    public int getTotalTasks() { return totalTasks; }
    public void setTotalTasks(int totalTasks) { this.totalTasks = totalTasks; }
    
    public int getHealthyTasks() { return healthyTasks; }
    public void setHealthyTasks(int healthyTasks) { this.healthyTasks = healthyTasks; }
    
    public boolean isOverallHealthy() { return overallHealthy; }
    public void setOverallHealthy(boolean overallHealthy) { this.overallHealthy = overallHealthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public List<ConnectorHealthReport> getConnectorHealthReports() { return connectorHealthReports; }
    public void setConnectorHealthReports(List<ConnectorHealthReport> connectorHealthReports) { 
        this.connectorHealthReports = connectorHealthReports; 
    }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
```

## 7. 实战练习

### 练习1：自定义文件Source Connector

**目标**：开发一个自定义的文件Source Connector，支持监控目录变化并读取新文件。

**要求**：
1. 实现FileWatcherSourceConnector类
2. 支持配置监控目录和文件过滤规则
3. 实现文件变化监听和增量读取
4. 添加错误处理和重试机制

### 练习2：构建实时数据同步管道

**目标**：构建一个完整的数据同步管道，从MySQL同步数据到Elasticsearch。

**要求**：
1. 配置Debezium MySQL Source Connector
2. 配置Elasticsearch Sink Connector
3. 添加数据转换和过滤
4. 实现监控和告警

### 练习3：Connect集群性能优化

**目标**：优化Connect集群的性能和稳定性。

**要求**：
1. 分析当前集群的性能瓶颈
2. 优化Connector和Task配置
3. 实现负载均衡和故障转移
4. 添加性能监控和调优

## 8. 课后作业

### 作业1：企业级数据湖构建

**任务**：设计并实现一个企业级数据湖解决方案。

**要求**：
1. 支持多种数据源（关系型数据库、NoSQL、文件系统、API）
2. 实现数据的实时和批量同步
3. 支持数据转换、清洗和验证
4. 提供数据血缘和元数据管理
5. 实现完整的监控和告警系统

**交付物**：
- 系统架构设计文档
- 完整的代码实现
- 部署和运维文档
- 性能测试报告

### 作业2：实时CDC数据管道

**任务**：构建一个实时的Change Data Capture (CDC) 数据管道。

**要求**：
1. 使用Debezium捕获数据库变更
2. 实现数据的实时转换和路由
3. 支持多目标系统同步
4. 处理数据冲突和一致性问题
5. 实现故障恢复和数据补偿

### 作业3：Connect性能基准测试

**任务**：对Kafka Connect进行全面的性能基准测试。

**要求**：
1. 设计测试场景和数据集
2. 测试不同配置下的性能表现
3. 分析性能瓶颈和优化建议
4. 编写性能测试报告

## 9. 课程总结

### 9.1 关键知识点回顾

1. **Kafka Connect架构**
   - Worker进程和分布式架构
   - Connector和Task的工作原理
   - 配置管理和状态存储

2. **自定义Connector开发**
   - Source Connector开发流程
   - Sink Connector实现要点
   - 配置验证和错误处理

3. **数据转换和序列化**
   - 内置转换器的使用
   - 自定义转换器开发
   - 序列化格式选择

4. **数据管道构建**
   - 管道设计原则
   - 配置管理和版本控制
   - 监控和运维自动化

5. **集群监控和运维**
   - 指标收集和分析
   - 健康检查和故障处理
   - 性能优化和调优

### 9.2 最佳实践总结

1. **架构设计**
   - 合理规划Connector和Task数量
   - 考虑数据一致性和可靠性
   - 设计容错和恢复机制

2. **性能优化**
   - 优化批处理大小和频率
   - 合理配置并发度
   - 监控资源使用情况

3. **运维管理**
   - 实现自动化监控和告警
   - 建立标准化的部署流程
   - 定期进行健康检查和维护

4. **安全考虑**
   - 配置访问控制和认证
   - 加密敏感数据传输
   - 审计和日志记录

### 9.3 下节预告

下一节课我们将学习**Kafka性能优化和调优**，内容包括：
- Kafka集群性能分析和诊断
- 生产者和消费者性能优化
- 存储和网络优化策略
- JVM调优和系统参数配置
- 性能监控和基准测试

通过本节课的学习，你已经掌握了Kafka Connect的深入应用，能够构建企业级的数据集成解决方案。继续加油！

public class ConnectorStatus {
    private String name;
    private String state;
    private String workerUrl;
    private String connectorClass;
    private int taskCount;
    private Map<String, Integer> taskStateCount;
    private boolean healthy;
    private String errorMessage;
    private long timestamp;
    
    public ConnectorStatus() {
        this.timestamp = System.currentTimeMillis();
        this.taskStateCount = new HashMap<>();
    }
    
    // Getter和Setter方法
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    
    public String getWorkerUrl() { return workerUrl; }
    public void setWorkerUrl(String workerUrl) { this.workerUrl = workerUrl; }
    
    public String getConnectorClass() { return connectorClass; }
    public void setConnectorClass(String connectorClass) { this.connectorClass = connectorClass; }
    
    public int getTaskCount() { return taskCount; }
    public void setTaskCount(int taskCount) { this.taskCount = taskCount; }
    
    public Map<String, Integer> getTaskStateCount() { return taskStateCount; }
    public void setTaskStateCount(Map<String, Integer> taskStateCount) { 
        this.taskStateCount = taskStateCount; 
    }
    
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}

public class TaskStatus {
    private String connectorName;
    private int taskId;
    private String state;
    private String workerUrl;
    private boolean healthy;
    private String errorMessage;
    private long timestamp;
    
    public TaskStatus() {
        this.timestamp = System.currentTimeMillis();
    }
    
    // Getter和Setter方法
    public String getConnectorName() { return connectorName; }
    public void setConnectorName(String connectorName) { this.connectorName = connectorName; }
    
    public int getTaskId() { return taskId; }
    public void setTaskId(int taskId) { this.taskId = taskId; }
    
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    
    public String getWorkerUrl() { return workerUrl; }
    public void setWorkerUrl(String workerUrl) { this.workerUrl = workerUrl; }
    
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
```