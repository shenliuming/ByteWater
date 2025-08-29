# 第20天：Kafka安全机制

## 课程目标
- 掌握Kafka安全架构和认证机制
- 学会配置SSL/TLS加密通信
- 理解SASL认证的各种方式
- 掌握ACL权限控制的配置和管理
- 实现企业级Kafka安全解决方案

## 1. Kafka安全架构概述

### 1.1 安全威胁分析

Kafka在企业环境中面临的主要安全威胁：

1. **网络窃听**：未加密的网络通信可能被截获
2. **身份伪造**：恶意客户端冒充合法用户
3. **权限滥用**：用户访问超出权限范围的资源
4. **数据篡改**：传输过程中数据被恶意修改
5. **拒绝服务**：恶意请求导致服务不可用

### 1.2 安全机制框架

```java
@Component
public class KafkaSecurityFramework {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaSecurityFramework.class);
    
    /**
     * Kafka安全层次结构
     */
    public enum SecurityLayer {
        TRANSPORT_LAYER,    // 传输层安全（SSL/TLS）
        AUTHENTICATION,     // 身份认证（SASL）
        AUTHORIZATION,      // 权限控制（ACL）
        AUDIT              // 审计日志
    }
    
    /**
     * 安全配置管理器
     */
    @Service
    public static class SecurityConfigManager {
        
        private final Map<String, Object> securityConfigs = new HashMap<>();
        
        public void configureSSL(SSLConfig sslConfig) {
            securityConfigs.put("security.protocol", "SSL");
            securityConfigs.put("ssl.truststore.location", sslConfig.getTruststoreLocation());
            securityConfigs.put("ssl.truststore.password", sslConfig.getTruststorePassword());
            securityConfigs.put("ssl.keystore.location", sslConfig.getKeystoreLocation());
            securityConfigs.put("ssl.keystore.password", sslConfig.getKeystorePassword());
            securityConfigs.put("ssl.key.password", sslConfig.getKeyPassword());
            
            log.info("SSL configuration applied");
        }
        
        public void configureSASL(SASLConfig saslConfig) {
            securityConfigs.put("security.protocol", "SASL_SSL");
            securityConfigs.put("sasl.mechanism", saslConfig.getMechanism());
            securityConfigs.put("sasl.jaas.config", saslConfig.getJaasConfig());
            
            log.info("SASL configuration applied: {}", saslConfig.getMechanism());
        }
        
        public void configureACL(ACLConfig aclConfig) {
            securityConfigs.put("authorizer.class.name", "kafka.security.authorizer.AclAuthorizer");
            securityConfigs.put("super.users", String.join(";", aclConfig.getSuperUsers()));
            securityConfigs.put("allow.everyone.if.no.acl.found", aclConfig.isAllowEveryoneIfNoAcl());
            
            log.info("ACL configuration applied");
        }
        
        public Map<String, Object> getSecurityConfigs() {
            return new HashMap<>(securityConfigs);
        }
    }
    
    /**
     * SSL配置类
     */
    @Data
    @Builder
    public static class SSLConfig {
        private String truststoreLocation;
        private String truststorePassword;
        private String keystoreLocation;
        private String keystorePassword;
        private String keyPassword;
        private String sslProtocol = "TLSv1.2";
        private String sslEnabledProtocols = "TLSv1.2,TLSv1.3";
        private String sslCipherSuites;
        private String sslEndpointIdentificationAlgorithm = "https";
    }
    
    /**
     * SASL配置类
     */
    @Data
    @Builder
    public static class SASLConfig {
        private String mechanism; // PLAIN, SCRAM-SHA-256, SCRAM-SHA-512, GSSAPI
        private String jaasConfig;
        private String serviceName = "kafka";
        private String realm;
    }
    
    /**
     * ACL配置类
     */
    @Data
    @Builder
    public static class ACLConfig {
        private List<String> superUsers;
        private boolean allowEveryoneIfNoAcl = false;
        private String authorizerClassName = "kafka.security.authorizer.AclAuthorizer";
    }
}
```

## 2. SSL/TLS加密通信

### 2.1 SSL证书管理

```java
@Service
public class KafkaSSLCertificateManager {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaSSLCertificateManager.class);
    
    /**
     * 生成自签名证书（开发环境使用）
     */
    public void generateSelfSignedCertificate(String keystorePath, String password, String alias) {
        try {
            // 生成密钥对
            KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
            keyPairGenerator.initialize(2048);
            KeyPair keyPair = keyPairGenerator.generateKeyPair();
            
            // 创建自签名证书
            X509Certificate certificate = createSelfSignedCertificate(keyPair, alias);
            
            // 保存到KeyStore
            KeyStore keyStore = KeyStore.getInstance("JKS");
            keyStore.load(null, null);
            keyStore.setKeyEntry(alias, keyPair.getPrivate(), password.toCharArray(), 
                new Certificate[]{certificate});
            
            // 写入文件
            try (FileOutputStream fos = new FileOutputStream(keystorePath)) {
                keyStore.store(fos, password.toCharArray());
            }
            
            log.info("Self-signed certificate generated: {}", keystorePath);
            
        } catch (Exception e) {
            log.error("Failed to generate self-signed certificate", e);
            throw new RuntimeException("Certificate generation failed", e);
        }
    }
    
    /**
     * 创建自签名证书
     */
    private X509Certificate createSelfSignedCertificate(KeyPair keyPair, String commonName) 
            throws Exception {
        
        X500Name issuer = new X500Name("CN=" + commonName + ", O=Kafka, C=US");
        BigInteger serial = BigInteger.valueOf(System.currentTimeMillis());
        Date notBefore = new Date();
        Date notAfter = new Date(System.currentTimeMillis() + 365L * 24 * 60 * 60 * 1000); // 1年
        
        X509v3CertificateGenerator certGen = new X509v3CertificateGenerator();
        certGen.setSerialNumber(serial);
        certGen.setIssuerDN(issuer);
        certGen.setSubjectDN(issuer);
        certGen.setNotBefore(notBefore);
        certGen.setNotAfter(notAfter);
        certGen.setPublicKey(keyPair.getPublic());
        certGen.setSignatureAlgorithm("SHA256WithRSAEncryption");
        
        // 添加扩展
        certGen.addExtension(X509Extensions.BasicConstraints, true, new BasicConstraints(false));
        certGen.addExtension(X509Extensions.KeyUsage, true, 
            new KeyUsage(KeyUsage.digitalSignature | KeyUsage.keyEncipherment));
        
        return certGen.generateX509Certificate(keyPair.getPrivate());
    }
    
    /**
     * 验证证书有效性
     */
    public boolean validateCertificate(String keystorePath, String password, String alias) {
        try {
            KeyStore keyStore = KeyStore.getInstance("JKS");
            try (FileInputStream fis = new FileInputStream(keystorePath)) {
                keyStore.load(fis, password.toCharArray());
            }
            
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate instanceof X509Certificate) {
                X509Certificate x509Cert = (X509Certificate) certificate;
                
                // 检查证书是否过期
                x509Cert.checkValidity();
                
                // 验证证书链
                x509Cert.verify(x509Cert.getPublicKey());
                
                log.info("Certificate validation successful: {}", alias);
                return true;
            }
            
        } catch (Exception e) {
            log.error("Certificate validation failed: {}", alias, e);
        }
        
        return false;
    }
    
    /**
     * 获取证书信息
     */
    public CertificateInfo getCertificateInfo(String keystorePath, String password, String alias) {
        try {
            KeyStore keyStore = KeyStore.getInstance("JKS");
            try (FileInputStream fis = new FileInputStream(keystorePath)) {
                keyStore.load(fis, password.toCharArray());
            }
            
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate instanceof X509Certificate) {
                X509Certificate x509Cert = (X509Certificate) certificate;
                
                return CertificateInfo.builder()
                    .alias(alias)
                    .subject(x509Cert.getSubjectDN().toString())
                    .issuer(x509Cert.getIssuerDN().toString())
                    .serialNumber(x509Cert.getSerialNumber().toString())
                    .notBefore(x509Cert.getNotBefore())
                    .notAfter(x509Cert.getNotAfter())
                    .algorithm(x509Cert.getSigAlgName())
                    .build();
            }
            
        } catch (Exception e) {
            log.error("Failed to get certificate info: {}", alias, e);
        }
        
        return null;
    }
    
    @Data
    @Builder
    public static class CertificateInfo {
        private String alias;
        private String subject;
        private String issuer;
        private String serialNumber;
        private Date notBefore;
        private Date notAfter;
        private String algorithm;
        
        public boolean isExpired() {
            return new Date().after(notAfter);
        }
        
        public long getDaysUntilExpiry() {
            long diff = notAfter.getTime() - System.currentTimeMillis();
            return diff / (24 * 60 * 60 * 1000);
        }
    }
}
```

