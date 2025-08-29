# 第5天：Kafka基本操作和命令行工具详解

## 学习目标
- 掌握Kafka的日常运维操作和命令行工具使用
- 熟练使用Topic管理命令
- 掌握生产者和消费者命令行工具
- 学会集群状态查看和配置管理

## 课程内容

### 上午内容

#### 1. Topic管理

##### 1.1 创建Topic
```bash
# 创建Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic my-topic \
  --partitions 3 \
  --replication-factor 2

# 创建带配置的Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic my-config-topic \
  --partitions 3 \
  --replication-factor 2 \
  --config retention.ms=86400000 \
  --config segment.ms=3600000
```

##### 1.2 查看Topic列表
```bash
# 查看所有Topic
kafka-topics.sh --list --bootstrap-server localhost:9092

# 查看Topic详细信息
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --topic my-topic

# 查看所有Topic详细信息
kafka-topics.sh --describe --bootstrap-server localhost:9092
```

##### 1.3 修改Topic配置
```bash
# 增加分区数量（只能增加，不能减少）
kafka-topics.sh --alter \
  --bootstrap-server localhost:9092 \
  --topic my-topic \
  --partitions 5

# 修改Topic配置
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name my-topic \
  --add-config retention.ms=172800000
```

##### 1.4 删除Topic
```bash
# 删除Topic
kafka-topics.sh --delete \
  --bootstrap-server localhost:9092 \
  --topic my-topic
```

#### 2. Topic配置参数详解

##### 2.1 重要配置参数
- **retention.ms**: 消息保留时间（毫秒）
- **retention.bytes**: 分区最大存储大小
- **segment.ms**: 日志段滚动时间
- **segment.bytes**: 日志段最大大小
- **cleanup.policy**: 清理策略（delete/compact）
- **compression.type**: 压缩类型（gzip/snappy/lz4/zstd）
- **min.insync.replicas**: 最小同步副本数
- **unclean.leader.election.enable**: 是否允许不完全Leader选举

##### 2.2 分区数量规划原则
1. **性能考虑**：分区数 = 目标吞吐量 / 单分区吞吐量
2. **消费者数量**：分区数应大于等于消费者数量
3. **硬件资源**：考虑磁盘、内存、网络限制
4. **运维复杂度**：分区过多会增加运维复杂度

#### 3. 生产者命令行工具

##### 3.1 基本使用
```bash
# 启动控制台生产者
kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic

# 带Key的消息发送
kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic \
  --property "parse.key=true" \
  --property "key.separator=:"
```

##### 3.2 批量数据导入
```bash
# 从文件导入数据
kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic < data.txt

# 使用管道导入
echo "Hello Kafka" | kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic
```

##### 3.3 性能测试工具
```bash
# 生产者性能测试
kafka-producer-perf-test.sh \
  --topic my-topic \
  --num-records 100000 \
  --record-size 1024 \
  --throughput 10000 \
  --producer-props bootstrap.servers=localhost:9092
```

### 下午内容

#### 4. 消费者命令行工具

##### 4.1 基本使用
```bash
# 从最新位置开始消费
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic

# 从最早位置开始消费
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic \
  --from-beginning

# 显示Key和Value
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic my-topic \
  --property print.key=true \
  --property key.separator=:
```

##### 4.2 消费者组管理
```bash
# 查看消费者组列表
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list

# 查看消费者组详情
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group my-group \
  --describe

# 重置消费者组偏移量
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group my-group \
  --reset-offsets \
  --to-earliest \
  --topic my-topic \
  --execute
```

##### 4.3 偏移量管理
```bash
# 重置到指定偏移量
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group my-group \
  --reset-offsets \
  --to-offset 1000 \
  --topic my-topic:0 \
  --execute

# 重置到指定时间
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group my-group \
  --reset-offsets \
  --to-datetime 2024-01-01T00:00:00.000 \
  --topic my-topic \
  --execute
```

#### 5. 集群状态查看

##### 5.1 集群信息查询
```bash
# 查看集群元数据
kafka-metadata-shell.sh \
  --snapshot /path/to/metadata

# 查看Broker信息
kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

##### 5.2 Topic详情查看
```bash
# 查看Topic分区分布
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --topic my-topic

# 查看Topic配置
kafka-configs.sh --describe \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name my-topic
```

##### 5.3 分区状态监控
```bash
# 查看分区Leader分布
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --under-replicated-partitions

# 查看不同步的分区
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --unavailable-partitions
```

#### 6. 配置管理

##### 6.1 动态配置管理
```bash
# 查看Broker配置
kafka-configs.sh --describe \
  --bootstrap-server localhost:9092 \
  --entity-type brokers \
  --entity-name 0

# 修改Broker配置
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type brokers \
  --entity-name 0 \
  --add-config log.retention.hours=48

