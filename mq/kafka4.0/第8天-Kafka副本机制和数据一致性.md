# 第8天：Kafka副本机制和数据一致性

## 学习目标
- 深入理解Kafka的副本机制和同步策略
- 掌握Leader选举算法和ISR机制
- 学会配置和优化数据一致性参数
- 了解不同一致性级别的权衡
- 掌握副本故障恢复和数据修复

## 课程内容

### 上午内容

#### 1. Kafka副本机制概述

##### 1.1 副本架构
```
┌─────────────────────────────────────────────────────────────┐
│                    Topic: user-events                       │
│                    Partitions: 3                           │
│                    Replication Factor: 3                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────┬─────────────┬─────────────┬─────────────────┐
│   Broker 1  │   Broker 2  │   Broker 3  │   Broker 4      │
├─────────────┼─────────────┼─────────────┼─────────────────┤
│ P0 (Leader) │ P0 (Follower│ P1 (Leader) │ P2 (Leader)     │
│ P1 (Follower│ P1 (Follower│ P2 (Follower│ P0 (Follower)   │
│ P2 (Follower│ P2 (Follower│ P0 (Follower│ P1 (Follower)   │
└─────────────┴─────────────┴─────────────┴─────────────────┘

副本状态：
- Leader: 处理所有读写请求
- Follower: 从Leader同步数据
- ISR (In-Sync Replica): 与Leader保持同步的副本集合
```

##### 1.2 副本同步流程
```
生产者 → Leader → Follower1 → Follower2
   │        │         │          │
   │        │         │          │
   └────────┼─────────┼──────────┼─── ACK确认
            │         │          │
         写入日志   同步数据   同步数据
            │         │          │
         更新HW    更新LEO   更新LEO
```

**关键概念**：
- **LEO (Log End Offset)**: 日志末端偏移量
- **HW (High Watermark)**: 高水位标记
- **ISR (In-Sync Replicas)**: 同步副本集合

#### 2. Leader选举机制

##### 2.1 选举触发条件
1. **Leader故障**: Broker宕机或网络分区
2. **Leader下线**: 主动停止服务
3. **ISR变化**: Leader不在ISR中
4. **分区重分配**: 手动触发重分配

##### 2.2 选举算法

**Preferred Leader选举**
```bash
# 查看分区Leader分布
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --topic user-events

# 触发Preferred Leader选举
kafka-preferred-replica-election.sh \
  --bootstrap-server localhost:9092 \
  --path-to-json-file preferred-replica-election.json
```

**选举配置文件**
```json
{
  "partitions": [
    {
      "topic": "user-events",
      "partition": 0
    },
    {
      "topic": "user-events",
      "partition": 1
    },
    {
      "topic": "user-events",
      "partition": 2
    }
  ]
}
```

##### 2.3 选举策略配置

**Broker配置**
```properties
# server.properties

# 自动Leader重平衡
auto.leader.rebalance.enable=true
leader.imbalance.per.broker.percentage=10
leader.imbalance.check.interval.seconds=300

# 不完全Leader选举
unclean.leader.election.enable=false

# 最小ISR配置
min.insync.replicas=2
default.replication.factor=3
```

#### 3. ISR机制详解

##### 3.1 ISR管理

**ISR收缩条件**
```properties
# 副本滞后时间阈值
replica.lag.time.max.ms=30000

# 副本获取超时时间
replica.fetch.wait.max.ms=500

# 副本获取最小字节数
replica.fetch.min.bytes=1

# 副本获取最大字节数
replica.fetch.max.bytes=1048576
```

**ISR扩展条件**
```bash
# 监控ISR状态
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --topic user-events

# 输出示例：
# Topic: user-events  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2
# 说明：Broker 3不在ISR中，可能存在同步延迟
```

##### 3.2 ISR监控脚本

```bash
#!/bin/bash
# isr_monitor.sh

BOOTSTRAP_SERVER="localhost:9092"
ALERT_THRESHOLD=1  # ISR数量低于此值时告警

echo "=== ISR Health Check ==="
echo "Timestamp: $(date)"

# 获取所有Topic的ISR信息
kafka-topics.sh --describe --bootstrap-server $BOOTSTRAP_SERVER | \
grep -E "Topic:|Isr:" | \
while read line; do
    if [[ $line == *"Topic:"* ]]; then
        TOPIC=$(echo $line | awk '{print $2}')
        PARTITION=$(echo $line | awk '{print $4}')
    elif [[ $line == *"Isr:"* ]]; then
        ISR=$(echo $line | awk '{print $8}')
        ISR_COUNT=$(echo $ISR | tr ',' '\n' | wc -l)
        
        if [ $ISR_COUNT -le $ALERT_THRESHOLD ]; then
            echo "⚠️  ALERT: Topic $TOPIC Partition $PARTITION has only $ISR_COUNT ISR(s): $ISR"
        else
            echo "✅ Topic $TOPIC Partition $PARTITION ISR: $ISR (Count: $ISR_COUNT)"
        fi
    fi
done
```