### 2.2 SSL配置和连接

```java
@Configuration
public class KafkaSSLConfiguration {
    
    @Value("${kafka.ssl.truststore.location}")
    private String truststoreLocation;
    
    @Value("${kafka.ssl.truststore.password}")
    private String truststorePassword;
    
    @Value("${kafka.ssl.keystore.location}")
    private String keystoreLocation;
    
    @Value("${kafka.ssl.keystore.password}")
    private String keystorePassword;
    
    @Value("${kafka.ssl.key.password}")
    private String keyPassword;
    
    /**
     * SSL Producer配置
     */
    @Bean
    public ProducerFactory<String, Object> sslProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9093");
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // SSL配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SSL");
        configProps.put(SslConfigs.SSL_TRUSTSTORE_LOCATION_CONFIG, truststoreLocation);
        configProps.put(SslConfigs.SSL_TRUSTSTORE_PASSWORD_CONFIG, truststorePassword);
        configProps.put(SslConfigs.SSL_KEYSTORE_LOCATION_CONFIG, keystoreLocation);
        configProps.put(SslConfigs.SSL_KEYSTORE_PASSWORD_CONFIG, keystorePassword);
        configProps.put(SslConfigs.SSL_KEY_PASSWORD_CONFIG, keyPassword);
        
        // SSL协议配置
        configProps.put(SslConfigs.SSL_PROTOCOL_CONFIG, "TLSv1.2");
        configProps.put(SslConfigs.SSL_ENABLED_PROTOCOLS_CONFIG, "TLSv1.2,TLSv1.3");
        configProps.put(SslConfigs.SSL_ENDPOINT_IDENTIFICATION_ALGORITHM_CONFIG, "https");
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    /**
     * SSL Consumer配置
     */
    @Bean
    public ConsumerFactory<String, Object> sslConsumerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9093");
        configProps.put(ConsumerConfig.GROUP_ID_CONFIG, "ssl-consumer-group");
        configProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        configProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        configProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        
        // SSL配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SSL");
        configProps.put(SslConfigs.SSL_TRUSTSTORE_LOCATION_CONFIG, truststoreLocation);
        configProps.put(SslConfigs.SSL_TRUSTSTORE_PASSWORD_CONFIG, truststorePassword);
        configProps.put(SslConfigs.SSL_KEYSTORE_LOCATION_CONFIG, keystoreLocation);
        configProps.put(SslConfigs.SSL_KEYSTORE_PASSWORD_CONFIG, keystorePassword);
        configProps.put(SslConfigs.SSL_KEY_PASSWORD_CONFIG, keyPassword);
        
        // SSL协议配置
        configProps.put(SslConfigs.SSL_PROTOCOL_CONFIG, "TLSv1.2");
        configProps.put(SslConfigs.SSL_ENABLED_PROTOCOLS_CONFIG, "TLSv1.2,TLSv1.3");
        configProps.put(SslConfigs.SSL_ENDPOINT_IDENTIFICATION_ALGORITHM_CONFIG, "https");
        
        return new DefaultKafkaConsumerFactory<>(configProps);
    }
    
    /**
     * SSL KafkaTemplate
     */
    @Bean
    public KafkaTemplate<String, Object> sslKafkaTemplate() {
        return new KafkaTemplate<>(sslProducerFactory());
    }
    
    /**
     * SSL连接测试服务
     */
    @Service
    public static class SSLConnectionTestService {
        
        private final KafkaTemplate<String, Object> kafkaTemplate;
        private final AdminClient adminClient;
        
        public SSLConnectionTestService(KafkaTemplate<String, Object> kafkaTemplate) {
            this.kafkaTemplate = kafkaTemplate;
            this.adminClient = createSSLAdminClient();
        }
        
        /**
         * 测试SSL连接
         */
        public boolean testSSLConnection() {
            try {
                // 测试Admin Client连接
                DescribeClusterResult clusterResult = adminClient.describeCluster();
                String clusterId = clusterResult.clusterId().get(10, TimeUnit.SECONDS);
                
                log.info("SSL connection test successful. Cluster ID: {}", clusterId);
                return true;
                
            } catch (Exception e) {
                log.error("SSL connection test failed", e);
                return false;
            }
        }
        
        /**
         * 测试SSL消息发送
         */
        public boolean testSSLMessageSend(String topic, String message) {
            try {
                ListenableFuture<SendResult<String, Object>> future = 
                    kafkaTemplate.send(topic, "ssl-test-key", message);
                
                SendResult<String, Object> result = future.get(10, TimeUnit.SECONDS);
                log.info("SSL message send test successful. Offset: {}", 
                    result.getRecordMetadata().offset());
                return true;
                
            } catch (Exception e) {
                log.error("SSL message send test failed", e);
                return false;
            }
        }
        
        private AdminClient createSSLAdminClient() {
            Map<String, Object> configs = new HashMap<>();
            configs.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9093");
            configs.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SSL");
            configs.put(SslConfigs.SSL_TRUSTSTORE_LOCATION_CONFIG, truststoreLocation);
            configs.put(SslConfigs.SSL_TRUSTSTORE_PASSWORD_CONFIG, truststorePassword);
            configs.put(SslConfigs.SSL_KEYSTORE_LOCATION_CONFIG, keystoreLocation);
            configs.put(SslConfigs.SSL_KEYSTORE_PASSWORD_CONFIG, keystorePassword);
            configs.put(SslConfigs.SSL_KEY_PASSWORD_CONFIG, keyPassword);
            
            return AdminClient.create(configs);
        }
    }
}
```

