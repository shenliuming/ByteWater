# 第13天：Spring Boot与Kafka集成基础

## 学习目标
- 掌握Spring Boot与Kafka的集成配置
- 学会使用Spring Kafka发送和接收消息
- 了解Spring Kafka的自动配置机制
- 掌握消息序列化和反序列化配置
- 学会Spring Kafka的测试方法
- 理解Spring Kafka的核心组件和注解

## 课程内容

### 上午内容

#### 1. Spring Boot Kafka集成概述

##### 1.1 Spring Kafka架构

```
┌─────────────────────────────────────────────────────────────┐
│                Spring Boot Kafka Architecture               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Spring Boot Application                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  @RestController                                    │   │
│  │  ┌─────────────┐    ┌─────────────┐                │   │
│  │  │   HTTP      │    │  Kafka      │                │   │
│  │  │  Request    │───>│ Producer    │──────────────┐ │   │
│  │  └─────────────┘    └─────────────┘              │ │   │
│  │                                                   │ │   │
│  │  @KafkaListener                                   │ │   │
│  │  ┌─────────────┐    ┌─────────────┐              │ │   │
│  │  │  Business   │<───│  Kafka      │<─────────────┘ │   │
│  │  │   Logic     │    │ Consumer    │                │   │
│  │  └─────────────┘    └─────────────┘                │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Spring Kafka Framework                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ KafkaTemplate│  │@KafkaListener│  │Serializers  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ProducerFactory│ │ConsumerFactory│ │ErrorHandlers│ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Apache Kafka                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │   Broker1   │  │   Broker2   │  │   Broker3   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

##### 1.2 Spring Kafka核心组件

**核心组件说明**：
- **KafkaTemplate**: 用于发送消息的模板类
- **@KafkaListener**: 用于接收消息的注解
- **ProducerFactory**: 生产者工厂，创建KafkaProducer实例
- **ConsumerFactory**: 消费者工厂，创建KafkaConsumer实例
- **KafkaAdmin**: 用于管理Kafka主题和配置

#### 2. Spring Boot Kafka项目搭建

##### 2.1 项目依赖配置

**Maven依赖 (pom.xml)**：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>
    
    <groupId>com.example</groupId>
    <artifactId>spring-kafka-demo</artifactId>
    <version>1.0.0</version>
    <name>spring-kafka-demo</name>
    <description>Spring Boot Kafka Integration Demo</description>
    
    <properties>
        <java.version>17</java.version>
        <spring-kafka.version>3.1.0</spring-kafka.version>
    </properties>
    
    <dependencies>
        <!-- Spring Boot Starter Web -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        
        <!-- Spring Kafka -->
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>
        
        <!-- JSON处理 -->
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
        </dependency>
        
        <!-- 配置处理 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>
        
        <!-- 测试依赖 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka-test</artifactId>
            <scope>test</scope>
        </dependency>
        
        <!-- 内嵌Kafka用于测试 -->
        <dependency>
            <groupId>org.apache.kafka</groupId>
            <artifactId>kafka_2.13</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

**Gradle依赖 (build.gradle)**：
```gradle
plugins {
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.4'
    id 'java'
}

