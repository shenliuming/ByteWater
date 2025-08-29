# 第4天：Kafka 4.0环境搭建和安装配置

## 学习目标
通过本节课的学习，你将掌握：

1. **Kafka 4.0环境准备**：了解系统要求和依赖环境
2. **KRaft模式部署**：掌握Kafka 4.0默认的KRaft模式安装配置
3. **传统Zookeeper模式**：了解兼容性配置方法
4. **集群配置**：学习多节点Kafka集群的搭建
5. **基本验证**：掌握安装后的功能验证方法
6. **常见问题排查**：解决安装过程中的典型问题

## 1. Kafka 4.0新特性概览

### 1.1 主要改进
- **KRaft模式成为默认**：不再依赖Zookeeper，简化架构
- **改进的分区重平衡**：更快的消费者组重平衡
- **增强的安全性**：更好的认证和授权机制
- **性能优化**：更高的吞吐量和更低的延迟
- **运维友好**：简化的配置和更好的监控支持

### 1.2 版本兼容性
```bash
# Kafka 4.0支持的客户端版本
- Java客户端：2.8+
- Scala版本：2.13
- Java运行时：JDK 17+
```

## 2. 环境准备

### 2.1 系统要求
```bash
# 操作系统要求
- Linux: CentOS 7+, Ubuntu 18.04+
- Windows: Windows 10+
- macOS: 10.14+

# 硬件要求（生产环境）
- CPU: 4核心以上
- 内存: 8GB以上
- 磁盘: SSD推荐，至少100GB
- 网络: 千兆网卡
```

### 2.2 Java环境检查
```bash
# 检查Java版本（必须JDK 17+）
java -version

# 如果没有安装Java 17，安装命令：
# Ubuntu/Debian
sudo apt update
sudo apt install openjdk-17-jdk

# CentOS/RHEL
sudo yum install java-17-openjdk-devel

# 设置JAVA_HOME
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk' >> ~/.bashrc
source ~/.bashrc
```

### 2.3 系统参数优化
```bash
# 修改文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 修改内核参数
echo "vm.swappiness=1" >> /etc/sysctl.conf
echo "vm.dirty_background_ratio=5" >> /etc/sysctl.conf
echo "vm.dirty_ratio=60" >> /etc/sysctl.conf
echo "vm.dirty_expire_centisecs=12000" >> /etc/sysctl.conf
sysctl -p
```

## 3. Kafka 4.0安装部署

### 3.1 下载和解压
```bash
# 下载Kafka 4.0
wget https://downloads.apache.org/kafka/4.0.0/kafka_2.13-4.0.0.tgz

# 解压到指定目录
tar -xzf kafka_2.13-4.0.0.tgz
sudo mv kafka_2.13-4.0.0 /opt/kafka

# 创建软链接
sudo ln -s /opt/kafka /opt/kafka-current

# 设置环境变量
echo 'export KAFKA_HOME=/opt/kafka-current' >> ~/.bashrc
echo 'export PATH=$PATH:$KAFKA_HOME/bin' >> ~/.bashrc
source ~/.bashrc
```

### 3.2 创建用户和目录
```bash
# 创建kafka用户
sudo useradd -r -s /bin/false kafka

# 创建数据目录
sudo mkdir -p /var/kafka-logs
sudo mkdir -p /var/log/kafka

# 设置权限
sudo chown -R kafka:kafka /opt/kafka
sudo chown -R kafka:kafka /var/kafka-logs
sudo chown -R kafka:kafka /var/log/kafka
```

## 4. KRaft模式配置与启动

### 4.1 生成集群ID
```bash
# 生成唯一的集群ID
KAFKA_CLUSTER_ID=$(kafka-storage.sh random-uuid)
echo "Generated Cluster ID: $KAFKA_CLUSTER_ID"

# 保存集群ID到文件
echo $KAFKA_CLUSTER_ID > /opt/kafka/cluster-id.txt
```

### 4.2 配置KRaft模式
```bash
# 复制配置文件
cp /opt/kafka/config/kraft/server.properties /opt/kafka/config/kraft/server-custom.properties

# 编辑配置文件
vim /opt/kafka/config/kraft/server-custom.properties
```

**KRaft配置文件内容：**
```properties
# 节点ID（每个节点必须唯一）
node.id=1

# 角色配置（controller,broker 或 controller,broker）
process.roles=controller,broker

# 监听器配置
listeners=PLAINTEXT://localhost:9092,CONTROLLER://localhost:9093
inter.broker.listener.name=PLAINTEXT
controller.listener.names=CONTROLLER

# 控制器仲裁配置
controller.quorum.voters=1@localhost:9093

# 日志目录
log.dirs=/var/kafka-logs

# 集群ID（使用前面生成的）
cluster.id=your-cluster-id-here

# 其他重要配置
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# 日志配置
num.partitions=3
default.replication.factor=1
min.insync.replicas=1

# 日志保留策略
log.retention.hours=168
log.retention.bytes=1073741824
log.segment.bytes=1073741824

# 日志清理
log.cleanup.policy=delete
log.cleaner.enable=true
```