## 3. SASL认证机制

### 3.1 SASL/PLAIN认证

```java
@Configuration
public class KafkaSASLPlainConfiguration {
    
    /**
     * SASL/PLAIN Producer配置
     */
    @Bean
    public ProducerFactory<String, Object> saslPlainProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // SASL配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "PLAIN");
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, 
            "org.apache.kafka.common.security.plain.PlainLoginModule required " +
            "username=\"kafka-user\" " +
            "password=\"kafka-password\";");
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    /**
     * SASL/PLAIN Consumer配置
     */
    @Bean
    public ConsumerFactory<String, Object> saslPlainConsumerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        configProps.put(ConsumerConfig.GROUP_ID_CONFIG, "sasl-plain-consumer-group");
        configProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        configProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        configProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        
        // SASL配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "PLAIN");
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, 
            "org.apache.kafka.common.security.plain.PlainLoginModule required " +
            "username=\"kafka-user\" " +
            "password=\"kafka-password\";");
        
        return new DefaultKafkaConsumerFactory<>(configProps);
    }
}
```

### 3.2 SASL/SCRAM认证

```java
@Service
public class KafkaSASLScramService {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaSASLScramService.class);
    
    private final AdminClient adminClient;
    
    public KafkaSASLScramService() {
        this.adminClient = createScramAdminClient();
    }
    
    /**
     * 创建SCRAM用户
     */
    public void createScramUser(String username, String password, ScramMechanism mechanism) {
        try {
            UserScramCredentialUpsertion upsertion = new UserScramCredentialUpsertion(
                username, 
                new ScramCredentialInfo(mechanism, 4096) // 4096 iterations
            );
            
            AlterUserScramCredentialsOptions options = new AlterUserScramCredentialsOptions()
                .timeoutMs(30000);
            
            AlterUserScramCredentialsResult result = adminClient
                .alterUserScramCredentials(
                    Collections.singletonList(upsertion), 
                    options
                );
            
            result.all().get(30, TimeUnit.SECONDS);
            log.info("SCRAM user created successfully: {} with mechanism: {}", username, mechanism);
            
        } catch (Exception e) {
            log.error("Failed to create SCRAM user: {}", username, e);
            throw new RuntimeException("SCRAM user creation failed", e);
        }
    }
    
    /**
     * 删除SCRAM用户
     */
    public void deleteScramUser(String username, ScramMechanism mechanism) {
        try {
            UserScramCredentialDeletion deletion = new UserScramCredentialDeletion(
                username, mechanism
            );
            
            AlterUserScramCredentialsResult result = adminClient
                .alterUserScramCredentials(
                    Collections.singletonList(deletion)
                );
            
            result.all().get(30, TimeUnit.SECONDS);
            log.info("SCRAM user deleted successfully: {} with mechanism: {}", username, mechanism);
            
        } catch (Exception e) {
            log.error("Failed to delete SCRAM user: {}", username, e);
            throw new RuntimeException("SCRAM user deletion failed", e);
        }
    }
    
    /**
     * 列出SCRAM用户
     */
    public Map<String, UserScramCredentialsDescription> listScramUsers() {
        try {
            DescribeUserScramCredentialsResult result = adminClient.describeUserScramCredentials();
            return result.all().get(30, TimeUnit.SECONDS);
            
        } catch (Exception e) {
            log.error("Failed to list SCRAM users", e);
            throw new RuntimeException("SCRAM user listing failed", e);
        }
    }
    
    /**
     * SCRAM-SHA-256配置
     */
    public Map<String, Object> getScramSha256Config(String username, String password) {
        Map<String, Object> configProps = new HashMap<>();
        
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "SCRAM-SHA-256");
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, 
            "org.apache.kafka.common.security.scram.ScramLoginModule required " +
            "username=\"" + username + "\" " +
            "password=\"" + password + "\";");
        
        return configProps;
    }
    
    /**
     * SCRAM-SHA-512配置
     */
    public Map<String, Object> getScramSha512Config(String username, String password) {
        Map<String, Object> configProps = new HashMap<>();
        
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "SCRAM-SHA-512");
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, 
            "org.apache.kafka.common.security.scram.ScramLoginModule required " +
            "username=\"" + username + "\" " +
            "password=\"" + password + "\";");
        
        return configProps;
    }
    
    private AdminClient createScramAdminClient() {
        Map<String, Object> configs = new HashMap<>();
        configs.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        configs.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configs.put(SaslConfigs.SASL_MECHANISM, "SCRAM-SHA-256");
        configs.put(SaslConfigs.SASL_JAAS_CONFIG, 
            "org.apache.kafka.common.security.scram.ScramLoginModule required " +
            "username=\"admin\" " +
            "password=\"admin-password\";");
        
        return AdminClient.create(configs);
    }
}
```

### 3.3 SASL/GSSAPI (Kerberos)认证

