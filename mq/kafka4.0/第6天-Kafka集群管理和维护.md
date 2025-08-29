# 第6天：Kafka集群管理和维护

## 学习目标
- 掌握Kafka集群的扩容和缩容操作
- 学会数据迁移和重平衡策略
- 了解备份和恢复的最佳实践
- 掌握版本升级和滚动重启流程
- 学会集群监控和故障排查

## 课程内容

### 上午内容

#### 1. 集群架构回顾

##### 1.1 Kafka集群组件
```
┌─────────────────────────────────────────────────────────┐
│                    Kafka Cluster                        │
├─────────────────┬─────────────────┬─────────────────────┤
│   Broker 1      │   Broker 2      │   Broker 3          │
│   (Leader)      │   (Follower)    │   (Follower)        │
│                 │                 │                     │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────────┐ │
│ │Topic A-P0   │ │ │Topic A-P0   │ │ │Topic A-P1       │ │
│ │(Leader)     │ │ │(Replica)    │ │ │(Leader)         │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────────┘ │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────────┐ │
│ │Topic B-P0   │ │ │Topic B-P1   │ │ │Topic B-P0       │ │
│ │(Replica)    │ │ │(Leader)     │ │ │(Replica)        │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────────┘ │
└─────────────────┴─────────────────┴─────────────────────┘
```

##### 1.2 集群状态监控指标
- **Broker状态**：在线/离线、CPU、内存、磁盘使用率
- **Topic指标**：分区数、副本分布、消息速率
- **网络指标**：网络I/O、连接数、请求延迟
- **存储指标**：日志大小、段文件数量、清理频率

#### 2. 集群扩容操作

##### 2.1 添加新Broker

**步骤1：准备新服务器**
```bash
# 1. 安装Kafka
wget https://downloads.apache.org/kafka/2.8.2/kafka_2.13-2.8.2.tgz
tar -xzf kafka_2.13-2.8.2.tgz
cd kafka_2.13-2.8.2

# 2. 配置新Broker
cp config/server.properties config/server-4.properties
```

**步骤2：配置新Broker**
```properties
# config/server-4.properties
broker.id=4
listeners=PLAINTEXT://new-broker:9092
log.dirs=/kafka-logs-4
zookeeper.connect=zk1:2181,zk2:2181,zk3:2181

# 网络和线程配置
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# 日志配置
num.partitions=3
default.replication.factor=3
min.insync.replicas=2

# 日志保留配置
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
```

**步骤3：启动新Broker**
```bash
# 启动新Broker
bin/kafka-server-start.sh config/server-4.properties

# 验证Broker加入集群
bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

##### 2.2 分区重分配

**生成重分配计划**
```bash
# 创建topics-to-move.json
echo '{
  "topics": [
    {"topic": "user-events"},
    {"topic": "order-events"}
  ],
  "version": 1
}' > topics-to-move.json

# 生成重分配计划
bin/kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 \
  --topics-to-move-json-file topics-to-move.json \
  --broker-list "1,2,3,4" \
  --generate
```

**执行重分配**
```bash
# 保存重分配计划到文件
echo '{
  "version": 1,
  "partitions": [
    {
      "topic": "user-events",
      "partition": 0,
      "replicas": [1, 2, 4],
      "log_dirs": ["any", "any", "any"]
    },
    {
      "topic": "user-events",
      "partition": 1,
      "replicas": [2, 3, 4],
      "log_dirs": ["any", "any", "any"]
    }
  ]
}' > reassignment.json

# 执行重分配
bin/kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 \
  --reassignment-json-file reassignment.json \
  --execute

# 验证重分配进度
bin/kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 \
  --reassignment-json-file reassignment.json \
  --verify
```

#### 3. 集群缩容操作

##### 3.1 安全下线Broker

**步骤1：迁移分区**
```bash
# 查看要下线的Broker上的分区
bin/kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 | grep "Leader: 4"

# 生成迁移计划（排除Broker 4）
bin/kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 \
  --topics-to-move-json-file topics-to-move.json \
  --broker-list "1,2,3" \
  --generate