### 下午内容

#### 4. 数据一致性级别

##### 4.1 生产者一致性配置

**acks参数详解**
```java
// acks=0: 不等待确认（最快，可能丢失数据）
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("acks", "0");
props.put("retries", 0);

// acks=1: 等待Leader确认（平衡性能和可靠性）
props.put("acks", "1");
props.put("retries", 3);

// acks=all/-1: 等待所有ISR确认（最安全）
props.put("acks", "all");
props.put("retries", Integer.MAX_VALUE);
props.put("max.in.flight.requests.per.connection", 1);
props.put("enable.idempotence", true);
```

**一致性级别对比**
```
┌─────────────┬──────────────┬──────────────┬──────────────┐
│    acks     │   性能       │   可靠性     │   使用场景   │
├─────────────┼──────────────┼──────────────┼──────────────┤
│     0       │   最高       │   最低       │   日志收集   │
│     1       │   中等       │   中等       │   一般应用   │
│   all/-1    │   最低       │   最高       │   金融交易   │
└─────────────┴──────────────┴──────────────┴──────────────┘
```

##### 4.2 消费者一致性配置

**隔离级别设置**
```java
// 读取已提交的消息（默认）
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("group.id", "my-consumer-group");
props.put("isolation.level", "read_committed");

// 读取所有消息（包括未提交的事务消息）
props.put("isolation.level", "read_uncommitted");

// 自动提交偏移量配置
props.put("enable.auto.commit", "false");
props.put("auto.commit.interval.ms", "1000");
```

#### 5. 副本故障处理

##### 5.1 Follower故障恢复

**故障检测**
```bash
# 检查副本同步状态
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --under-replicated-partitions

# 检查特定Topic的副本状态
kafka-replica-verification.sh \
  --broker-list localhost:9092 \
  --topic-white-list "user-events"
```

**自动恢复流程**
```
1. Follower重启
   ↓
2. 从Leader获取最新的HW
   ↓
3. 截断本地日志到HW位置
   ↓
4. 从HW位置开始同步数据
   ↓
5. 追上Leader后重新加入ISR
```

##### 5.2 Leader故障恢复

**故障转移流程**
```bash
#!/bin/bash
# leader_failover_simulation.sh

TOPIC="user-events"
PARTITION=0
BOOTSTRAP_SERVER="localhost:9092"

echo "=== Leader Failover Simulation ==="

# 1. 查看当前Leader
echo "Current leader:"
kafka-topics.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC | grep "Partition: $PARTITION"

# 2. 模拟Leader故障（停止Broker）
echo "Simulating leader failure..."
# 这里需要手动停止Leader所在的Broker

# 3. 等待选举完成
echo "Waiting for leader election..."
sleep 10

# 4. 查看新Leader
echo "New leader:"
kafka-topics.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC | grep "Partition: $PARTITION"

# 5. 测试读写功能
echo "Testing producer/consumer..."
echo "test message after failover" | \
kafka-console-producer.sh \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC

kafka-console-consumer.sh \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC \
  --from-beginning \
  --max-messages 1
```

#### 6. 数据一致性优化

##### 6.1 性能调优参数

**Broker端配置**
```properties
# 副本同步优化
num.replica.fetchers=4
replica.fetch.max.bytes=1048576
replica.fetch.wait.max.ms=500

# 网络优化
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400

# 日志刷盘优化
log.flush.interval.messages=10000
log.flush.interval.ms=1000
```

**生产者优化**
```java
// 批处理优化
props.put("batch.size", 16384);
props.put("linger.ms", 10);
props.put("buffer.memory", 33554432);

// 压缩优化
props.put("compression.type", "lz4");

// 重试优化
props.put("retries", Integer.MAX_VALUE);
props.put("retry.backoff.ms", 100);
props.put("request.timeout.ms", 30000);
```

##### 6.2 一致性监控