```java
@Configuration
public class KafkaSASLKerberosConfiguration {
    
    @Value("${kafka.kerberos.service-name:kafka}")
    private String serviceName;
    
    @Value("${kafka.kerberos.realm}")
    private String realm;
    
    @Value("${kafka.kerberos.keytab.location}")
    private String keytabLocation;
    
    @Value("${kafka.kerberos.principal}")
    private String principal;
    
    /**
     * Kerberos Producer配置
     */
    @Bean
    public ProducerFactory<String, Object> kerberosProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // Kerberos配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "GSSAPI");
        configProps.put(SaslConfigs.SASL_KERBEROS_SERVICE_NAME, serviceName);
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, buildKerberosJaasConfig());
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    /**
     * Kerberos Consumer配置
     */
    @Bean
    public ConsumerFactory<String, Object> kerberosConsumerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        
        // 基础配置
        configProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        configProps.put(ConsumerConfig.GROUP_ID_CONFIG, "kerberos-consumer-group");
        configProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        configProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        configProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        
        // Kerberos配置
        configProps.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        configProps.put(SaslConfigs.SASL_MECHANISM, "GSSAPI");
        configProps.put(SaslConfigs.SASL_KERBEROS_SERVICE_NAME, serviceName);
        configProps.put(SaslConfigs.SASL_JAAS_CONFIG, buildKerberosJaasConfig());
        
        return new DefaultKafkaConsumerFactory<>(configProps);
    }
    
    /**
     * 构建Kerberos JAAS配置
     */
    private String buildKerberosJaasConfig() {
        return String.format(
            "com.sun.security.auth.module.Krb5LoginModule required " +
            "useKeyTab=true " +
            "storeKey=true " +
            "keyTab=\"%s\" " +
            "principal=\"%s\";",
            keytabLocation, principal
        );
    }
    
    /**
     * Kerberos认证服务
     */
    @Service
    public static class KerberosAuthenticationService {
        
        private static final Logger log = LoggerFactory.getLogger(KerberosAuthenticationService.class);
        
        /**
         * 验证Kerberos票据
         */
        public boolean validateKerberosTicket(String principal) {
            try {
                Subject subject = Subject.getSubject(AccessController.getContext());
                if (subject == null) {
                    log.warn("No subject found for Kerberos authentication");
                    return false;
                }
                
                Set<KerberosPrincipal> principals = subject.getPrincipals(KerberosPrincipal.class);
                for (KerberosPrincipal kerberosPrincipal : principals) {
                    if (kerberosPrincipal.getName().equals(principal)) {
                        log.info("Kerberos ticket validated for principal: {}", principal);
                        return true;
                    }
                }
                
                log.warn("No matching Kerberos principal found: {}", principal);
                return false;
                
            } catch (Exception e) {
                log.error("Failed to validate Kerberos ticket for principal: {}", principal, e);
                return false;
            }
        }
        
        /**
         * 刷新Kerberos票据
         */
        public void refreshKerberosTicket(String keytabPath, String principal) {
            try {
                System.setProperty("java.security.krb5.conf", "/etc/krb5.conf");
                System.setProperty("sun.security.krb5.debug", "true");
                
                LoginContext loginContext = new LoginContext("KafkaClient");
                loginContext.login();
                
                log.info("Kerberos ticket refreshed for principal: {}", principal);
                
            } catch (Exception e) {
                log.error("Failed to refresh Kerberos ticket for principal: {}", principal, e);
                throw new RuntimeException("Kerberos ticket refresh failed", e);
            }
        }
    }
}
```

## 4. ACL权限控制

### 4.1 ACL管理服务

```java
@Service
public class KafkaACLManagementService {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaACLManagementService.class);
    
    private final AdminClient adminClient;
    
    public KafkaACLManagementService(AdminClient adminClient) {
        this.adminClient = adminClient;
    }
    
    /**
     * 创建ACL规则
     */
    public void createACL(ACLRule aclRule) {
        try {
            AclBinding aclBinding = buildAclBinding(aclRule);
            
            CreateAclsResult result = adminClient.createAcls(
                Collections.singletonList(aclBinding)
            );
            
            result.all().get(30, TimeUnit.SECONDS);
            log.info("ACL rule created successfully: {}", aclRule);
            
        } catch (Exception e) {
            log.error("Failed to create ACL rule: {}", aclRule, e);
            throw new RuntimeException("ACL creation failed", e);
        }
    }
    
    /**
     * 删除ACL规则
     */
    public void deleteACL(ACLRule aclRule) {
        try {
            AclBindingFilter filter = buildAclBindingFilter(aclRule);
            
            DeleteAclsResult result = adminClient.deleteAcls(
                Collections.singletonList(filter)
            );
            
            result.all().get(30, TimeUnit.SECONDS);
            log.info("ACL rule deleted successfully: {}", aclRule);
            
        } catch (Exception e) {
            log.error("Failed to delete ACL rule: {}", aclRule, e);
            throw new RuntimeException("ACL deletion failed", e);
        }
    }
    
    /**
     * 列出ACL规则
     */
    public Collection<AclBinding> listACLs(ACLFilter filter) {
        try {
            AclBindingFilter aclFilter = buildAclBindingFilter(filter);
            
            DescribeAclsResult result = adminClient.describeAcls(aclFilter);
            return result.values().get(30, TimeUnit.SECONDS);
            
        } catch (Exception e) {
            log.error("Failed to list ACL rules", e);
            throw new RuntimeException("ACL listing failed", e);
        }
    }
    
    /**
     * 批量创建ACL规则
     */
    public void createACLsBatch(List<ACLRule> aclRules) {
        try {
            List<AclBinding> aclBindings = aclRules.stream()
                .map(this::buildAclBinding)
                .collect(Collectors.toList());
            
            CreateAclsResult result = adminClient.createAcls(aclBindings);
            result.all().get(60, TimeUnit.SECONDS);
            
            log.info("Batch ACL rules created successfully. Count: {}", aclRules.size());
            
        } catch (Exception e) {
            log.error("Failed to create batch ACL rules", e);
            throw new RuntimeException("Batch ACL creation failed", e);
        }
    }
    
    /**
     * 验证用户权限
     */
    public boolean checkPermission(String principal, String resourceType, 
                                 String resourceName, String operation) {
        try {
            ACLFilter filter = ACLFilter.builder()
                .principal(principal)
                .resourceType(ResourceType.valueOf(resourceType.toUpperCase()))
                .resourceName(resourceName)
                .operation(AclOperation.valueOf(operation.toUpperCase()))
                .build();
            
            Collection<AclBinding> acls = listACLs(filter);
            
            // 检查是否有匹配的ALLOW规则
            boolean hasAllow = acls.stream()
                .anyMatch(acl -> acl.entry().permissionType() == AclPermissionType.ALLOW);
            
            // 检查是否有匹配的DENY规则
            boolean hasDeny = acls.stream()
                .anyMatch(acl -> acl.entry().permissionType() == AclPermissionType.DENY);
            
            // DENY优先于ALLOW
            if (hasDeny) {
                log.debug("Permission denied for principal: {} on resource: {}", principal, resourceName);
                return false;
            }
            
            if (hasAllow) {
                log.debug("Permission granted for principal: {} on resource: {}", principal, resourceName);
                return true;
            }
            
            log.debug("No explicit permission found for principal: {} on resource: {}", principal, resourceName);
            return false;
            
        } catch (Exception e) {
            log.error("Failed to check permission for principal: {}", principal, e);
            return false;
        }
    }
    
    private AclBinding buildAclBinding(ACLRule rule) {
        ResourcePattern resourcePattern = new ResourcePattern(
            rule.getResourceType(),
            rule.getResourceName(),
            rule.getPatternType()
        );
        
        AccessControlEntry entry = new AccessControlEntry(
            rule.getPrincipal(),
            rule.getHost(),
            rule.getOperation(),
            rule.getPermissionType()
        );
        
        return new AclBinding(resourcePattern, entry);
    }
    
    private AclBindingFilter buildAclBindingFilter(ACLRule rule) {
        ResourcePatternFilter resourceFilter = new ResourcePatternFilter(
            rule.getResourceType(),
            rule.getResourceName(),
            rule.getPatternType()
        );
        
        AccessControlEntryFilter entryFilter = new AccessControlEntryFilter(
            rule.getPrincipal(),
            rule.getHost(),
            rule.getOperation(),
            rule.getPermissionType()
        );
        
        return new AclBindingFilter(resourceFilter, entryFilter);
    }
    
    private AclBindingFilter buildAclBindingFilter(ACLFilter filter) {
        ResourcePatternFilter resourceFilter = new ResourcePatternFilter(
            filter.getResourceType(),
            filter.getResourceName(),
            filter.getPatternType()
        );
        
        AccessControlEntryFilter entryFilter = new AccessControlEntryFilter(
            filter.getPrincipal(),
            filter.getHost(),
            filter.getOperation(),
            filter.getPermissionType()
        );
        
        return new AclBindingFilter(resourceFilter, entryFilter);
    }
    
    /**
     * ACL规则实体类
     */
    @Data
    @Builder
    public static class ACLRule {
        private String principal;           // 用户主体
        private String host;               // 主机地址
        private ResourceType resourceType; // 资源类型
        private String resourceName;       // 资源名称
        private PatternType patternType;   // 模式类型
        private AclOperation operation;    // 操作类型
        private AclPermissionType permissionType; // 权限类型
    }
    
    /**
     * ACL过滤器
     */
    @Data
    @Builder
    public static class ACLFilter {
        private String principal;
        private String host;
        private ResourceType resourceType;
        private String resourceName;
        private PatternType patternType;
        private AclOperation operation;
        private AclPermissionType permissionType;
    }
}
```