group = 'com.example'
version = '1.0.0'
java {
    sourceCompatibility = '17'
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.kafka:spring-kafka'
    implementation 'com.fasterxml.jackson.core:jackson-databind'
    
    annotationProcessor 'org.springframework.boot:spring-boot-configuration-processor'
    
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.kafka:spring-kafka-test'
    testImplementation 'org.apache.kafka:kafka_2.13'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

##### 2.2 应用配置文件

**application.yml**：
```yaml
spring:
  application:
    name: spring-kafka-demo
  
  kafka:
    # Kafka服务器配置
    bootstrap-servers: localhost:9092
    
    # 生产者配置
    producer:
      # 确认机制
      acks: all
      # 重试次数
      retries: 3
      # 批次大小
      batch-size: 16384
      # 延迟时间
      linger-ms: 10
      # 缓冲区大小
      buffer-memory: 33554432
      # 键序列化器
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      # 值序列化器
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      # 幂等性
      enable-idempotence: true
      # 自定义属性
      properties:
        max.in.flight.requests.per.connection: 5
        compression.type: snappy
    
    # 消费者配置
    consumer:
      # 消费者组ID
      group-id: spring-kafka-demo-group
      # 自动提交偏移量
      enable-auto-commit: true
      # 自动提交间隔
      auto-commit-interval: 1000
      # 键反序列化器
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      # 值反序列化器
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      # 自动偏移量重置
      auto-offset-reset: earliest
      # 每次拉取的最大记录数
      max-poll-records: 500
      # 自定义属性
      properties:
        spring.json.trusted.packages: "com.example.model"
        isolation.level: read_committed
    
    # 管理员配置
    admin:
      properties:
        bootstrap.servers: localhost:9092
    
    # 监听器配置
    listener:
      # 确认模式
      ack-mode: manual_immediate
      # 并发数
      concurrency: 3
      # 轮询超时
      poll-timeout: 3000
      # 类型映射
      type-mappings: user:com.example.model.User,order:com.example.model.Order

# 自定义Kafka配置
app:
  kafka:
    topics:
      user-events: user-events
      order-events: order-events
      notification-events: notification-events
    
    # 主题配置
    topic-config:
      partitions: 3
      replication-factor: 1
      retention-ms: 604800000  # 7天

# 日志配置
logging:
  level:
    org.springframework.kafka: DEBUG
    org.apache.kafka: INFO
    com.example: DEBUG
```

**application.properties** (替代配置)：
```properties
# 应用配置
spring.application.name=spring-kafka-demo

# Kafka基础配置
spring.kafka.bootstrap-servers=localhost:9092

# 生产者配置
spring.kafka.producer.acks=all
spring.kafka.producer.retries=3
spring.kafka.producer.batch-size=16384
spring.kafka.producer.linger-ms=10
spring.kafka.producer.buffer-memory=33554432
spring.kafka.producer.key-serializer=org.apache.kafka.common.serialization.StringSerializer
spring.kafka.producer.value-serializer=org.springframework.kafka.support.serializer.JsonSerializer
spring.kafka.producer.enable-idempotence=true
spring.kafka.producer.properties.max.in.flight.requests.per.connection=5
spring.kafka.producer.properties.compression.type=snappy

# 消费者配置
spring.kafka.consumer.group-id=spring-kafka-demo-group
spring.kafka.consumer.enable-auto-commit=true
spring.kafka.consumer.auto-commit-interval=1000
spring.kafka.consumer.key-deserializer=org.apache.kafka.common.serialization.StringDeserializer
spring.kafka.consumer.value-deserializer=org.springframework.kafka.support.serializer.JsonDeserializer
spring.kafka.consumer.auto-offset-reset=earliest
spring.kafka.consumer.max-poll-records=500
spring.kafka.consumer.properties.spring.json.trusted.packages=com.example.model
spring.kafka.consumer.properties.isolation.level=read_committed

# 监听器配置
spring.kafka.listener.ack-mode=manual_immediate
spring.kafka.listener.concurrency=3
spring.kafka.listener.poll-timeout=3000
spring.kafka.listener.type-mappings=user:com.example.model.User,order:com.example.model.Order

# 自定义配置
app.kafka.topics.user-events=user-events
app.kafka.topics.order-events=order-events
app.kafka.topics.notification-events=notification-events

# 日志配置
logging.level.org.springframework.kafka=DEBUG
logging.level.org.apache.kafka=INFO
logging.level.com.example=DEBUG
```

#### 3. 基础消息模型定义

##### 3.1 消息实体类

```java
/**
 * 用户事件消息
 */
package com.example.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.Objects;

public class User {
    
    @JsonProperty("id")
    private Long id;
    
    @JsonProperty("username")
    private String username;
    
    @JsonProperty("email")
    private String email;
    
    @JsonProperty("created_at")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;
    
    @JsonProperty("event_type")
    private String eventType;
    
    // 默认构造函数
    public User() {
    }
    
    // 全参构造函数
    public User(Long id, String username, String email, LocalDateTime createdAt, String eventType) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.createdAt = createdAt;
        this.eventType = eventType;
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public String getEventType() {
        return eventType;
    }
    
    public void setEventType(String eventType) {
        this.eventType = eventType;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        User user = (User) o;
        return Objects.equals(id, user.id) &&
               Objects.equals(username, user.username) &&
               Objects.equals(email, user.email);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(id, username, email);
    }
    
    @Override
    public String toString() {
        return "User{" +
                "id=" + id +
                ", username='" + username + '\'' +
                ", email='" + email + '\'' +
                ", createdAt=" + createdAt +
                ", eventType='" + eventType + '\'' +
                '}';
    }
}
```

##### 5.2 消费者配置类

```java
/**
 * Kafka消费者配置类
 */
package com.example.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableKafka
public class KafkaConsumerConfig {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaConsumerConfig.class);
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    @Value("${spring.kafka.consumer.group-id}")
    private String groupId;
    
    /**
     * 消费者工厂配置
     */
    @Bean
    public ConsumerFactory<String, Object> consumerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        configProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        configProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ErrorHandlingDeserializer.class);
        configProps.put(ErrorHandlingDeserializer.VALUE_DESERIALIZER_CLASS, JsonDeserializer.class.getName());
        
        // 偏移量配置
        configProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        configProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        
        // 性能配置
        configProps.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);
        configProps.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000);
        configProps.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000);
        configProps.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 10000);
        
        // JSON反序列化配置
        configProps.put(JsonDeserializer.TRUSTED_PACKAGES, "com.example.model");
        configProps.put(JsonDeserializer.USE_TYPE_INFO_HEADERS, false);
        configProps.put(JsonDeserializer.VALUE_DEFAULT_TYPE, "com.example.model.User");
        
        // 隔离级别
        configProps.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
        
        return new DefaultKafkaConsumerFactory<>(configProps);
    }
    
    /**
     * 监听器容器工厂配置
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        
        // 并发配置
        factory.setConcurrency(3);
        
        // 确认模式
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        
        // 轮询超时
        factory.getContainerProperties().setPollTimeout(3000);
        
        // 错误处理
        factory.setCommonErrorHandler(new org.springframework.kafka.listener.DefaultErrorHandler());
        
        return factory;
    }
    
    /**
     * 批量消费监听器容器工厂
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> batchKafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        
        // 启用批量消费
        factory.setBatchListener(true);
        
        // 并发配置
        factory.setConcurrency(2);
        
        // 确认模式
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.BATCH);
        
        return factory;
    }
}
```

#### 6. REST控制器实现

##### 6.1 用户事件控制器

```java
/**
 * 用户事件REST控制器
 */
package com.example.controller;

import com.example.model.User;
import com.example.service.KafkaProducerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {
    
    private static final Logger logger = LoggerFactory.getLogger(UserController.class);
    
    @Autowired
    private KafkaProducerService kafkaProducerService;
    
    /**
     * 创建用户
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createUser(@RequestBody User user) {
        try {
            logger.info("Creating user: {}", user);
            
            // 设置事件类型和时间戳
            user.setEventType("USER_CREATED");
            user.setCreatedAt(LocalDateTime.now());
            
            // 发送用户创建事件
            kafkaProducerService.sendUserEvent(user);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "User created successfully");
            response.put("userId", user.getId());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error creating user: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to create user: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
    
    /**
     * 更新用户
     */
    @PutMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> updateUser(@PathVariable Long userId, @RequestBody User user) {
        try {
            logger.info("Updating user: {}", userId);
            
            // 设置用户ID和事件类型
            user.setId(userId);
            user.setEventType("USER_UPDATED");
            user.setCreatedAt(LocalDateTime.now());
            
            // 发送用户更新事件
            kafkaProducerService.sendUserEvent(user);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "User updated successfully");
            response.put("userId", userId);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error updating user: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to update user: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
    
    /**
     * 删除用户
     */
    @DeleteMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> deleteUser(@PathVariable Long userId) {
        try {
            logger.info("Deleting user: {}", userId);
            
            // 创建用户删除事件
            User user = new User();
            user.setId(userId);
            user.setEventType("USER_DELETED");
            user.setCreatedAt(LocalDateTime.now());
            
            // 发送用户删除事件
            kafkaProducerService.sendUserEvent(user);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "User deleted successfully");
            response.put("userId", userId);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error deleting user: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to delete user: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
    
    /**
     * 发送通知
     */
    @PostMapping("/{userId}/notifications")
    public ResponseEntity<Map<String, Object>> sendNotification(@PathVariable String userId, 
                                                               @RequestBody Map<String, String> request) {
        try {
            String message = request.get("message");
            logger.info("Sending notification to user {}: {}", userId, message);
            
            // 发送通知
            kafkaProducerService.sendNotification(userId, message);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Notification sent successfully");
            response.put("userId", userId);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error sending notification: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to send notification: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
}
```

##### 6.2 订单事件控制器

```java
/**
 * 订单事件REST控制器
 */
package com.example.controller;

import com.example.model.Order;
import com.example.service.KafkaProducerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderController.class);
    
    @Autowired
    private KafkaProducerService kafkaProducerService;
    
    /**
     * 创建订单
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody Order order) {
        try {
            logger.info("Creating order: {}", order);
            
            // 设置事件类型和时间戳
            order.setEventType("ORDER_CREATED");
            order.setCreatedAt(LocalDateTime.now());
            
            // 发送订单创建事件
            kafkaProducerService.sendOrderEvent(order);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Order created successfully");
            response.put("orderId", order.getOrderId());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error creating order: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to create order: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
    
    /**
     * 更新订单状态
     */
    @PutMapping("/{orderId}/status")
    public ResponseEntity<Map<String, Object>> updateOrderStatus(@PathVariable String orderId, 
                                                                @RequestBody Map<String, String> request) {
        try {
            String status = request.get("status");
            logger.info("Updating order status: orderId={}, status={}", orderId, status);
            
            // 创建订单状态更新事件
            Order order = new Order();
            order.setOrderId(orderId);
            order.setStatus(status);
            order.setCreatedAt(LocalDateTime.now());
            
            // 根据状态设置事件类型
            switch (status.toUpperCase()) {
                case "PAID":
                    order.setEventType("ORDER_PAID");
                    break;
                case "SHIPPED":
                    order.setEventType("ORDER_SHIPPED");
                    break;
                case "DELIVERED":
                    order.setEventType("ORDER_DELIVERED");
                    break;
                case "CANCELLED":
                    order.setEventType("ORDER_CANCELLED");
                    break;
                default:
                    order.setEventType("ORDER_STATUS_UPDATED");
            }
            
            // 发送订单状态更新事件
            kafkaProducerService.sendOrderEvent(order);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Order status updated successfully");
            response.put("orderId", orderId);
            response.put("status", status);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error updating order status: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to update order status: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
}
```

#### 7. Kafka主题管理

##### 7.1 主题配置类

```java
/**
 * Kafka主题配置类
 */
package com.example.config;

import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaAdmin;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaTopicConfig {
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    @Value("${app.kafka.topics.user-events}")
    private String userEventsTopic;
    
    @Value("${app.kafka.topics.order-events}")
    private String orderEventsTopic;
    
    @Value("${app.kafka.topics.notification-events}")
    private String notificationEventsTopic;
    
    /**
     * Kafka管理员配置
     */
    @Bean
    public KafkaAdmin kafkaAdmin() {
        Map<String, Object> configs = new HashMap<>();
        configs.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        return new KafkaAdmin(configs);
    }
    
    /**
     * 用户事件主题
     */
    @Bean
    public NewTopic userEventsTopic() {
        return new NewTopic(userEventsTopic, 3, (short) 1)
            .configs(Map.of(
                "retention.ms", "604800000",  // 7天
                "compression.type", "snappy",
                "cleanup.policy", "delete"
            ));
    }
    
    /**
     * 订单事件主题
     */
    @Bean
    public NewTopic orderEventsTopic() {
        return new NewTopic(orderEventsTopic, 3, (short) 1)
            .configs(Map.of(
                "retention.ms", "604800000",  // 7天
                "compression.type", "snappy",
                "cleanup.policy", "delete"
            ));
    }
    
    /**
     * 通知事件主题
     */
    @Bean
    public NewTopic notificationEventsTopic() {
        return new NewTopic(notificationEventsTopic, 2, (short) 1)
            .configs(Map.of(
                "retention.ms", "86400000",   // 1天
                "compression.type", "snappy",
                "cleanup.policy", "delete"
            ));
    }
}
```

#### 8. 应用启动类

```java
/**
 * Spring Boot应用启动类
 */
package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableKafka
public class SpringKafkaDemoApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(SpringKafkaDemoApplication.class, args);
    }
}
```

### 实战案例

#### 案例1：电商用户注册流程

**场景描述**：用户注册后，需要发送欢迎邮件、初始化用户配置、记录用户行为等。

**实现步骤**：

1. **用户注册API调用**：
```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1001,
    "username": "john_doe",
    "email": "john@example.com"
  }'
```

2. **Kafka消息流转**：
```
用户注册 → REST API → KafkaProducerService → user-events Topic → KafkaConsumerService → 业务处理
```

3. **消息处理逻辑**：
- 发送欢迎邮件
- 初始化用户偏好设置
- 记录用户注册事件
- 触发推荐系统

#### 案例2：订单状态变更通知

**场景描述**：订单状态变更时，需要通知用户、更新库存、记录物流信息等。

**实现步骤**：

1. **订单创建**：
```bash
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-20231201-001",
    "userId": 1001,
    "totalAmount": 299.99,
    "status": "CREATED",
    "items": [
      {
        "productId": "PROD-001",
        "productName": "iPhone 15",
        "quantity": 1,
        "price": 299.99
      }
    ]
  }'
```

2. **状态更新**：
```bash
curl -X PUT http://localhost:8080/api/orders/ORD-20231201-001/status \
  -H "Content-Type: application/json" \
  -d '{"status": "PAID"}'
```

3. **消息处理流程**：
```
订单状态变更 → order-events Topic → 多个消费者并行处理：
├── 库存服务：扣减库存
├── 支付服务：确认支付
├── 物流服务：准备发货
└── 通知服务：发送用户通知
```

### 实战练习

#### 练习1：消息序列化配置

**任务**：配置自定义的消息序列化器，支持Avro格式。

**要求**：
1. 添加Avro依赖
2. 定义Avro Schema
3. 配置Avro序列化器
4. 测试消息发送和接收

**提示代码**：
```java
// Avro序列化器配置
configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, 
    io.confluent.kafka.serializers.KafkaAvroSerializer.class);
configProps.put("schema.registry.url", "http://localhost:8081");
```

#### 练习2：消息过滤和路由

**任务**：实现基于消息内容的过滤和路由机制。

**要求**：
1. 根据用户类型路由到不同的消费者
2. 过滤掉测试用户的消息
3. 实现消息重试机制

**提示代码**：
```java
@KafkaListener(topics = "user-events", 
               groupId = "vip-user-group",
               topicPattern = "user-events",
               filter = "vipUserFilter")
public void consumeVipUserEvent(User user) {
    // 处理VIP用户事件
}

@Bean
public RecordFilterStrategy<String, User> vipUserFilter() {
    return record -> !"VIP".equals(record.value().getUserType());
}
```

#### 练习3：监控和指标收集

**任务**：集成Micrometer监控，收集Kafka相关指标。

**要求**：
1. 配置Micrometer
2. 收集生产者和消费者指标
3. 创建自定义指标
4. 集成Prometheus

**提示代码**：
```java
@Component
public class KafkaMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Counter messagesSent;
    private final Counter messagesReceived;
    
    public KafkaMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.messagesSent = Counter.builder("kafka.messages.sent")
            .description("Number of messages sent to Kafka")
            .register(meterRegistry);
        this.messagesReceived = Counter.builder("kafka.messages.received")
            .description("Number of messages received from Kafka")
            .register(meterRegistry);
    }
    
    public void incrementMessagesSent() {
        messagesSent.increment();
    }
    
    public void incrementMessagesReceived() {
        messagesReceived.increment();
    }
}
```

### 课后作业

#### 作业1：完整的电商系统集成

**要求**：
1. 设计完整的电商系统Kafka集成方案
2. 实现用户、订单、库存、支付等模块的事件驱动架构
3. 配置适当的主题分区和副本策略
4. 实现消息的顺序保证和幂等性
5. 添加完整的错误处理和监控

**交付物**：
- 完整的Spring Boot项目代码
- 系统架构设计文档
- Kafka主题设计文档
- 测试用例和测试报告

#### 作业2：性能测试和优化

**要求**：
1. 使用JMeter或其他工具进行性能测试
2. 测试不同配置下的吞吐量和延迟
3. 优化生产者和消费者配置
4. 分析性能瓶颈并提出优化方案

**测试场景**：
- 高并发用户注册（1000 TPS）
- 大批量订单处理（5000 TPS）
- 实时通知推送（10000 TPS）

#### 作业3：故障恢复和容灾

**要求**：
1. 设计Kafka集群的容灾方案
2. 实现消息的备份和恢复机制
3. 测试各种故障场景的恢复能力
4. 编写运维手册和故障处理流程

**故障场景**：
- Broker节点宕机
- 网络分区
- 消费者组重平衡
- 消息积压处理

### 课程总结

#### 关键知识点回顾

1. **Spring Boot Kafka集成架构**
   - KafkaTemplate和@KafkaListener
   - ProducerFactory和ConsumerFactory
   - 自动配置机制

2. **消息序列化配置**
   - JSON序列化器配置
   - 自定义序列化器
   - 类型映射和信任包配置

3. **生产者和消费者配置**
   - 性能优化参数
   - 可靠性保证配置
   - 错误处理机制

4. **主题管理**
   - 自动创建主题
   - 主题配置参数
   - 分区和副本策略

#### 最佳实践总结

1. **配置管理**
   - 使用配置文件管理Kafka参数
   - 区分开发、测试、生产环境配置
   - 敏感信息加密存储

2. **错误处理**
   - 实现重试机制
   - 配置死信队列
   - 记录详细的错误日志

3. **性能优化**
   - 合理配置批次大小和延迟时间
   - 启用压缩减少网络传输
   - 调整并发数和缓冲区大小

4. **监控和运维**
   - 集成监控指标收集
   - 设置告警规则
   - 定期备份重要数据

### 下节预告

下一节课我们将学习**Spring Kafka高级特性**，包括：
- 事务消息处理
- 错误处理和重试机制
- 死信队列配置
- 消息拦截器
- 自定义分区器
- 集群监控和管理

请提前准备：
1. 搭建多节点Kafka集群
2. 安装Kafka Manager或其他管理工具
3. 准备性能测试环境
4. 复习今天学习的基础知识

```java
/**
 * 订单事件消息
 */
package com.example.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

public class Order {
    
    @JsonProperty("order_id")
    private String orderId;
    
    @JsonProperty("user_id")
    private Long userId;
    
    @JsonProperty("total_amount")
    private BigDecimal totalAmount;
    
    @JsonProperty("status")
    private String status;
    
    @JsonProperty("items")
    private List<OrderItem> items;
    
    @JsonProperty("created_at")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;
    
    @JsonProperty("event_type")
    private String eventType;
    
    // 默认构造函数
    public Order() {
    }
    
    // 全参构造函数
    public Order(String orderId, Long userId, BigDecimal totalAmount, String status, 
                 List<OrderItem> items, LocalDateTime createdAt, String eventType) {
        this.orderId = orderId;
        this.userId = userId;
        this.totalAmount = totalAmount;
        this.status = status;
        this.items = items;
        this.createdAt = createdAt;
        this.eventType = eventType;
    }
    
    // Getters and Setters
    public String getOrderId() {
        return orderId;
    }
    
    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }
    
    public Long getUserId() {
        return userId;
    }
    
    public void setUserId(Long userId) {
        this.userId = userId;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public List<OrderItem> getItems() {
        return items;
    }
    
    public void setItems(List<OrderItem> items) {
        this.items = items;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public String getEventType() {
        return eventType;
    }
    
    public void setEventType(String eventType) {
        this.eventType = eventType;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Order order = (Order) o;
        return Objects.equals(orderId, order.orderId);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(orderId);
    }
    
    @Override
    public String toString() {
        return "Order{" +
                "orderId='" + orderId + '\'' +
                ", userId=" + userId +
                ", totalAmount=" + totalAmount +
                ", status='" + status + '\'' +
                ", items=" + items +
                ", createdAt=" + createdAt +
                ", eventType='" + eventType + '\'' +
                '}';
    }
    
    // 订单项内部类
    public static class OrderItem {
        @JsonProperty("product_id")
        private String productId;
        
        @JsonProperty("product_name")
        private String productName;
        
        @JsonProperty("quantity")
        private Integer quantity;
        
        @JsonProperty("price")
        private BigDecimal price;
        
        // 构造函数
        public OrderItem() {
        }
        
        public OrderItem(String productId, String productName, Integer quantity, BigDecimal price) {
            this.productId = productId;
            this.productName = productName;
            this.quantity = quantity;
            this.price = price;
        }
        
        // Getters and Setters
        public String getProductId() {
            return productId;
        }
        
        public void setProductId(String productId) {
            this.productId = productId;
        }
        
        public String getProductName() {
            return productName;
        }
        
        public void setProductName(String productName) {
            this.productName = productName;
        }
        
        public Integer getQuantity() {
            return quantity;
        }
        
        public void setQuantity(Integer quantity) {
            this.quantity = quantity;
        }
        
        public BigDecimal getPrice() {
            return price;
        }
        
        public void setPrice(BigDecimal price) {
            this.price = price;
        }
        
        @Override
        public String toString() {
            return "OrderItem{" +
                    "productId='" + productId + '\'' +
                    ", productName='" + productName + '\'' +
                    ", quantity=" + quantity +
                    ", price=" + price +
                    '}';
        }
    }
}
```

### 下午内容

#### 4. Spring Kafka生产者实现

##### 4.1 基础生产者服务

```java
/**
 * Kafka消息生产者服务
 */
package com.example.service;

import com.example.model.Order;
import com.example.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
public class KafkaProducerService {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaProducerService.class);
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Value("${app.kafka.topics.user-events}")
    private String userEventsTopic;
    
    @Value("${app.kafka.topics.order-events}")
    private String orderEventsTopic;
    
    @Value("${app.kafka.topics.notification-events}")
    private String notificationEventsTopic;
    
    /**
     * 发送用户事件消息
     */
    public void sendUserEvent(User user) {
        try {
            logger.info("Sending user event: {}", user);
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(userEventsTopic, user.getId().toString(), user);
            
            future.whenComplete((result, exception) -> {
                if (exception == null) {
                    logger.info("User event sent successfully: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                } else {
                    logger.error("Failed to send user event: {}", exception.getMessage(), exception);
                }
            });
            
        } catch (Exception e) {
            logger.error("Error sending user event: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send user event", e);
        }
    }
    
    /**
     * 发送订单事件消息
     */
    public void sendOrderEvent(Order order) {
        try {
            logger.info("Sending order event: {}", order);
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(orderEventsTopic, order.getOrderId(), order);
            
            future.whenComplete((result, exception) -> {
                if (exception == null) {
                    logger.info("Order event sent successfully: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                } else {
                    logger.error("Failed to send order event: {}", exception.getMessage(), exception);
                }
            });
            
        } catch (Exception e) {
            logger.error("Error sending order event: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send order event", e);
        }
    }
    
    /**
     * 发送通知消息
     */
    public void sendNotification(String userId, String message) {
        try {
            logger.info("Sending notification to user {}: {}", userId, message);
            
            String notificationMessage = String.format(
                "{\"userId\":\"%s\",\"message\":\"%s\",\"timestamp\":\"%s\"}",
                userId, message, System.currentTimeMillis());
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(notificationEventsTopic, userId, notificationMessage);
            
            future.whenComplete((result, exception) -> {
                if (exception == null) {
                    logger.info("Notification sent successfully: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                } else {
                    logger.error("Failed to send notification: {}", exception.getMessage(), exception);
                }
            });
            
        } catch (Exception e) {
            logger.error("Error sending notification: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send notification", e);
        }
    }
    
    /**
     * 同步发送消息（等待结果）
     */
    public SendResult<String, Object> sendMessageSync(String topic, String key, Object message) {
        try {
            logger.info("Sending message synchronously: topic={}, key={}, message={}", topic, key, message);
            
            SendResult<String, Object> result = kafkaTemplate.send(topic, key, message).get();
            
            logger.info("Message sent synchronously: topic={}, partition={}, offset={}",
                result.getRecordMetadata().topic(),
                result.getRecordMetadata().partition(),
                result.getRecordMetadata().offset());
            
            return result;
            
        } catch (Exception e) {
            logger.error("Error sending message synchronously: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send message synchronously", e);
        }
    }
    
    /**
     * 发送消息到指定分区
     */
    public void sendMessageToPartition(String topic, int partition, String key, Object message) {
        try {
            logger.info("Sending message to partition: topic={}, partition={}, key={}, message={}", 
                topic, partition, key, message);
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(topic, partition, key, message);
            
            future.whenComplete((result, exception) -> {
                if (exception == null) {
                    logger.info("Message sent to partition successfully: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                } else {
                    logger.error("Failed to send message to partition: {}", exception.getMessage(), exception);
                }
            });
            
        } catch (Exception e) {
            logger.error("Error sending message to partition: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send message to partition", e);
        }
    }
}
```

##### 4.2 高级生产者配置

```java
/**
 * Kafka生产者配置类
 */
package com.example.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.ProducerListener;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaProducerConfig {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaProducerConfig.class);
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    /**
     * 生产者工厂配置
     */
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 可靠性配置
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        configProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        // 性能配置
        configProps.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);
        configProps.put(ProducerConfig.LINGER_MS_CONFIG, 10);
        configProps.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432);
        configProps.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");
        
        // 超时配置
        configProps.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30000);
        configProps.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120000);
        
        // JSON序列化配置
        configProps.put(JsonSerializer.ADD_TYPE_INFO_HEADERS, false);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    /**
     * KafkaTemplate配置
     */
    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        KafkaTemplate<String, Object> template = new KafkaTemplate<>(producerFactory());
        
        // 设置生产者监听器
        template.setProducerListener(new ProducerListener<String, Object>() {
            @Override
            public void onSuccess(String topic, Integer partition, String key, Object value, 
                                org.apache.kafka.clients.producer.RecordMetadata recordMetadata) {
                logger.debug("Message sent successfully: topic={}, partition={}, offset={}, key={}",
                    topic, partition, recordMetadata.offset(), key);
            }
            
            @Override
            public void onError(String topic, Integer partition, String key, Object value, Exception exception) {
                logger.error("Failed to send message: topic={}, partition={}, key={}, error={}",
                    topic, partition, key, exception.getMessage());
            }
        });
        
        return template;
    }
    
    /**
     * 事务生产者工厂（可选）
     */
    @Bean
    public ProducerFactory<String, Object> transactionalProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 事务配置
        configProps.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "spring-kafka-tx-");
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        configProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        // 事务超时
        configProps.put(ProducerConfig.TRANSACTION_TIMEOUT_CONFIG, 60000);
        
        DefaultKafkaProducerFactory<String, Object> factory = new DefaultKafkaProducerFactory<>(configProps);
        factory.setTransactionIdPrefix("spring-kafka-tx-");
        
        return factory;
    }
    
    /**
     * 事务KafkaTemplate（可选）
     */
    @Bean
    public KafkaTemplate<String, Object> transactionalKafkaTemplate() {
        return new KafkaTemplate<>(transactionalProducerFactory());
    }
}
```

#### 5. Spring Kafka消费者实现

##### 5.1 基础消费者服务

```java
/**
 * Kafka消息消费者服务
 */
package com.example.service;

import com.example.model.Order;
import com.example.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

@Service
public class KafkaConsumerService {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaConsumerService.class);
    
    /**
     * 消费用户事件消息
     */
    @KafkaListener(topics = "${app.kafka.topics.user-events}", groupId = "user-event-group")
    public void consumeUserEvent(@Payload User user,
                                @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
                                @Header(KafkaHeaders.OFFSET) long offset,
                                Acknowledgment acknowledgment) {
        try {
            logger.info("Received user event: topic={}, partition={}, offset={}, user={}",
                topic, partition, offset, user);
            
            // 处理用户事件业务逻辑
            processUserEvent(user);
            
            // 手动确认消息
            acknowledgment.acknowledge();
            
            logger.info("User event processed successfully: {}", user.getId());
            
        } catch (Exception e) {
            logger.error("Error processing user event: {}", e.getMessage(), e);
            // 可以选择不确认消息，让其重试
            // 或者发送到死信队列
        }
    }
    
    /**
     * 消费订单事件消息
     */
    @KafkaListener(topics = "${app.kafka.topics.order-events}", groupId = "order-event-group")
    public void consumeOrderEvent(@Payload Order order,
                                 @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                 @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
                                 @Header(KafkaHeaders.OFFSET) long offset,
                                 Acknowledgment acknowledgment) {
        try {
            logger.info("Received order event: topic={}, partition={}, offset={}, order={}",
                topic, partition, offset, order);
            
            // 处理订单事件业务逻辑
            processOrderEvent(order);
            
            // 手动确认消息
            acknowledgment.acknowledge();
            
            logger.info("Order event processed successfully: {}", order.getOrderId());
            
        } catch (Exception e) {
            logger.error("Error processing order event: {}", e.getMessage(), e);
        }
    }
    
    /**
     * 消费通知消息
     */
    @KafkaListener(topics = "${app.kafka.topics.notification-events}", groupId = "notification-group")
    public void consumeNotification(@Payload String notification,
                                   @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                   @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
                                   @Header(KafkaHeaders.OFFSET) long offset,
                                   @Header(KafkaHeaders.RECEIVED_MESSAGE_KEY) String key) {
        try {
            logger.info("Received notification: topic={}, partition={}, offset={}, key={}, notification={}",
                topic, partition, offset, key, notification);
            
            // 处理通知业务逻辑
            processNotification(key, notification);
            
            logger.info("Notification processed successfully for user: {}", key);
            
        } catch (Exception e) {
            logger.error("Error processing notification: {}", e.getMessage(), e);
        }
    }
    
    /**
     * 批量消费消息
     */
    @KafkaListener(topics = "user-events", groupId = "batch-user-event-group", 
                   containerFactory = "batchKafkaListenerContainerFactory")
    public void consumeUserEventsBatch(List<User> users,
                                      List<String> topics,
                                      List<Integer> partitions,
                                      List<Long> offsets) {
        try {
            logger.info("Received batch of {} user events", users.size());
            
            for (int i = 0; i < users.size(); i++) {
                User user = users.get(i);
                String topic = topics.get(i);
                Integer partition = partitions.get(i);
                Long offset = offsets.get(i);
                
                logger.debug("Processing user event: topic={}, partition={}, offset={}, user={}",
                    topic, partition, offset, user);
                
                processUserEvent(user);
            }
            
            logger.info("Batch of user events processed successfully");
            
        } catch (Exception e) {
            logger.error("Error processing batch of user events: {}", e.getMessage(), e);
        }
    }
    
    /**
     * 处理用户事件业务逻辑
     */
    private void processUserEvent(User user) {
        // 模拟业务处理
        switch (user.getEventType()) {
            case "USER_CREATED":
                logger.info("Processing user creation: {}", user.getUsername());
                // 发送欢迎邮件、初始化用户配置等
                break;
            case "USER_UPDATED":
                logger.info("Processing user update: {}", user.getUsername());
                // 更新缓存、同步数据等
                break;
            case "USER_DELETED":
                logger.info("Processing user deletion: {}", user.getUsername());
                // 清理用户数据、注销相关服务等
                break;
            default:
                logger.warn("Unknown user event type: {}", user.getEventType());
        }
        
        // 模拟处理时间
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    
    /**
     * 处理订单事件业务逻辑
     */
    private void processOrderEvent(Order order) {
        // 模拟业务处理
        switch (order.getEventType()) {
            case "ORDER_CREATED":
                logger.info("Processing order creation: {}", order.getOrderId());
                // 库存扣减、支付处理等
                break;
            case "ORDER_PAID":
                logger.info("Processing order payment: {}", order.getOrderId());
                // 发货准备、通知商家等
                break;
            case "ORDER_SHIPPED":
                logger.info("Processing order shipment: {}", order.getOrderId());
                // 物流跟踪、用户通知等
                break;
            case "ORDER_DELIVERED":
                logger.info("Processing order delivery: {}", order.getOrderId());
                // 确认收货、评价提醒等
                break;
            case "ORDER_CANCELLED":
                logger.info("Processing order cancellation: {}", order.getOrderId());
                // 退款处理、库存恢复等
                break;
            default:
                logger.warn("Unknown order event type: {}", order.getEventType());
        }
        
        // 模拟处理时间
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    
    /**
     * 处理通知业务逻辑
     */
    private void processNotification(String userId, String notification) {
        logger.info("Sending notification to user {}: {}", userId, notification);
        
        // 模拟发送通知（邮件、短信、推送等）
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```