```bash
#!/bin/bash
# consistency_monitor.sh

BOOTSTRAP_SERVER="localhost:9092"
TOPIC="user-events"

echo "=== Consistency Monitoring ==="

# 监控副本延迟
echo "Replica lag monitoring:"
kafka-consumer-groups.sh \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --describe \
  --group __consumer_offsets | \
  grep -E "LAG|PARTITION"

# 监控ISR变化
echo "ISR status:"
kafka-topics.sh --describe \
  --bootstrap-server $BOOTSTRAP_SERVER \
  --topic $TOPIC | \
  awk '/Partition:/ {print "Partition " $4 ": Leader=" $6 ", ISR=" $8}'

# 检查数据一致性
echo "Data consistency check:"
for partition in 0 1 2; do
    echo "Checking partition $partition..."
    
    # 获取分区的最新偏移量
    LATEST_OFFSET=$(kafka-run-class.sh kafka.tools.GetOffsetShell \
      --broker-list $BOOTSTRAP_SERVER \
      --topic $TOPIC \
      --partition $partition \
      --time -1 | cut -d: -f3)
    
    echo "  Latest offset: $LATEST_OFFSET"
done
```

## 实战案例

### 案例1：金融交易系统的一致性配置

```java
/**
 * 金融交易系统的Kafka配置
 * 要求：强一致性，零数据丢失
 */
public class FinancialTransactionProducer {
    
    public static Properties getProducerConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 强一致性配置
        props.put("acks", "all");  // 等待所有ISR确认
        props.put("retries", Integer.MAX_VALUE);  // 无限重试
        props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
        props.put("enable.idempotence", true);  // 启用幂等性
        
        // 超时配置
        props.put("request.timeout.ms", 60000);
        props.put("delivery.timeout.ms", 120000);
        
        // 批处理配置（平衡性能和延迟）
        props.put("batch.size", 1024);  // 较小的批次
        props.put("linger.ms", 1);  // 较短的等待时间
        
        return props;
    }
}
```

**对应的Topic配置**
```bash
# 创建金融交易Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic financial-transactions \
  --partitions 6 \
  --replication-factor 3 \
  --config min.insync.replicas=3 \
  --config unclean.leader.election.enable=false \
  --config retention.ms=2592000000  # 30天保留
```

### 案例2：日志收集系统的性能优化配置

```java
/**
 * 日志收集系统的Kafka配置
 * 要求：高吞吐量，可容忍少量数据丢失
 */
public class LogCollectionProducer {
    
    public static Properties getProducerConfig() {
        Properties props = new Properties();
        
        // 基础配置
        props.put("bootstrap.servers", "kafka1:9092,kafka2:9092,kafka3:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        
        // 高性能配置
        props.put("acks", "1");  // 只等待Leader确认
        props.put("retries", 3);  // 有限重试
        props.put("max.in.flight.requests.per.connection", 5);  // 允许并发
        
        // 批处理优化
        props.put("batch.size", 65536);  // 64KB批次
        props.put("linger.ms", 100);  // 100ms等待时间
        props.put("buffer.memory", 67108864);  // 64MB缓冲区
        
        // 压缩优化
        props.put("compression.type", "lz4");
        
        return props;
    }
}
```

## 实战练习

### 练习1：副本故障模拟
1. 搭建3节点Kafka集群
2. 创建副本因子为3的Topic
3. 模拟Follower故障和恢复
4. 观察ISR变化和数据同步过程

### 练习2：一致性级别测试
1. 配置不同acks级别的生产者
2. 在不同故障场景下测试数据丢失情况
3. 对比性能和可靠性差异

### 练习3：Leader选举优化
1. 配置Preferred Leader选举
2. 测试自动重平衡功能
3. 优化选举参数提升可用性

## 作业

1. **副本机制分析**：
   - 分析不同副本因子对性能和可靠性的影响
   - 设计适合不同业务场景的副本策略
   - 编写副本健康检查脚本

2. **一致性配置优化**：
   - 针对不同业务需求配置一致性参数
   - 测试和对比不同配置的性能表现
   - 制定一致性配置最佳实践

3. **故障恢复演练**：
   - 设计完整的故障恢复流程
   - 编写自动化故障检测脚本
   - 测试不同故障场景的恢复时间

4. **监控告警系统**：
   - 实现ISR状态监控
   - 配置副本延迟告警
   - 创建一致性监控面板

## 总结

本节课深入学习了Kafka的副本机制和数据一致性，包括：
- 副本同步机制和ISR管理
- Leader选举算法和故障转移
- 不同一致性级别的配置和权衡
- 副本故障的检测和恢复
- 一致性监控和性能优化

理解这些机制对于设计高可用、高一致性的Kafka应用至关重要，需要根据具体业务需求在性能和可靠性之间做出合适的权衡。