### 4.2 权限模板管理

```java
@Service
public class KafkaPermissionTemplateService {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaPermissionTemplateService.class);
    
    private final KafkaACLManagementService aclService;
    
    public KafkaPermissionTemplateService(KafkaACLManagementService aclService) {
        this.aclService = aclService;
    }
    
    /**
     * 创建生产者权限模板
     */
    public void createProducerTemplate(String principal, String topicPrefix) {
        List<KafkaACLManagementService.ACLRule> rules = Arrays.asList(
            // Topic写权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.WRITE)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // Topic描述权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.DESCRIBE)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // Cluster连接权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.CLUSTER)
                .resourceName("kafka-cluster")
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.CREATE)
                .permissionType(AclPermissionType.ALLOW)
                .build()
        );
        
        aclService.createACLsBatch(rules);
        log.info("Producer template created for principal: {} with topic prefix: {}", principal, topicPrefix);
    }
    
    /**
     * 创建消费者权限模板
     */
    public void createConsumerTemplate(String principal, String topicPrefix, String consumerGroup) {
        List<KafkaACLManagementService.ACLRule> rules = Arrays.asList(
            // Topic读权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.READ)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // Topic描述权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.DESCRIBE)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // Consumer Group权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.GROUP)
                .resourceName(consumerGroup)
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.READ)
                .permissionType(AclPermissionType.ALLOW)
                .build()
        );
        
        aclService.createACLsBatch(rules);
        log.info("Consumer template created for principal: {} with topic prefix: {} and group: {}", 
            principal, topicPrefix, consumerGroup);
    }
    
    /**
     * 创建管理员权限模板
     */
    public void createAdminTemplate(String principal) {
        List<KafkaACLManagementService.ACLRule> rules = Arrays.asList(
            // 所有Topic的所有权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName("*")
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.ALL)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // 所有Consumer Group的所有权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.GROUP)
                .resourceName("*")
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.ALL)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // 集群管理权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.CLUSTER)
                .resourceName("kafka-cluster")
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.ALL)
                .permissionType(AclPermissionType.ALLOW)
                .build()
        );
        
        aclService.createACLsBatch(rules);
        log.info("Admin template created for principal: {}", principal);
    }
    
    /**
     * 创建只读权限模板
     */
    public void createReadOnlyTemplate(String principal, String topicPrefix) {
        List<KafkaACLManagementService.ACLRule> rules = Arrays.asList(
            // Topic描述权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.DESCRIBE)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // 集群描述权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.CLUSTER)
                .resourceName("kafka-cluster")
                .patternType(PatternType.LITERAL)
                .operation(AclOperation.DESCRIBE)
                .permissionType(AclPermissionType.ALLOW)
                .build()
        );
        
        aclService.createACLsBatch(rules);
        log.info("Read-only template created for principal: {} with topic prefix: {}", principal, topicPrefix);
    }
    
    /**
     * 权限模板枚举
     */
    public enum PermissionTemplate {
        PRODUCER("生产者权限模板"),
        CONSUMER("消费者权限模板"),
        ADMIN("管理员权限模板"),
        READ_ONLY("只读权限模板"),
        CUSTOM("自定义权限模板");
        
        private final String description;
        
        PermissionTemplate(String description) {
            this.description = description;
        }
        
        public String getDescription() {
            return description;
        }
    }
}
```

## 5. 企业级安全解决方案实战案例

### 5.1 多租户安全架构