### 4.3 格式化存储目录
```bash
# 使用生成的集群ID格式化存储
kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c /opt/kafka/config/kraft/server-custom.properties

# 验证格式化结果
ls -la /var/kafka-logs/
```

### 4.4 启动Kafka服务
```bash
# 前台启动（测试用）
kafka-server-start.sh /opt/kafka/config/kraft/server-custom.properties

# 后台启动
nohup kafka-server-start.sh /opt/kafka/config/kraft/server-custom.properties > /var/log/kafka/kafka.log 2>&1 &

# 查看启动日志
tail -f /var/log/kafka/kafka.log
```

### 4.5 创建系统服务
```bash
# 创建systemd服务文件
sudo vim /etc/systemd/system/kafka.service
```

**服务配置文件内容：**
```ini
[Unit]
Description=Apache Kafka Server (KRaft mode)
Documentation=http://kafka.apache.org/documentation.html
Requires=network.target
After=network.target

[Service]
Type=simple
User=kafka
Group=kafka
ExecStart=/opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/kraft/server-custom.properties
ExecStop=/opt/kafka/bin/kafka-server-stop.sh
Restart=on-abnormal
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable kafka
sudo systemctl start kafka
sudo systemctl status kafka
```

## 5. 传统Zookeeper模式（兼容性）

### 5.1 Zookeeper安装配置
```bash
# 如果需要使用传统模式，先安装Zookeeper
# 创建Zookeeper配置
vim /opt/kafka/config/zookeeper.properties
```

**Zookeeper配置：**
```properties
dataDir=/var/zookeeper
clientPort=2181
maxClientCnxns=0
admin.enableServer=false
```

```bash
# 创建Zookeeper数据目录
sudo mkdir -p /var/zookeeper
sudo chown kafka:kafka /var/zookeeper

# 启动Zookeeper
zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties
```

### 5.2 传统Kafka配置
```bash
# 编辑传统模式配置
vim /opt/kafka/config/server.properties
```

**传统模式配置：**
```properties
broker.id=0
listeners=PLAINTEXT://localhost:9092
log.dirs=/var/kafka-logs
zookeeper.connect=localhost:2181
zookeeper.connection.timeout.ms=18000

# 其他配置与KRaft模式类似
num.network.threads=8
num.io.threads=16
num.partitions=3
default.replication.factor=1
```

## 6. Kafka 4.0集群配置

### 6.1 三节点集群配置示例

**节点1配置（192.168.1.101）：**
```properties
node.id=1
process.roles=controller,broker
listeners=PLAINTEXT://192.168.1.101:9092,CONTROLLER://192.168.1.101:9093
controller.quorum.voters=1@192.168.1.101:9093,2@192.168.1.102:9093,3@192.168.1.103:9093
log.dirs=/var/kafka-logs
cluster.id=your-cluster-id
```

**节点2配置（192.168.1.102）：**
```properties
node.id=2
process.roles=controller,broker
listeners=PLAINTEXT://192.168.1.102:9092,CONTROLLER://192.168.1.102:9093
controller.quorum.voters=1@192.168.1.101:9093,2@192.168.1.102:9093,3@192.168.1.103:9093
log.dirs=/var/kafka-logs
cluster.id=your-cluster-id
```

**节点3配置（192.168.1.103）：**
```properties
node.id=3
process.roles=controller,broker
listeners=PLAINTEXT://192.168.1.103:9092,CONTROLLER://192.168.1.103:9093
controller.quorum.voters=1@192.168.1.101:9093,2@192.168.1.102:9093,3@192.168.1.103:9093
log.dirs=/var/kafka-logs
cluster.id=your-cluster-id
```

### 6.2 集群启动顺序
```bash
# 1. 在所有节点上格式化存储（使用相同的cluster-id）
kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c /opt/kafka/config/kraft/server.properties

# 2. 按顺序启动各节点
# 节点1
sudo systemctl start kafka

# 等待节点1完全启动后，启动节点2
sudo systemctl start kafka

# 等待节点2完全启动后，启动节点3
sudo systemctl start kafka
```

## 7. 命令行操作验证

### 7.1 基本连接测试
```bash
# 测试连接
kafka-topics.sh --bootstrap-server localhost:9092 --list

# 查看集群信息
kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### 7.2 创建测试Topic
```bash
# 创建测试Topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic test-topic \
  --partitions 3 \
  --replication-factor 1

# 查看Topic详情
kafka-topics.sh --describe \
  --bootstrap-server localhost:9092 \
  --topic test-topic
```

### 7.3 生产和消费测试
```bash
# 启动生产者
kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic test-topic

# 在另一个终端启动消费者
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic test-topic \
  --from-beginning