```

**步骤2：执行迁移并验证**
```bash
# 执行分区迁移
bin/kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 \
  --reassignment-json-file migration.json \
  --execute

# 等待迁移完成
while true; do
  STATUS=$(bin/kafka-reassign-partitions.sh \
    --bootstrap-server localhost:9092 \
    --reassignment-json-file migration.json \
    --verify | grep "in progress")
  if [ -z "$STATUS" ]; then
    echo "Migration completed"
    break
  fi
  echo "Migration in progress..."
  sleep 30
done
```

**步骤3：停止Broker**
```bash
# 优雅停止Broker
bin/kafka-server-stop.sh

# 验证Broker已下线
bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### 下午内容

#### 4. 数据备份策略

##### 4.1 Topic级别备份

**使用MirrorMaker 2.0**
```properties
# mm2.properties
clusters = source, target
source.bootstrap.servers = source-cluster:9092
target.bootstrap.servers = backup-cluster:9092

# 复制配置
source->target.enabled = true
source->target.topics = user-events, order-events, payment-events

# 复制策略
replication.policy.class = org.apache.kafka.connect.mirror.DefaultReplicationPolicy
replication.policy.separator = .

# 同步配置
sync.topic.configs.enabled = true
sync.topic.acls.enabled = false
emit.checkpoints.enabled = true
emit.heartbeats.enabled = true
```

**启动MirrorMaker**
```bash
# 启动MirrorMaker 2.0
bin/connect-mirror-maker.sh mm2.properties

# 验证复制状态
bin/kafka-topics.sh --list --bootstrap-server backup-cluster:9092
```

##### 4.2 增量备份脚本

```bash
#!/bin/bash
# kafka_backup.sh

SOURCE_CLUSTER="source:9092"
TARGET_CLUSTER="backup:9092"
BACKUP_TOPICS=("user-events" "order-events" "payment-events")
BACKUP_DIR="/backup/kafka/$(date +%Y%m%d)"

mkdir -p $BACKUP_DIR

echo "Starting Kafka backup at $(date)"

for topic in "${BACKUP_TOPICS[@]}"; do
    echo "Backing up topic: $topic"
    
    # 导出Topic配置
    bin/kafka-configs.sh --describe \
        --bootstrap-server $SOURCE_CLUSTER \
        --entity-type topics \
        --entity-name $topic > "$BACKUP_DIR/${topic}_config.txt"
    
    # 导出Topic元数据
    bin/kafka-topics.sh --describe \
        --bootstrap-server $SOURCE_CLUSTER \
        --topic $topic > "$BACKUP_DIR/${topic}_metadata.txt"
    
    # 使用MirrorMaker进行数据备份
    nohup bin/kafka-mirror-maker.sh \
        --consumer.config consumer.properties \
        --producer.config producer.properties \
        --whitelist $topic > "$BACKUP_DIR/${topic}_mirror.log" 2>&1 &
done

echo "Backup initiated for all topics"
```

#### 5. 数据恢复操作

##### 5.1 Topic恢复

**恢复Topic结构**
```bash
# 1. 重建Topic
bin/kafka-topics.sh --create \
    --bootstrap-server localhost:9092 \
    --topic user-events \
    --partitions 6 \
    --replication-factor 3 \
    --config retention.ms=604800000

# 2. 恢复Topic配置
bin/kafka-configs.sh --alter \
    --bootstrap-server localhost:9092 \
    --entity-type topics \
    --entity-name user-events \
    --add-config retention.ms=604800000,cleanup.policy=delete
```