```java
@Service
public class KafkaMultiTenantSecurityService {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaMultiTenantSecurityService.class);
    
    private final KafkaACLManagementService aclService;
    private final KafkaSASLScramService scramService;
    private final KafkaPermissionTemplateService templateService;
    
    public KafkaMultiTenantSecurityService(KafkaACLManagementService aclService,
                                         KafkaSASLScramService scramService,
                                         KafkaPermissionTemplateService templateService) {
        this.aclService = aclService;
        this.scramService = scramService;
        this.templateService = templateService;
    }
    
    /**
     * 创建租户
     */
    public void createTenant(TenantConfig tenantConfig) {
        try {
            // 1. 创建租户用户
            createTenantUsers(tenantConfig);
            
            // 2. 设置租户权限
            setupTenantPermissions(tenantConfig);
            
            // 3. 创建租户专用Topic
            createTenantTopics(tenantConfig);
            
            log.info("Tenant created successfully: {}", tenantConfig.getTenantId());
            
        } catch (Exception e) {
            log.error("Failed to create tenant: {}", tenantConfig.getTenantId(), e);
            throw new RuntimeException("Tenant creation failed", e);
        }
    }
    
    /**
     * 删除租户
     */
    public void deleteTenant(String tenantId) {
        try {
            // 1. 删除租户权限
            deleteTenantPermissions(tenantId);
            
            // 2. 删除租户用户
            deleteTenantUsers(tenantId);
            
            log.info("Tenant deleted successfully: {}", tenantId);
            
        } catch (Exception e) {
            log.error("Failed to delete tenant: {}", tenantId, e);
            throw new RuntimeException("Tenant deletion failed", e);
        }
    }
    
    /**
     * 获取租户权限报告
     */
    public TenantPermissionReport getTenantPermissionReport(String tenantId) {
        try {
            TenantPermissionReport report = new TenantPermissionReport();
            report.setTenantId(tenantId);
            
            // 获取租户相关的ACL规则
            KafkaACLManagementService.ACLFilter filter = KafkaACLManagementService.ACLFilter.builder()
                .principal("User:" + tenantId + "*")
                .build();
            
            Collection<AclBinding> acls = aclService.listACLs(filter);
            
            // 分析权限
            Map<String, List<String>> permissions = new HashMap<>();
            for (AclBinding acl : acls) {
                String resource = acl.pattern().resourceType() + ":" + acl.pattern().name();
                permissions.computeIfAbsent(resource, k -> new ArrayList<>())
                    .add(acl.entry().operation().toString());
            }
            
            report.setPermissions(permissions);
            report.setTotalRules(acls.size());
            report.setGeneratedAt(Instant.now());
            
            return report;
            
        } catch (Exception e) {
            log.error("Failed to generate tenant permission report: {}", tenantId, e);
            throw new RuntimeException("Permission report generation failed", e);
        }
    }
    
    private void createTenantUsers(TenantConfig config) {
        // 创建生产者用户
        String producerUser = config.getTenantId() + "-producer";
        scramService.createScramUser(producerUser, config.getProducerPassword(), ScramMechanism.SCRAM_SHA_256);
        
        // 创建消费者用户
        String consumerUser = config.getTenantId() + "-consumer";
        scramService.createScramUser(consumerUser, config.getConsumerPassword(), ScramMechanism.SCRAM_SHA_256);
        
        // 创建管理员用户（可选）
        if (config.isCreateAdminUser()) {
            String adminUser = config.getTenantId() + "-admin";
            scramService.createScramUser(adminUser, config.getAdminPassword(), ScramMechanism.SCRAM_SHA_256);
        }
    }
    
    private void setupTenantPermissions(TenantConfig config) {
        String tenantPrefix = config.getTenantId() + ".";
        
        // 生产者权限
        String producerPrincipal = "User:" + config.getTenantId() + "-producer";
        templateService.createProducerTemplate(producerPrincipal, tenantPrefix);
        
        // 消费者权限
        String consumerPrincipal = "User:" + config.getTenantId() + "-consumer";
        String consumerGroup = config.getTenantId() + "-group";
        templateService.createConsumerTemplate(consumerPrincipal, tenantPrefix, consumerGroup);
        
        // 管理员权限（限制在租户范围内）
        if (config.isCreateAdminUser()) {
            String adminPrincipal = "User:" + config.getTenantId() + "-admin";
            createTenantAdminPermissions(adminPrincipal, tenantPrefix);
        }
    }
    
    private void createTenantAdminPermissions(String principal, String topicPrefix) {
        List<KafkaACLManagementService.ACLRule> rules = Arrays.asList(
            // 租户Topic的所有权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.TOPIC)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.ALL)
                .permissionType(AclPermissionType.ALLOW)
                .build(),
            
            // 租户Consumer Group的所有权限
            KafkaACLManagementService.ACLRule.builder()
                .principal(principal)
                .host("*")
                .resourceType(ResourceType.GROUP)
                .resourceName(topicPrefix + "*")
                .patternType(PatternType.PREFIXED)
                .operation(AclOperation.ALL)
                .permissionType(AclPermissionType.ALLOW)
                .build()
        );
        
        aclService.createACLsBatch(rules);
    }
    
    private void createTenantTopics(TenantConfig config) {
        // 这里可以自动创建租户专用的Topic
        // 实际实现中需要使用AdminClient创建Topic
        log.info("Creating tenant topics for: {}", config.getTenantId());
    }
    
    private void deleteTenantPermissions(String tenantId) {
        // 删除租户相关的所有ACL规则
        KafkaACLManagementService.ACLFilter filter = KafkaACLManagementService.ACLFilter.builder()
            .principal("User:" + tenantId + "*")
            .build();
        
        Collection<AclBinding> acls = aclService.listACLs(filter);
        for (AclBinding acl : acls) {
            KafkaACLManagementService.ACLRule rule = KafkaACLManagementService.ACLRule.builder()
                .principal(acl.entry().principal())
                .host(acl.entry().host())
                .resourceType(acl.pattern().resourceType())
                .resourceName(acl.pattern().name())
                .patternType(acl.pattern().patternType())
                .operation(acl.entry().operation())
                .permissionType(acl.entry().permissionType())
                .build();
            
            aclService.deleteACL(rule);
        }
    }
    
    private void deleteTenantUsers(String tenantId) {
        // 删除租户用户
        scramService.deleteScramUser(tenantId + "-producer", ScramMechanism.SCRAM_SHA_256);
        scramService.deleteScramUser(tenantId + "-consumer", ScramMechanism.SCRAM_SHA_256);
        
        try {
            scramService.deleteScramUser(tenantId + "-admin", ScramMechanism.SCRAM_SHA_256);
        } catch (Exception e) {
            // 管理员用户可能不存在，忽略错误
            log.debug("Admin user not found for tenant: {}", tenantId);
        }
    }
    
    /**
     * 租户配置
     */
    @Data
    @Builder
    public static class TenantConfig {
        private String tenantId;
        private String producerPassword;
        private String consumerPassword;
        private String adminPassword;
        private boolean createAdminUser;
        private List<String> allowedHosts;
        private Map<String, String> customProperties;
    }
    
    /**
     * 租户权限报告
     */
    @Data
    public static class TenantPermissionReport {
        private String tenantId;
        private Map<String, List<String>> permissions;
        private int totalRules;
        private Instant generatedAt;
    }
}
```