# 删除配置
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type brokers \
  --entity-name 0 \
  --delete-config log.retention.hours
```

##### 6.2 客户端配置管理
```bash
# 查看客户端配置
kafka-configs.sh --describe \
  --bootstrap-server localhost:9092 \
  --entity-type clients \
  --entity-name my-client-id

# 设置客户端限流
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type clients \
  --entity-name my-client-id \
  --add-config producer_byte_rate=1024000
```

## 实战练习

### 练习1：批量Topic管理
创建一个脚本，批量创建多个Topic：

```bash
#!/bin/bash
# create_topics.sh

TOPICS=("user-events" "order-events" "payment-events" "notification-events")
BOOTSTRAP_SERVER="localhost:9092"
PARTITIONS=3
REPLICATION_FACTOR=2

for topic in "${TOPICS[@]}"; do
    echo "Creating topic: $topic"
    kafka-topics.sh --create \
        --bootstrap-server $BOOTSTRAP_SERVER \
        --topic $topic \
        --partitions $PARTITIONS \
        --replication-factor $REPLICATION_FACTOR
done

echo "All topics created successfully!"
```

### 练习2：模拟生产环境数据导入
创建测试数据并导入Kafka：

```bash
# 生成测试数据
for i in {1..1000}; do
    echo "user_$i:{\"id\":$i,\"name\":\"user$i\",\"timestamp\":\"$(date -Iseconds)\"}"
done > test_data.txt

# 导入数据
kafka-console-producer.sh \
    --bootstrap-server localhost:9092 \
    --topic user-events \
    --property "parse.key=true" \
    --property "key.separator=:" < test_data.txt
```

### 练习3：消费者组故障恢复
模拟消费者组故障并恢复：

```bash
# 1. 查看消费者组状态
kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --group test-group \
    --describe

# 2. 重置偏移量到最早位置
kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --group test-group \
    --reset-offsets \
    --to-earliest \
    --all-topics \
    --execute

# 3. 验证重置结果
kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --group test-group \
    --describe
```

## 常用运维脚本

### 1. 健康检查脚本
```bash
#!/bin/bash
# kafka_health_check.sh

BOOTSTRAP_SERVER="localhost:9092"

echo "=== Kafka Health Check ==="

# 检查集群连接
echo "1. Checking cluster connectivity..."
kafka-broker-api-versions.sh --bootstrap-server $BOOTSTRAP_SERVER > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Cluster is accessible"
else
    echo "✗ Cluster is not accessible"
    exit 1
fi

# 检查Topic数量
echo "2. Checking topics..."
TOPIC_COUNT=$(kafka-topics.sh --list --bootstrap-server $BOOTSTRAP_SERVER | wc -l)
echo "✓ Total topics: $TOPIC_COUNT"

# 检查不可用分区
echo "3. Checking unavailable partitions..."
UNAVAILABLE=$(kafka-topics.sh --describe --bootstrap-server $BOOTSTRAP_SERVER --unavailable-partitions)
if [ -z "$UNAVAILABLE" ]; then
    echo "✓ No unavailable partitions"
else
    echo "✗ Found unavailable partitions:"
    echo "$UNAVAILABLE"
fi

echo "=== Health Check Complete ==="
```

### 2. 性能监控脚本
```bash
#!/bin/bash
# kafka_performance_monitor.sh

BOOTSTRAP_SERVER="localhost:9092"
TOPIC="performance-test"

echo "=== Kafka Performance Test ==="

# 生产者性能测试
echo "1. Producer performance test..."
kafka-producer-perf-test.sh \
    --topic $TOPIC \
    --num-records 10000 \
    --record-size 1024 \
    --throughput 1000 \
    --producer-props bootstrap.servers=$BOOTSTRAP_SERVER

# 消费者性能测试
echo "2. Consumer performance test..."
kafka-consumer-perf-test.sh \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --topic $TOPIC \
    --messages 10000
```

## 作业

1. **Topic管理实践**：
   - 创建5个不同配置的Topic
   - 修改其中2个Topic的分区数和配置
   - 删除1个Topic并验证删除结果

2. **数据导入导出**：
   - 准备1000条JSON格式的测试数据
   - 使用命令行工具导入Kafka
   - 使用不同的消费方式验证数据

3. **运维脚本开发**：
   - 编写Topic备份脚本
   - 编写消费者组监控脚本
   - 编写集群状态报告脚本

4. **故障模拟**：
   - 模拟消费者组异常退出
   - 练习偏移量重置操作
   - 验证数据恢复结果

## 总结

本节课学习了Kafka的基本操作和命令行工具使用，包括：
- Topic的创建、查看、修改和删除
- 生产者和消费者命令行工具的使用
- 消费者组和偏移量管理
- 集群状态监控和配置管理
- 实用的运维脚本开发

掌握这些基本操作是进行Kafka运维工作的基础，在实际工作中要多练习，熟练使用这些工具。