**数据恢复脚本**
```bash
#!/bin/bash
# kafka_restore.sh

SOURCE_CLUSTER="backup:9092"
TARGET_CLUSTER="localhost:9092"
RESTORE_TOPIC="user-events"
RESTORE_FROM_TIMESTAMP="2024-01-01T00:00:00.000"

echo "Starting restore for topic: $RESTORE_TOPIC"

# 1. 创建消费者组进行数据恢复
bin/kafka-console-consumer.sh \
    --bootstrap-server $SOURCE_CLUSTER \
    --topic $RESTORE_TOPIC \
    --group restore-group \
    --from-beginning \
    --property print.key=true \
    --property key.separator=: | \
bin/kafka-console-producer.sh \
    --bootstrap-server $TARGET_CLUSTER \
    --topic $RESTORE_TOPIC \
    --property parse.key=true \
    --property key.separator=:

echo "Restore completed for topic: $RESTORE_TOPIC"
```

##### 5.2 点对点恢复

```bash
# 使用特定时间戳恢复
bin/kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --group restore-group \
    --reset-offsets \
    --to-datetime $RESTORE_FROM_TIMESTAMP \
    --topic $RESTORE_TOPIC \
    --execute
```

#### 6. 版本升级

##### 6.1 滚动升级流程

**升级前准备**
```bash
# 1. 备份配置文件
cp -r config config_backup_$(date +%Y%m%d)

# 2. 检查集群状态
bin/kafka-topics.sh --describe \
    --bootstrap-server localhost:9092 \
    --under-replicated-partitions

# 3. 确保没有正在进行的重分配
bin/kafka-reassign-partitions.sh \
    --bootstrap-server localhost:9092 \
    --list
```

**逐个升级Broker**
```bash
#!/bin/bash
# rolling_upgrade.sh

BROKERS=("broker1:9092" "broker2:9092" "broker3:9092")
NEW_VERSION="kafka_2.13-3.0.0"

for broker in "${BROKERS[@]}"; do
    echo "Upgrading broker: $broker"
    
    # 1. 停止Broker
    ssh $broker "cd /opt/kafka && bin/kafka-server-stop.sh"
    
    # 2. 备份当前版本
    ssh $broker "mv /opt/kafka /opt/kafka_backup_$(date +%Y%m%d)"
    
    # 3. 安装新版本
    ssh $broker "cd /opt && tar -xzf $NEW_VERSION.tgz && ln -s $NEW_VERSION kafka"
    
    # 4. 复制配置文件
    ssh $broker "cp /opt/kafka_backup_*/config/server.properties /opt/kafka/config/"
    
    # 5. 启动Broker
    ssh $broker "cd /opt/kafka && bin/kafka-server-start.sh -daemon config/server.properties"
    
    # 6. 验证Broker状态
    sleep 30
    bin/kafka-broker-api-versions.sh --bootstrap-server $broker
    
    echo "Broker $broker upgraded successfully"
    echo "Waiting 60 seconds before next broker..."
    sleep 60
done

echo "Rolling upgrade completed"
```

##### 6.2 升级验证

```bash
# 验证集群状态
bin/kafka-topics.sh --describe \
    --bootstrap-server localhost:9092 \
    --under-replicated-partitions

# 验证API版本
bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# 测试生产消费
echo "test message" | bin/kafka-console-producer.sh \
    --bootstrap-server localhost:9092 \
    --topic test-topic

bin/kafka-console-consumer.sh \
    --bootstrap-server localhost:9092 \
    --topic test-topic \
    --from-beginning \
    --max-messages 1
```

## 监控和告警

### 1. 关键监控指标

#### 1.1 Broker级别指标
```bash
# JMX指标收集脚本
#!/bin/bash
# collect_metrics.sh

JMX_PORT=9999
BROKER_HOST="localhost"

# CPU和内存使用率
echo "=== System Metrics ==="
jconsole -J-Djava.awt.headless=true $BROKER_HOST:$JMX_PORT

# Kafka特定指标
echo "=== Kafka Metrics ==="
# 消息速率
echo "Messages in per second:"
jmxtrans-agent.jar -j $BROKER_HOST:$JMX_PORT \
    -q "kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec"

# 字节速率
echo "Bytes in per second:"
jmxtrans-agent.jar -j $BROKER_HOST:$JMX_PORT \
    -q "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec"

# 请求延迟
echo "Request latency:"
jmxtrans-agent.jar -j $BROKER_HOST:$JMX_PORT \
    -q "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce"
```