### 5.2 安全审计服务

```java
@Service
public class KafkaSecurityAuditService {
    
    private static final Logger log = LoggerFactory.getLogger(KafkaSecurityAuditService.class);
    
    private final KafkaTemplate<String, Object> auditKafkaTemplate;
    private final MeterRegistry meterRegistry;
    
    public KafkaSecurityAuditService(KafkaTemplate<String, Object> auditKafkaTemplate,
                                   MeterRegistry meterRegistry) {
        this.auditKafkaTemplate = auditKafkaTemplate;
        this.meterRegistry = meterRegistry;
    }
    
    /**
     * 记录认证事件
     */
    public void auditAuthenticationEvent(AuthenticationEvent event) {
        try {
            AuditRecord auditRecord = AuditRecord.builder()
                .eventType(AuditEventType.AUTHENTICATION)
                .principal(event.getPrincipal())
                .clientHost(event.getClientHost())
                .timestamp(Instant.now())
                .success(event.isSuccess())
                .details(buildAuthenticationDetails(event))
                .build();
            
            sendAuditRecord(auditRecord);
            
            // 更新指标
            String status = event.isSuccess() ? "success" : "failure";
            meterRegistry.counter("kafka.security.authentication", "status", status).increment();
            
        } catch (Exception e) {
            log.error("Failed to audit authentication event", e);
        }
    }
    
    /**
     * 记录授权事件
     */
    public void auditAuthorizationEvent(AuthorizationEvent event) {
        try {
            AuditRecord auditRecord = AuditRecord.builder()
                .eventType(AuditEventType.AUTHORIZATION)
                .principal(event.getPrincipal())
                .clientHost(event.getClientHost())
                .timestamp(Instant.now())
                .success(event.isSuccess())
                .details(buildAuthorizationDetails(event))
                .build();
            
            sendAuditRecord(auditRecord);
            
            // 更新指标
            String status = event.isSuccess() ? "allowed" : "denied";
            meterRegistry.counter("kafka.security.authorization", 
                "status", status,
                "resource_type", event.getResourceType(),
                "operation", event.getOperation()).increment();
            
        } catch (Exception e) {
            log.error("Failed to audit authorization event", e);
        }
    }
    
    /**
     * 记录ACL变更事件
     */
    public void auditACLChangeEvent(ACLChangeEvent event) {
        try {
            AuditRecord auditRecord = AuditRecord.builder()
                .eventType(AuditEventType.ACL_CHANGE)
                .principal(event.getOperator())
                .clientHost(event.getClientHost())
                .timestamp(Instant.now())
                .success(true)
                .details(buildACLChangeDetails(event))
                .build();
            
            sendAuditRecord(auditRecord);
            
            // 更新指标
            meterRegistry.counter("kafka.security.acl.changes", 
                "operation", event.getOperation().toString()).increment();
            
        } catch (Exception e) {
            log.error("Failed to audit ACL change event", e);
        }
    }
    
    /**
     * 生成安全审计报告
     */
    public SecurityAuditReport generateAuditReport(Instant startTime, Instant endTime) {
        try {
            SecurityAuditReport report = new SecurityAuditReport();
            report.setStartTime(startTime);
            report.setEndTime(endTime);
            report.setGeneratedAt(Instant.now());
            
            // 统计认证事件
            AuthenticationStats authStats = new AuthenticationStats();
            authStats.setTotalAttempts(getAuthenticationAttempts(startTime, endTime));
            authStats.setSuccessfulAttempts(getSuccessfulAuthentications(startTime, endTime));
            authStats.setFailedAttempts(authStats.getTotalAttempts() - authStats.getSuccessfulAttempts());
            report.setAuthenticationStats(authStats);
            
            // 统计授权事件
            AuthorizationStats authzStats = new AuthorizationStats();
            authzStats.setTotalRequests(getAuthorizationRequests(startTime, endTime));
            authzStats.setAllowedRequests(getAllowedAuthorizations(startTime, endTime));
            authzStats.setDeniedRequests(authzStats.getTotalRequests() - authzStats.getAllowedRequests());
            report.setAuthorizationStats(authzStats);
            
            // 统计ACL变更
            ACLChangeStats aclStats = new ACLChangeStats();
            aclStats.setTotalChanges(getACLChanges(startTime, endTime));
            aclStats.setCreations(getACLCreations(startTime, endTime));
            aclStats.setDeletions(getACLDeletions(startTime, endTime));
            report.setAclChangeStats(aclStats);
            
            // 识别安全风险
            report.setSecurityRisks(identifySecurityRisks(startTime, endTime));
            
            return report;
            
        } catch (Exception e) {
            log.error("Failed to generate security audit report", e);
            throw new RuntimeException("Audit report generation failed", e);
        }
    }
    
    private void sendAuditRecord(AuditRecord record) {
        auditKafkaTemplate.send("security-audit", record.getPrincipal(), record);
    }
    
    private Map<String, Object> buildAuthenticationDetails(AuthenticationEvent event) {
        Map<String, Object> details = new HashMap<>();
        details.put("mechanism", event.getMechanism());
        details.put("client_id", event.getClientId());
        details.put("error_message", event.getErrorMessage());
        return details;
    }
    
    private Map<String, Object> buildAuthorizationDetails(AuthorizationEvent event) {
        Map<String, Object> details = new HashMap<>();
        details.put("resource_type", event.getResourceType());
        details.put("resource_name", event.getResourceName());
        details.put("operation", event.getOperation());
        details.put("client_id", event.getClientId());
        return details;
    }
    
    private Map<String, Object> buildACLChangeDetails(ACLChangeEvent event) {
        Map<String, Object> details = new HashMap<>();
        details.put("operation", event.getOperation().toString());
        details.put("resource_type", event.getResourceType());
        details.put("resource_name", event.getResourceName());
        details.put("principal", event.getTargetPrincipal());
        details.put("permission", event.getPermission());
        return details;
    }
    
    // 以下方法在实际实现中需要查询审计日志存储
    private long getAuthenticationAttempts(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 10000);
    }
    
    private long getSuccessfulAuthentications(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 9000);
    }
    
    private long getAuthorizationRequests(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 50000);
    }
    
    private long getAllowedAuthorizations(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 48000);
    }
    
    private long getACLChanges(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 100);
    }
    
    private long getACLCreations(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 60);
    }
    
    private long getACLDeletions(Instant startTime, Instant endTime) {
        return (long) (Math.random() * 40);
    }
    
    private List<SecurityRisk> identifySecurityRisks(Instant startTime, Instant endTime) {
        List<SecurityRisk> risks = new ArrayList<>();
        
        // 模拟风险识别
        if (Math.random() > 0.7) {
            risks.add(SecurityRisk.builder()
                .riskType(SecurityRiskType.HIGH_FAILURE_RATE)
                .description("High authentication failure rate detected")
                .severity(RiskSeverity.HIGH)
                .recommendation("Review authentication logs and check for brute force attacks")
                .build());
        }
        
        if (Math.random() > 0.8) {
            risks.add(SecurityRisk.builder()
                .riskType(SecurityRiskType.UNUSUAL_ACCESS_PATTERN)
                .description("Unusual access pattern from unknown IP addresses")
                .severity(RiskSeverity.MEDIUM)
                .recommendation("Verify the legitimacy of new client connections")
                .build());
        }
        
        return risks;
    }
    
    // 审计相关的数据类
    @Data
    @Builder
    public static class AuditRecord {
        private AuditEventType eventType;
        private String principal;
        private String clientHost;
        private Instant timestamp;
        private boolean success;
        private Map<String, Object> details;
    }
    
    public enum AuditEventType {
        AUTHENTICATION, AUTHORIZATION, ACL_CHANGE
    }
    
    @Data
    public static class AuthenticationEvent {
        private String principal;
        private String clientHost;
        private String clientId;
        private String mechanism;
        private boolean success;
        private String errorMessage;
    }
    
    @Data
    public static class AuthorizationEvent {
        private String principal;
        private String clientHost;
        private String clientId;
        private String resourceType;
        private String resourceName;
        private String operation;
        private boolean success;
    }
    
    @Data
    public static class ACLChangeEvent {
        private String operator;
        private String clientHost;
        private ACLOperation operation;
        private String resourceType;
        private String resourceName;
        private String targetPrincipal;
        private String permission;
    }
    
    public enum ACLOperation {
        CREATE, DELETE, UPDATE
    }
    
    @Data
    public static class SecurityAuditReport {
        private Instant startTime;
        private Instant endTime;
        private Instant generatedAt;
        private AuthenticationStats authenticationStats;
        private AuthorizationStats authorizationStats;
        private ACLChangeStats aclChangeStats;
        private List<SecurityRisk> securityRisks;
    }
    
    @Data
    public static class AuthenticationStats {
        private long totalAttempts;
        private long successfulAttempts;
        private long failedAttempts;
        
        public double getSuccessRate() {
            return totalAttempts > 0 ? (double) successfulAttempts / totalAttempts * 100 : 0;
        }
    }
    
    @Data
    public static class AuthorizationStats {
        private long totalRequests;
        private long allowedRequests;
        private long deniedRequests;
        
        public double getAllowRate() {
            return totalRequests > 0 ? (double) allowedRequests / totalRequests * 100 : 0;
        }
    }
    
    @Data
    public static class ACLChangeStats {
        private long totalChanges;
        private long creations;
        private long deletions;
    }
    
    @Data
    @Builder
    public static class SecurityRisk {
        private SecurityRiskType riskType;
        private String description;
        private RiskSeverity severity;
        private String recommendation;
    }
    
    public enum SecurityRiskType {
        HIGH_FAILURE_RATE, UNUSUAL_ACCESS_PATTERN, PRIVILEGE_ESCALATION, SUSPICIOUS_ACTIVITY
    }
    
    public enum RiskSeverity {
        LOW, MEDIUM, HIGH, CRITICAL
    }
}
```