```

## 8. 性能优化配置

### 8.1 JVM参数优化
```bash
# 编辑Kafka启动脚本
vim /opt/kafka/bin/kafka-server-start.sh

# 添加JVM参数
export KAFKA_HEAP_OPTS="-Xmx4G -Xms4G"
export KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=35 -XX:+ExplicitGCInvokesConcurrent -Djava.awt.headless=true"
```

### 8.2 操作系统优化
```bash
# 磁盘调度器优化
echo noop > /sys/block/sda/queue/scheduler

# 网络参数优化
echo 'net.core.rmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf
sysctl -p
```

### 8.3 磁盘优化
```bash
# 使用XFS文件系统（推荐）
mkfs.xfs /dev/sdb1

# 挂载选项优化
echo '/dev/sdb1 /var/kafka-logs xfs defaults,noatime,nodiratime 0 0' >> /etc/fstab
mount -a
```

## 9. 监控和故障排查

### 9.1 日志查看
```bash
# 查看Kafka服务日志
tail -f /var/log/kafka/kafka.log

# 查看系统日志
journalctl -u kafka -f

# 查看GC日志
tail -f /opt/kafka/logs/kafkaServer-gc.log
```

### 9.2 性能监控
```bash
# 查看JVM状态
jstat -gc $(pgrep -f kafka) 1s

# 查看网络连接
netstat -tlnp | grep 9092

# 查看磁盘IO
iostat -x 1

# 查看内存使用
free -h
top -p $(pgrep -f kafka)
```

### 9.3 常见问题排查

**问题1：启动失败**
```bash
# 检查Java版本
java -version

# 检查端口占用
netstat -tlnp | grep 9092

# 检查磁盘空间
df -h

# 检查权限
ls -la /var/kafka-logs
```

**问题2：连接超时**
```bash
# 检查防火墙
sudo ufw status
sudo firewall-cmd --list-ports

# 检查网络连通性
telnet localhost 9092

# 检查配置文件
grep -E "listeners|advertised" /opt/kafka/config/kraft/server.properties
```

**问题3：性能问题**
```bash
# 检查磁盘IO
iotop -o

# 检查网络带宽
iftop

# 检查JVM内存
jmap -heap $(pgrep -f kafka)
```

## 10. 实践任务

### 任务1：单机部署
1. 在本地环境安装Kafka 4.0
2. 配置KRaft模式
3. 启动服务并验证功能
4. 创建测试Topic进行消息收发

### 任务2：集群部署
1. 准备3台虚拟机或容器
2. 配置3节点Kafka集群
3. 测试集群的高可用性
4. 模拟节点故障和恢复

### 任务3：性能优化
1. 调整JVM参数
2. 优化操作系统配置
3. 进行性能基准测试
4. 分析和优化瓶颈

## 11. 技能验收标准

### 基础技能
- [ ] 能够独立安装Kafka 4.0
- [ ] 掌握KRaft模式的配置方法
- [ ] 能够启动和停止Kafka服务
- [ ] 掌握基本的验证和测试方法

### 进阶技能
- [ ] 能够搭建多节点Kafka集群
- [ ] 掌握性能优化配置
- [ ] 能够排查常见的安装和配置问题
- [ ] 了解监控和日志分析方法

## 12. 学习资源

### 官方文档
- [Kafka 4.0 Documentation](https://kafka.apache.org/40/documentation.html)
- [KRaft Mode Guide](https://kafka.apache.org/documentation/#kraft)
- [Kafka Configuration Reference](https://kafka.apache.org/documentation/#configuration)

### 实用工具
- [Kafka UI](https://github.com/provectus/kafka-ui)
- [Kafdrop](https://github.com/obsidiandynamics/kafdrop)
- [Kafka Manager](https://github.com/yahoo/CMAK)

### 性能测试工具
- kafka-producer-perf-test.sh
- kafka-consumer-perf-test.sh
- Apache JMeter Kafka插件

## 13. 面试要点

### 常见面试题
1. **Kafka 4.0相比之前版本有哪些重要改进？**
   - KRaft模式成为默认，不再依赖Zookeeper
   - 改进的分区重平衡算法
   - 增强的安全性和性能优化

2. **KRaft模式和Zookeeper模式有什么区别？**
   - 架构简化，减少组件依赖
   - 更好的扩展性和性能
   - 简化的运维和配置

3. **如何优化Kafka的性能？**
   - JVM参数调优
   - 操作系统参数优化
   - 磁盘和网络配置优化
   - 合理的分区和副本配置

4. **Kafka集群部署需要注意哪些问题？**
   - 节点间网络连通性
   - 时间同步
   - 磁盘空间和性能
   - 防火墙和安全配置

## 明天预告
明天我们将学习"第5天：Kafka基本操作和命令行工具详解"，包括：
- Topic管理命令详解
- 生产者和消费者命令行工具
- 消费者组管理
- 性能测试工具使用
- 集群状态查看和配置管理