#### 1.2 Topic级别监控
```bash
# Topic健康检查
#!/bin/bash
# topic_health_check.sh

BOOTSTRAP_SERVER="localhost:9092"

echo "=== Topic Health Check ==="

# 检查不可用分区
echo "Checking unavailable partitions..."
UNAVAILABLE=$(bin/kafka-topics.sh --describe \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --unavailable-partitions)

if [ -n "$UNAVAILABLE" ]; then
    echo "⚠️  Found unavailable partitions:"
    echo "$UNAVAILABLE"
else
    echo "✅ All partitions are available"
fi

# 检查副本不足的分区
echo "Checking under-replicated partitions..."
UNDER_REPLICATED=$(bin/kafka-topics.sh --describe \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --under-replicated-partitions)

if [ -n "$UNDER_REPLICATED" ]; then
    echo "⚠️  Found under-replicated partitions:"
    echo "$UNDER_REPLICATED"
else
    echo "✅ All partitions are properly replicated"
fi
```

### 2. 告警配置

#### 2.1 Prometheus + Grafana监控

**JMX Exporter配置**
```yaml
# jmx_prometheus_config.yml
rules:
- pattern: kafka.server<type=(.+), name=(.+)PerSec\w*><>Count
  name: kafka_server_$1_$2_total
  type: COUNTER

- pattern: kafka.server<type=(.+), name=(.+)PerSec\w*, topic=(.+)><>Count
  name: kafka_server_$1_$2_total
  labels:
    topic: "$3"
  type: COUNTER

- pattern: kafka.network<type=(.+), name=(.+)><>Value
  name: kafka_network_$1_$2
  type: GAUGE

- pattern: kafka.server<type=(.+), name=(.+)><>Value
  name: kafka_server_$1_$2
  type: GAUGE
```

**告警规则**
```yaml
# kafka_alerts.yml
groups:
- name: kafka
  rules:
  - alert: KafkaBrokerDown
    expr: up{job="kafka"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Kafka broker is down"
      description: "Kafka broker {{ $labels.instance }} has been down for more than 1 minute."

  - alert: KafkaUnderReplicatedPartitions
    expr: kafka_server_ReplicaManager_UnderReplicatedPartitions > 0
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Kafka has under-replicated partitions"
      description: "Kafka has {{ $value }} under-replicated partitions."

  - alert: KafkaHighProducerLatency
    expr: kafka_network_RequestMetrics_TotalTimeMs{request="Produce"} > 100
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High Kafka producer latency"
      description: "Kafka producer latency is {{ $value }}ms."
```

## 实战练习

### 练习1：集群扩容实践
1. 在现有3节点集群中添加第4个节点
2. 重新分配现有Topic的分区到新节点
3. 验证数据分布和集群状态

### 练习2：数据备份恢复
1. 配置MirrorMaker 2.0进行跨集群备份
2. 模拟数据丢失场景
3. 从备份集群恢复数据到指定时间点

### 练习3：滚动升级
1. 准备升级计划和回滚方案
2. 执行Kafka版本的滚动升级
3. 验证升级后的功能和性能

## 作业

1. **集群管理脚本**：
   - 编写自动化扩容脚本
   - 实现分区重分配监控脚本
   - 开发集群健康检查工具

2. **备份恢复方案**：
   - 设计完整的备份策略
   - 实现自动化备份脚本
   - 测试不同场景的恢复流程

3. **监控告警系统**：
   - 配置Prometheus监控
   - 设置关键指标告警
   - 创建Grafana监控面板

4. **故障演练**：
   - 模拟Broker故障
   - 练习数据恢复操作
   - 验证集群自愈能力

## 总结

本节课学习了Kafka集群的管理和维护，包括：
- 集群扩容和缩容的安全操作流程
- 数据备份和恢复的最佳实践
- 版本升级的滚动升级策略
- 集群监控和告警的配置方法
- 常见故障的排查和处理

掌握这些技能对于维护生产环境的Kafka集群至关重要，需要在实际环境中多加练习和验证。