## 6. 实战练习

### 练习1：SSL/TLS配置
**任务**：配置Kafka集群的SSL/TLS加密通信

**要求**：
1. 生成CA证书和服务器证书
2. 配置Broker的SSL设置
3. 实现客户端SSL连接
4. 验证加密通信是否正常工作

### 练习2：SASL认证实现
**任务**：实现多种SASL认证机制

**要求**：
1. 配置SASL/PLAIN认证
2. 实现SASL/SCRAM-SHA-256认证
3. 集成Kerberos认证（可选）
4. 测试不同认证机制的客户端连接

### 练习3：ACL权限管理
**任务**：设计和实现细粒度的权限控制

**要求**：
1. 创建不同角色的权限模板
2. 实现动态权限管理API
3. 设计权限继承和委派机制
4. 实现权限审计和监控

## 7. 课后作业

### 作业1：企业级安全架构
设计并实现一个完整的Kafka企业级安全架构：
- 多层安全防护（网络、传输、应用）
- 统一身份认证和授权
- 安全审计和合规性检查
- 安全事件响应机制

### 作业2：多租户安全隔离
实现一个支持多租户的Kafka安全解决方案：
- 租户间的完全隔离
- 动态租户管理
- 租户级别的安全策略
- 跨租户的安全审计

### 作业3：安全监控和告警
开发一个Kafka安全监控和告警系统：
- 实时安全事件监控
- 异常行为检测
- 自动化安全响应
- 安全态势感知大屏

## 8. 课程总结

### 8.1 关键知识点回顾

1. **安全架构设计**
   - 多层防护：网络安全、传输加密、身份认证、权限控制
   - 安全威胁分析：窃听、伪造、滥用、篡改、拒绝服务
   - 安全配置管理：SSL、SASL、ACL的统一配置

2. **SSL/TLS加密通信**
   - 证书管理：生成、验证、更新证书
   - SSL配置：客户端和服务端的SSL参数
   - 连接测试：验证SSL连接的有效性

3. **SASL认证机制**
   - PLAIN认证：简单用户名密码认证
   - SCRAM认证：安全的挑战响应认证
   - Kerberos认证：企业级单点登录

4. **ACL权限控制**
   - 权限模型：主体、资源、操作、权限类型
   - 权限模板：标准化的权限配置
   - 动态权限管理：运行时权限变更

### 8.2 最佳实践总结

1. **安全设计原则**
   - 最小权限原则：只授予必要的权限
   - 深度防御：多层安全控制
   - 零信任架构：不信任任何连接

2. **认证授权策略**
   - 强认证：使用强密码和多因子认证
   - 细粒度授权：精确控制资源访问
   - 定期审查：定期检查和更新权限

3. **安全运维管理**
   - 安全监控：实时监控安全事件
   - 审计日志：完整记录安全操作
   - 应急响应：快速响应安全事件

通过本节课的学习，你已经掌握了Kafka安全机制的核心技术和企业级实践。这些安全特性是构建可信赖的Kafka系统的基础，能够有效保护数据安全和系统稳定性。

至此，我们的Kafka深度学习课程已经全部完成。从基础概念到高级特性，从开发实践到运维管理，从性能优化到安全防护，你已经全面掌握了Kafka的各个方面。希望这些知识能够帮助你在实际项目中构建高效、可靠、安全的Kafka系统。
```