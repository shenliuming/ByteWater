# 第3天：Kafka的存储机制

## 课程目标
- 深入理解Kafka的存储架构和原理
- 掌握Kafka日志文件的结构和管理机制
- 学习Kafka索引机制和数据检索原理
- 了解Kafka存储配置和优化策略
- 实践Kafka存储相关的监控和管理

## 1. Kafka存储架构概述

### 1.1 存储层次结构

Kafka的存储采用分层架构：
- **Topic层**：逻辑概念，包含多个分区
- **Partition层**：物理存储单元，包含多个Segment
- **Segment层**：实际的存储文件，包含日志文件和索引文件

```java
/**
 * Kafka存储架构管理器
 */
@Component
public class KafkaStorageArchitectureManager {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaStorageArchitectureManager.class);
    
    /**
     * 存储层次信息
     */
    @Data
    @AllArgsConstructor
    public static class StorageHierarchy {
        private String topicName;
        private int partitionCount;
        private List<PartitionInfo> partitions;
    }
    
    @Data
    @AllArgsConstructor
    public static class PartitionInfo {
        private int partitionId;
        private String logDir;
        private List<SegmentInfo> segments;
        private long totalSize;
    }
    
    @Data
    @AllArgsConstructor
    public static class SegmentInfo {
        private String segmentName;
        private long baseOffset;
        private long size;
        private long lastModified;
        private boolean isActive;
    }
    
    /**
     * 获取Topic的存储层次结构
     */
    public StorageHierarchy getStorageHierarchy(String topicName, String kafkaLogDir) {
        try {
            List<PartitionInfo> partitions = new ArrayList<>();
            
            // 扫描Topic目录
            Path topicPath = Paths.get(kafkaLogDir);
            Files.list(topicPath)
                .filter(path -> path.getFileName().toString().startsWith(topicName + "-"))
                .forEach(partitionPath -> {
                    try {
                        PartitionInfo partitionInfo = analyzePartition(partitionPath);
                        partitions.add(partitionInfo);
                    } catch (IOException e) {
                        logger.error("分析分区失败: {}", partitionPath, e);
                    }
                });
            
            return new StorageHierarchy(topicName, partitions.size(), partitions);
            
        } catch (IOException e) {
            logger.error("获取存储层次结构失败", e);
            throw new RuntimeException("获取存储层次结构失败", e);
        }
    }
    
    /**
     * 分析分区信息
     */
    private PartitionInfo analyzePartition(Path partitionPath) throws IOException {
        String partitionName = partitionPath.getFileName().toString();
        int partitionId = extractPartitionId(partitionName);
        
        List<SegmentInfo> segments = new ArrayList<>();
        long totalSize = 0;
        
        // 扫描Segment文件
        Files.list(partitionPath)
            .filter(path -> path.getFileName().toString().endsWith(".log"))
            .forEach(logFile -> {
                try {
                    SegmentInfo segmentInfo = analyzeSegment(logFile);
                    segments.add(segmentInfo);
                } catch (IOException e) {
                    logger.error("分析Segment失败: {}", logFile, e);
                }
            });
        
        totalSize = segments.stream().mapToLong(SegmentInfo::getSize).sum();
        
        return new PartitionInfo(partitionId, partitionPath.toString(), segments, totalSize);
    }
    
    /**
     * 分析Segment信息
     */
    private SegmentInfo analyzeSegment(Path logFile) throws IOException {
        String fileName = logFile.getFileName().toString();
        long baseOffset = Long.parseLong(fileName.substring(0, fileName.lastIndexOf(".")));
        long size = Files.size(logFile);
        long lastModified = Files.getLastModifiedTime(logFile).toMillis();
        
        // 判断是否为活跃Segment（最大offset的Segment）
        boolean isActive = isActiveSegment(logFile.getParent(), baseOffset);
        
        return new SegmentInfo(fileName, baseOffset, size, lastModified, isActive);
    }
    
    /**
     * 提取分区ID
     */
    private int extractPartitionId(String partitionName) {
        String[] parts = partitionName.split("-");
        return Integer.parseInt(parts[parts.length - 1]);
    }
    
    /**
     * 判断是否为活跃Segment
     */
    private boolean isActiveSegment(Path partitionDir, long baseOffset) throws IOException {
        return Files.list(partitionDir)
            .filter(path -> path.getFileName().toString().endsWith(".log"))
            .mapToLong(path -> {
                String fileName = path.getFileName().toString();
                return Long.parseLong(fileName.substring(0, fileName.lastIndexOf(".")));
            })
            .max()
            .orElse(0L) == baseOffset;
    }
}
```

### 1.2 存储目录结构

```java
/**
 * Kafka存储目录管理器
 */
@Component
public class KafkaStorageDirectoryManager {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaStorageDirectoryManager.class);
    
    /**
     * 目录结构信息
     */
    @Data
    @AllArgsConstructor
    public static class DirectoryStructure {
        private String rootPath;
        private List<TopicDirectory> topics;
        private long totalSize;
        private int totalPartitions;
    }
    
    @Data
    @AllArgsConstructor
    public static class TopicDirectory {
        private String topicName;
        private List<String> partitionDirs;
        private long topicSize;
    }
    
    /**
     * 扫描Kafka存储目录结构
     */
    public DirectoryStructure scanStorageDirectory(String kafkaLogDir) {
        try {
            Path rootPath = Paths.get(kafkaLogDir);
            Map<String, List<String>> topicPartitions = new HashMap<>();
            long totalSize = 0;
            int totalPartitions = 0;
            
            // 扫描所有目录
            Files.list(rootPath)
                .filter(Files::isDirectory)
                .forEach(dir -> {
                    String dirName = dir.getFileName().toString();
                    if (isTopicPartitionDir(dirName)) {
                        String topicName = extractTopicName(dirName);
                        topicPartitions.computeIfAbsent(topicName, k -> new ArrayList<>()).add(dirName);
                    }
                });
            
            // 计算每个Topic的大小
            List<TopicDirectory> topics = new ArrayList<>();
            for (Map.Entry<String, List<String>> entry : topicPartitions.entrySet()) {
                String topicName = entry.getKey();
                List<String> partitionDirs = entry.getValue();
                
                long topicSize = calculateTopicSize(rootPath, partitionDirs);
                topics.add(new TopicDirectory(topicName, partitionDirs, topicSize));
                
                totalSize += topicSize;
                totalPartitions += partitionDirs.size();
            }
            
            return new DirectoryStructure(kafkaLogDir, topics, totalSize, totalPartitions);
            
        } catch (IOException e) {
            logger.error("扫描存储目录失败", e);
            throw new RuntimeException("扫描存储目录失败", e);
        }
    }
    
    /**
     * 判断是否为Topic分区目录
     */
    private boolean isTopicPartitionDir(String dirName) {
        return dirName.matches(".+-\\d+");
    }
    
    /**
     * 提取Topic名称
     */
    private String extractTopicName(String dirName) {
        int lastDashIndex = dirName.lastIndexOf('-');
        return dirName.substring(0, lastDashIndex);
    }
    
    /**
     * 计算Topic大小
     */
    private long calculateTopicSize(Path rootPath, List<String> partitionDirs) {
        return partitionDirs.stream()
            .mapToLong(partitionDir -> {
                try {
                    return Files.walk(rootPath.resolve(partitionDir))
                        .filter(Files::isRegularFile)
                        .mapToLong(file -> {
                            try {
                                return Files.size(file);
                            } catch (IOException e) {
                                return 0L;
                            }
                        })
                        .sum();
                } catch (IOException e) {
                    logger.error("计算分区大小失败: {}", partitionDir, e);
                    return 0L;
                }
            })
            .sum();
    }
    
    /**
     * 生成存储目录报告
     */
    public String generateStorageReport(DirectoryStructure structure) {
        StringBuilder report = new StringBuilder();
        report.append("=== Kafka存储目录报告 ===\n");
        report.append(String.format("根目录: %s\n", structure.getRootPath()));
        report.append(String.format("总大小: %.2f GB\n", structure.getTotalSize() / (1024.0 * 1024.0 * 1024.0)));
        report.append(String.format("总分区数: %d\n", structure.getTotalPartitions()));
        report.append(String.format("Topic数量: %d\n\n", structure.getTopics().size()));
        
        report.append("=== Topic详情 ===\n");
        structure.getTopics().stream()
            .sorted((t1, t2) -> Long.compare(t2.getTopicSize(), t1.getTopicSize()))
            .forEach(topic -> {
                report.append(String.format("Topic: %s\n", topic.getTopicName()));
                report.append(String.format("  分区数: %d\n", topic.getPartitionDirs().size()));
                report.append(String.format("  大小: %.2f MB\n", topic.getTopicSize() / (1024.0 * 1024.0)));
                report.append("  分区目录:\n");
                topic.getPartitionDirs().forEach(dir -> 
                    report.append(String.format("    %s\n", dir)));
                report.append("\n");
            });
        
        return report.toString();
    }
}
```

## 2. Kafka日志文件结构

### 2.1 Segment文件组成

每个Segment由三个文件组成：
- **.log文件**：存储实际的消息数据
- **.index文件**：偏移量索引文件
- **.timeindex文件**：时间戳索引文件

```java
/**
 * Kafka Segment文件分析器
 */
@Component
public class KafkaSegmentAnalyzer {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaSegmentAnalyzer.class);
    
    /**
     * Segment文件信息
     */
    @Data
    @AllArgsConstructor
    public static class SegmentFileInfo {
        private String segmentName;
        private long baseOffset;
        private LogFileInfo logFile;
        private IndexFileInfo offsetIndex;
        private IndexFileInfo timeIndex;
    }
    
    @Data
    @AllArgsConstructor
    public static class LogFileInfo {
        private String fileName;
        private long size;
        private int messageCount;
        private long firstOffset;
        private long lastOffset;
    }
    
    @Data
    @AllArgsConstructor
    public static class IndexFileInfo {
        private String fileName;
        private long size;
        private int entryCount;
        private int entrySize;
    }
    
    /**
     * 分析Segment文件
     */
    public SegmentFileInfo analyzeSegment(String partitionDir, long baseOffset) {
        try {
            Path partitionPath = Paths.get(partitionDir);
            String segmentName = String.format("%020d", baseOffset);
            
            // 分析日志文件
            LogFileInfo logFile = analyzeLogFile(partitionPath.resolve(segmentName + ".log"));
            
            // 分析偏移量索引文件
            IndexFileInfo offsetIndex = analyzeIndexFile(partitionPath.resolve(segmentName + ".index"), 8);
            
            // 分析时间戳索引文件
            IndexFileInfo timeIndex = analyzeIndexFile(partitionPath.resolve(segmentName + ".timeindex"), 12);
            
            return new SegmentFileInfo(segmentName, baseOffset, logFile, offsetIndex, timeIndex);
            
        } catch (IOException e) {
            logger.error("分析Segment文件失败: {}", baseOffset, e);
            throw new RuntimeException("分析Segment文件失败", e);
        }
    }
    
    /**
     * 分析日志文件
     */
    private LogFileInfo analyzeLogFile(Path logFilePath) throws IOException {
        if (!Files.exists(logFilePath)) {
            return new LogFileInfo(logFilePath.getFileName().toString(), 0, 0, -1, -1);
        }
        
        long size = Files.size(logFilePath);
        String fileName = logFilePath.getFileName().toString();
        
        // 简化的消息计数（实际实现需要解析消息格式）
        int messageCount = estimateMessageCount(logFilePath);
        
        // 从文件名提取基础偏移量
        long firstOffset = Long.parseLong(fileName.substring(0, fileName.lastIndexOf(".")));
        long lastOffset = firstOffset + messageCount - 1;
        
        return new LogFileInfo(fileName, size, messageCount, firstOffset, lastOffset);
    }
    
    /**
     * 分析索引文件
     */
    private IndexFileInfo analyzeIndexFile(Path indexFilePath, int entrySize) throws IOException {
        if (!Files.exists(indexFilePath)) {
            return new IndexFileInfo(indexFilePath.getFileName().toString(), 0, 0, entrySize);
        }
        
        long size = Files.size(indexFilePath);
        String fileName = indexFilePath.getFileName().toString();
        int entryCount = (int) (size / entrySize);
        
        return new IndexFileInfo(fileName, size, entryCount, entrySize);
    }
    
    /**
     * 估算消息数量（简化实现）
     */
    private int estimateMessageCount(Path logFilePath) throws IOException {
        long fileSize = Files.size(logFilePath);
        // 假设平均消息大小为1KB
        return (int) (fileSize / 1024);
    }
    
    /**
     * 生成Segment分析报告
     */
    public String generateSegmentReport(SegmentFileInfo segmentInfo) {
        StringBuilder report = new StringBuilder();
        report.append(String.format("=== Segment分析报告: %s ===\n", segmentInfo.getSegmentName()));
        report.append(String.format("基础偏移量: %d\n", segmentInfo.getBaseOffset()));
        
        // 日志文件信息
        LogFileInfo logFile = segmentInfo.getLogFile();
        report.append("\n--- 日志文件 ---\n");
        report.append(String.format("文件名: %s\n", logFile.getFileName()));
        report.append(String.format("大小: %.2f MB\n", logFile.getSize() / (1024.0 * 1024.0)));
        report.append(String.format("消息数量: %d\n", logFile.getMessageCount()));
        report.append(String.format("偏移量范围: %d - %d\n", logFile.getFirstOffset(), logFile.getLastOffset()));
        
        // 偏移量索引文件信息
        IndexFileInfo offsetIndex = segmentInfo.getOffsetIndex();
        report.append("\n--- 偏移量索引文件 ---\n");
        report.append(String.format("文件名: %s\n", offsetIndex.getFileName()));
        report.append(String.format("大小: %.2f KB\n", offsetIndex.getSize() / 1024.0));
        report.append(String.format("索引条目数: %d\n", offsetIndex.getEntryCount()));
        
        // 时间戳索引文件信息
        IndexFileInfo timeIndex = segmentInfo.getTimeIndex();
        report.append("\n--- 时间戳索引文件 ---\n");
        report.append(String.format("文件名: %s\n", timeIndex.getFileName()));
        report.append(String.format("大小: %.2f KB\n", timeIndex.getSize() / 1024.0));
        report.append(String.format("索引条目数: %d\n", timeIndex.getEntryCount()));
        
        return report.toString();
    }
}
```

### 2.2 消息格式解析

```java
/**
 * Kafka消息格式解析器
 */
@Component
public class KafkaMessageFormatParser {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaMessageFormatParser.class);
    
    /**
     * 消息记录信息
     */
    @Data
    @AllArgsConstructor
    public static class MessageRecord {
        private long offset;
        private int messageSize;
        private long timestamp;
        private int keySize;
        private int valueSize;
        private String key;
        private String value;
        private Map<String, String> headers;
    }
    
    /**
     * 批次信息
     */
    @Data
    @AllArgsConstructor
    public static class RecordBatch {
        private long baseOffset;
        private int batchLength;
        private int partitionLeaderEpoch;
        private byte magic;
        private long firstTimestamp;
        private long maxTimestamp;
        private int recordCount;
        private List<MessageRecord> records;
    }
    
    /**
     * 解析消息批次（简化实现）
     */
    public List<RecordBatch> parseLogFile(String logFilePath, int maxBatches) {
        List<RecordBatch> batches = new ArrayList<>();
        
        try (RandomAccessFile file = new RandomAccessFile(logFilePath, "r")) {
            long fileSize = file.length();
            long position = 0;
            int batchCount = 0;
            
            while (position < fileSize && batchCount < maxBatches) {
                file.seek(position);
                
                // 读取批次头部信息（简化）
                if (file.length() - position < 61) { // 最小批次头部大小
                    break;
                }
                
                long baseOffset = file.readLong();
                int batchLength = file.readInt();
                
                if (batchLength <= 0 || position + batchLength > fileSize) {
                    break;
                }
                
                // 跳过其他头部字段
                file.skipBytes(4); // partition leader epoch
                byte magic = file.readByte();
                file.skipBytes(4); // CRC
                file.skipBytes(2); // attributes
                file.skipBytes(4); // last offset delta
                long firstTimestamp = file.readLong();
                long maxTimestamp = file.readLong();
                file.skipBytes(8); // producer id
                file.skipBytes(2); // producer epoch
                file.skipBytes(4); // base sequence
                int recordCount = file.readInt();
                
                // 创建批次对象（简化，不解析具体记录）
                RecordBatch batch = new RecordBatch(
                    baseOffset, batchLength, 0, magic,
                    firstTimestamp, maxTimestamp, recordCount,
                    new ArrayList<>()
                );
                
                batches.add(batch);
                position += batchLength;
                batchCount++;
            }
            
        } catch (IOException e) {
            logger.error("解析日志文件失败: {}", logFilePath, e);
        }
        
        return batches;
    }
    
    /**
     * 生成消息格式报告
     */
    public String generateMessageFormatReport(List<RecordBatch> batches) {
        StringBuilder report = new StringBuilder();
        report.append("=== 消息格式分析报告 ===\n");
        report.append(String.format("批次数量: %d\n", batches.size()));
        
        if (!batches.isEmpty()) {
            RecordBatch firstBatch = batches.get(0);
            RecordBatch lastBatch = batches.get(batches.size() - 1);
            
            report.append(String.format("偏移量范围: %d - %d\n", 
                firstBatch.getBaseOffset(), lastBatch.getBaseOffset()));
            report.append(String.format("消息版本: %d\n", firstBatch.getMagic()));
            
            long totalRecords = batches.stream().mapToLong(RecordBatch::getRecordCount).sum();
            report.append(String.format("总消息数: %d\n", totalRecords));
            
            double avgBatchSize = batches.stream().mapToInt(RecordBatch::getBatchLength).average().orElse(0);
            report.append(String.format("平均批次大小: %.2f bytes\n", avgBatchSize));
            
            report.append("\n=== 批次详情 ===\n");
            batches.stream().limit(10).forEach(batch -> {
                report.append(String.format("批次偏移量: %d, 长度: %d bytes, 记录数: %d\n",
                    batch.getBaseOffset(), batch.getBatchLength(), batch.getRecordCount()));
            });
            
            if (batches.size() > 10) {
                report.append(String.format("... 还有 %d 个批次\n", batches.size() - 10));
            }
        }
        
        return report.toString();
    }
}
```

## 3. Kafka索引机制

### 3.1 偏移量索引

```java
/**
 * Kafka偏移量索引管理器
 */
@Component
public class KafkaOffsetIndexManager {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaOffsetIndexManager.class);
    
    /**
     * 索引条目
     */
    @Data
    @AllArgsConstructor
    public static class IndexEntry {
        private int relativeOffset;
        private int physicalPosition;
    }
    
    /**
     * 索引文件信息
     */
    @Data
    @AllArgsConstructor
    public static class IndexFileAnalysis {
        private String fileName;
        private long baseOffset;
        private List<IndexEntry> entries;
        private int maxEntries;
        private double utilizationRate;
    }
    
    /**
     * 解析偏移量索引文件
     */
    public IndexFileAnalysis parseOffsetIndex(String indexFilePath) {
        List<IndexEntry> entries = new ArrayList<>();
        
        try (RandomAccessFile file = new RandomAccessFile(indexFilePath, "r")) {
            long fileSize = file.length();
            int entrySize = 8; // 4 bytes for offset + 4 bytes for position
            int maxEntries = (int) (fileSize / entrySize);
            
            String fileName = Paths.get(indexFilePath).getFileName().toString();
            long baseOffset = Long.parseLong(fileName.substring(0, fileName.lastIndexOf(".")));
            
            // 读取所有索引条目
            for (int i = 0; i < maxEntries; i++) {
                file.seek(i * entrySize);
                
                int relativeOffset = file.readInt();
                int physicalPosition = file.readInt();
                
                // 跳过空条目
                if (relativeOffset == 0 && physicalPosition == 0 && i > 0) {
                    break;
                }
                
                entries.add(new IndexEntry(relativeOffset, physicalPosition));
            }
            
            double utilizationRate = entries.size() / (double) maxEntries;
            
            return new IndexFileAnalysis(fileName, baseOffset, entries, maxEntries, utilizationRate);
            
        } catch (IOException e) {
            logger.error("解析偏移量索引文件失败: {}", indexFilePath, e);
            throw new RuntimeException("解析偏移量索引文件失败", e);
        }
    }
    
    /**
     * 查找指定偏移量的物理位置
     */
    public int findPhysicalPosition(IndexFileAnalysis indexAnalysis, long targetOffset) {
        long baseOffset = indexAnalysis.getBaseOffset();
        int relativeTargetOffset = (int) (targetOffset - baseOffset);
        
        List<IndexEntry> entries = indexAnalysis.getEntries();
        
        // 二分查找
        int left = 0;
        int right = entries.size() - 1;
        int result = -1;
        
        while (left <= right) {
            int mid = left + (right - left) / 2;
            IndexEntry entry = entries.get(mid);
            
            if (entry.getRelativeOffset() <= relativeTargetOffset) {
                result = entry.getPhysicalPosition();
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return result;
    }
    
    /**
     * 生成索引分析报告
     */
    public String generateIndexReport(IndexFileAnalysis analysis) {
        StringBuilder report = new StringBuilder();
        report.append(String.format("=== 偏移量索引分析: %s ===\n", analysis.getFileName()));
        report.append(String.format("基础偏移量: %d\n", analysis.getBaseOffset()));
        report.append(String.format("索引条目数: %d\n", analysis.getEntries().size()));
        report.append(String.format("最大条目数: %d\n", analysis.getMaxEntries()));
        report.append(String.format("利用率: %.2f%%\n", analysis.getUtilizationRate() * 100));
        
        if (!analysis.getEntries().isEmpty()) {
            report.append("\n=== 索引条目样例 ===\n");
            analysis.getEntries().stream().limit(10).forEach(entry -> {
                long absoluteOffset = analysis.getBaseOffset() + entry.getRelativeOffset();
                report.append(String.format("偏移量: %d (相对: %d), 物理位置: %d\n",
                    absoluteOffset, entry.getRelativeOffset(), entry.getPhysicalPosition()));
            });
            
            if (analysis.getEntries().size() > 10) {
                report.append(String.format("... 还有 %d 个条目\n", analysis.getEntries().size() - 10));
            }
        }
        
        return report.toString();
    }
}
```

### 3.2 时间戳索引

```java
/**
 * Kafka时间戳索引管理器
 */
@Component
public class KafkaTimestampIndexManager {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaTimestampIndexManager.class);
    
    /**
     * 时间戳索引条目
     */
    @Data
    @AllArgsConstructor
    public static class TimestampIndexEntry {
        private long timestamp;
        private int relativeOffset;
    }
    
    /**
     * 时间戳索引文件信息
     */
    @Data
    @AllArgsConstructor
    public static class TimestampIndexAnalysis {
        private String fileName;
        private long baseOffset;
        private List<TimestampIndexEntry> entries;
        private long minTimestamp;
        private long maxTimestamp;
        private double utilizationRate;
    }
    
    /**
     * 解析时间戳索引文件
     */
    public TimestampIndexAnalysis parseTimestampIndex(String indexFilePath) {
        List<TimestampIndexEntry> entries = new ArrayList<>();
        
        try (RandomAccessFile file = new RandomAccessFile(indexFilePath, "r")) {
            long fileSize = file.length();
            int entrySize = 12; // 8 bytes for timestamp + 4 bytes for offset
            int maxEntries = (int) (fileSize / entrySize);
            
            String fileName = Paths.get(indexFilePath).getFileName().toString();
            long baseOffset = Long.parseLong(fileName.substring(0, fileName.lastIndexOf(".")));
            
            long minTimestamp = Long.MAX_VALUE;
            long maxTimestamp = Long.MIN_VALUE;
            
            // 读取所有时间戳索引条目
            for (int i = 0; i < maxEntries; i++) {
                file.seek(i * entrySize);
                
                long timestamp = file.readLong();
                int relativeOffset = file.readInt();
                
                // 跳过空条目
                if (timestamp == 0 && relativeOffset == 0 && i > 0) {
                    break;
                }
                
                entries.add(new TimestampIndexEntry(timestamp, relativeOffset));
                
                if (timestamp > 0) {
                    minTimestamp = Math.min(minTimestamp, timestamp);
                    maxTimestamp = Math.max(maxTimestamp, timestamp);
                }
            }
            
            if (entries.isEmpty()) {
                minTimestamp = 0;
                maxTimestamp = 0;
            }
            
            double utilizationRate = entries.size() / (double) maxEntries;
            
            return new TimestampIndexAnalysis(fileName, baseOffset, entries, 
                minTimestamp, maxTimestamp, utilizationRate);
            
        } catch (IOException e) {
            logger.error("解析时间戳索引文件失败: {}", indexFilePath, e);
            throw new RuntimeException("解析时间戳索引文件失败", e);
        }
    }
    
    /**
     * 根据时间戳查找偏移量
     */
    public long findOffsetByTimestamp(TimestampIndexAnalysis analysis, long targetTimestamp) {
        List<TimestampIndexEntry> entries = analysis.getEntries();
        
        // 二分查找最接近的时间戳
        int left = 0;
        int right = entries.size() - 1;
        long result = -1;
        
        while (left <= right) {
            int mid = left + (right - left) / 2;
            TimestampIndexEntry entry = entries.get(mid);
            
            if (entry.getTimestamp() <= targetTimestamp) {
                result = analysis.getBaseOffset() + entry.getRelativeOffset();
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return result;
    }
    
    /**
     * 生成时间戳索引报告
     */
    public String generateTimestampIndexReport(TimestampIndexAnalysis analysis) {
        StringBuilder report = new StringBuilder();
        report.append(String.format("=== 时间戳索引分析: %s ===\n", analysis.getFileName()));
        report.append(String.format("基础偏移量: %d\n", analysis.getBaseOffset()));
        report.append(String.format("索引条目数: %d\n", analysis.getEntries().size()));
        report.append(String.format("利用率: %.2f%%\n", analysis.getUtilizationRate() * 100));
        
        if (analysis.getMinTimestamp() > 0) {
            report.append(String.format("时间戳范围: %s - %s\n",
                formatTimestamp(analysis.getMinTimestamp()),
                formatTimestamp(analysis.getMaxTimestamp())));
            
            long timeSpan = analysis.getMaxTimestamp() - analysis.getMinTimestamp();
            report.append(String.format("时间跨度: %d 秒\n", timeSpan / 1000));
        }
        
        if (!analysis.getEntries().isEmpty()) {
            report.append("\n=== 时间戳索引条目样例 ===\n");
            analysis.getEntries().stream().limit(10).forEach(entry -> {
                long absoluteOffset = analysis.getBaseOffset() + entry.getRelativeOffset();
                report.append(String.format("时间戳: %s, 偏移量: %d (相对: %d)\n",
                    formatTimestamp(entry.getTimestamp()), absoluteOffset, entry.getRelativeOffset()));
            });
            
            if (analysis.getEntries().size() > 10) {
                report.append(String.format("... 还有 %d 个条目\n", analysis.getEntries().size() - 10));
            }
        }
        
        return report.toString();
    }
    
    /**
     * 格式化时间戳
     */
    private String formatTimestamp(long timestamp) {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS")
            .format(new Date(timestamp));
    }
}
```

## 4. 存储配置和优化

### 4.1 存储配置管理

```java
/**
 * Kafka存储配置管理器
 */
@Component
public class KafkaStorageConfigManager {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaStorageConfigManager.class);
    
    /**
     * 存储配置
     */
    @Data
    @Builder
    public static class StorageConfig {
        // 日志保留配置
        private long logRetentionMs;           // 日志保留时间
        private long logRetentionBytes;        // 日志保留大小
        private long logSegmentBytes;          // Segment文件大小
        private long logRollMs;                // Segment滚动时间
        
        // 清理配置
        private String logCleanupPolicy;       // 清理策略：delete/compact
        private double logCleanerMinCleanRatio; // 压缩比例
        private int logCleanerThreads;         // 清理线程数
        
        // 索引配置
        private int logIndexSizeMaxBytes;      // 索引文件最大大小
        private int logIndexIntervalBytes;     // 索引间隔
        
        // 刷盘配置
        private long logFlushIntervalMs;       // 刷盘时间间隔
        private int logFlushIntervalMessages;  // 刷盘消息间隔
        
        // 压缩配置
        private String compressionType;        // 压缩类型
        
        // 文件系统配置
        private List<String> logDirs;          // 日志目录
        private int numRecoveryThreadsPerDataDir; // 恢复线程数
    }
    
    /**
     * 获取默认存储配置
     */
    public StorageConfig getDefaultStorageConfig() {
        return StorageConfig.builder()
            .logRetentionMs(7 * 24 * 60 * 60 * 1000L)  // 7天
            .logRetentionBytes(-1L)                     // 无限制
            .logSegmentBytes(1024 * 1024 * 1024L)       // 1GB
            .logRollMs(7 * 24 * 60 * 60 * 1000L)        // 7天
            .logCleanupPolicy("delete")
            .logCleanerMinCleanRatio(0.5)
            .logCleanerThreads(1)
            .logIndexSizeMaxBytes(10 * 1024 * 1024)     // 10MB
            .logIndexIntervalBytes(4096)                // 4KB
            .logFlushIntervalMs(Long.MAX_VALUE)         // 依赖OS
            .logFlushIntervalMessages(Integer.MAX_VALUE) // 依赖OS
            .compressionType("producer")
            .logDirs(Arrays.asList("/tmp/kafka-logs"))
            .numRecoveryThreadsPerDataDir(1)
            .build();
    }
    
    /**
     * 获取高吞吐量配置
     */
    public StorageConfig getHighThroughputConfig() {
        return StorageConfig.builder()
            .logRetentionMs(3 * 24 * 60 * 60 * 1000L)   // 3天
            .logRetentionBytes(-1L)
            .logSegmentBytes(2048 * 1024 * 1024L)       // 2GB
            .logRollMs(24 * 60 * 60 * 1000L)            // 1天
            .logCleanupPolicy("delete")
            .logCleanerMinCleanRatio(0.5)
            .logCleanerThreads(2)
            .logIndexSizeMaxBytes(50 * 1024 * 1024)     // 50MB
            .logIndexIntervalBytes(8192)                // 8KB
            .logFlushIntervalMs(1000L)                  // 1秒
            .logFlushIntervalMessages(10000)
            .compressionType("lz4")
            .logDirs(Arrays.asList("/data1/kafka-logs", "/data2/kafka-logs"))
            .numRecoveryThreadsPerDataDir(4)
            .build();
    }
    
    /**
     * 获取低延迟配置
     */
    public StorageConfig getLowLatencyConfig() {
        return StorageConfig.builder()
            .logRetentionMs(24 * 60 * 60 * 1000L)       // 1天
            .logRetentionBytes(-1L)
            .logSegmentBytes(512 * 1024 * 1024L)        // 512MB
            .logRollMs(6 * 60 * 60 * 1000L)             // 6小时
            .logCleanupPolicy("delete")
            .logCleanerMinCleanRatio(0.5)
            .logCleanerThreads(1)
            .logIndexSizeMaxBytes(10 * 1024 * 1024)     // 10MB
            .logIndexIntervalBytes(2048)                // 2KB
            .logFlushIntervalMs(100L)                   // 100ms
            .logFlushIntervalMessages(1000)
            .compressionType("uncompressed")
            .logDirs(Arrays.asList("/ssd/kafka-logs"))
            .numRecoveryThreadsPerDataDir(2)
            .build();
    }
    
    /**
     * 生成配置文件内容
     */
    public String generateConfigFile(StorageConfig config) {
        StringBuilder configContent = new StringBuilder();
        configContent.append("# Kafka存储配置\n\n");
        
        // 日志保留配置
        configContent.append("# 日志保留配置\n");
        configContent.append(String.format("log.retention.ms=%d\n", config.getLogRetentionMs()));
        if (config.getLogRetentionBytes() > 0) {
            configContent.append(String.format("log.retention.bytes=%d\n", config.getLogRetentionBytes()));
        }
        configContent.append(String.format("log.segment.bytes=%d\n", config.getLogSegmentBytes()));
        configContent.append(String.format("log.roll.ms=%d\n\n", config.getLogRollMs()));
        
        // 清理配置
        configContent.append("# 日志清理配置\n");
        configContent.append(String.format("log.cleanup.policy=%s\n", config.getLogCleanupPolicy()));
        configContent.append(String.format("log.cleaner.min.cleanable.ratio=%.2f\n", config.getLogCleanerMinCleanRatio()));
        configContent.append(String.format("log.cleaner.threads=%d\n\n", config.getLogCleanerThreads()));
        
        // 索引配置
        configContent.append("# 索引配置\n");
        configContent.append(String.format("log.index.size.max.bytes=%d\n", config.getLogIndexSizeMaxBytes()));
        configContent.append(String.format("log.index.interval.bytes=%d\n\n", config.getLogIndexIntervalBytes()));
        
        // 刷盘配置
        configContent.append("# 刷盘配置\n");
        if (config.getLogFlushIntervalMs() < Long.MAX_VALUE) {
            configContent.append(String.format("log.flush.interval.ms=%d\n", config.getLogFlushIntervalMs()));
        }
        if (config.getLogFlushIntervalMessages() < Integer.MAX_VALUE) {
            configContent.append(String.format("log.flush.interval.messages=%d\n", config.getLogFlushIntervalMessages()));
        }
        configContent.append("\n");
        
        // 压缩配置
        configContent.append("# 压缩配置\n");
        configContent.append(String.format("compression.type=%s\n\n", config.getCompressionType()));
        
        // 文件系统配置
        configContent.append("# 文件系统配置\n");
        configContent.append(String.format("log.dirs=%s\n", String.join(",", config.getLogDirs())));
        configContent.append(String.format("num.recovery.threads.per.data.dir=%d\n", config.getNumRecoveryThreadsPerDataDir()));
        
        return configContent.toString();
    }
    
    /**
     * 验证存储配置
     */
    public List<String> validateStorageConfig(StorageConfig config) {
        List<String> issues = new ArrayList<>();
        
        // 验证保留时间
        if (config.getLogRetentionMs() <= 0) {
            issues.add("日志保留时间必须大于0");
        }
        
        // 验证Segment大小
        if (config.getLogSegmentBytes() < 1024 * 1024) {
            issues.add("Segment大小不应小于1MB");
        }
        
        // 验证索引配置
        if (config.getLogIndexSizeMaxBytes() < 1024) {
            issues.add("索引文件最大大小不应小于1KB");
        }
        
        // 验证清理策略
        if (!Arrays.asList("delete", "compact", "delete,compact").contains(config.getLogCleanupPolicy())) {
            issues.add("无效的日志清理策略");
        }
        
        // 验证压缩类型
        if (!Arrays.asList("uncompressed", "gzip", "snappy", "lz4", "zstd", "producer").contains(config.getCompressionType())) {
            issues.add("无效的压缩类型");
        }
        
        // 验证日志目录
        if (config.getLogDirs().isEmpty()) {
            issues.add("必须指定至少一个日志目录");
        }
        
        return issues;
    }
}
```

## 5. 实战案例：电商订单存储分析

```java
/**
 * 电商订单存储分析实战
 */
@Component
public class ECommerceOrderStorageAnalysis {
    
    private static final Logger logger = LoggerFactory.getLogger(ECommerceOrderStorageAnalysis.class);
    
    @Autowired
    private KafkaStorageArchitectureManager storageManager;
    
    @Autowired
    private KafkaSegmentAnalyzer segmentAnalyzer;
    
    @Autowired
    private KafkaOffsetIndexManager offsetIndexManager;
    
    /**
     * 订单存储分析结果
     */
    @Data
    @AllArgsConstructor
    public static class OrderStorageAnalysisResult {
        private String topicName;
        private long totalOrders;
        private double totalStorageSize;
        private int partitionCount;
        private List<PartitionAnalysis> partitionAnalyses;
        private StorageRecommendation recommendation;
    }
    
    @Data
    @AllArgsConstructor
    public static class PartitionAnalysis {
        private int partitionId;
        private long orderCount;
        private double storageSize;
        private int segmentCount;
        private double avgOrderSize;
        private String performanceLevel;
    }
    
    @Data
    @AllArgsConstructor
    public static class StorageRecommendation {
        private boolean needOptimization;
        private List<String> recommendations;
        private Map<String, Object> suggestedConfig;
    }
    
    /**
     * 分析订单Topic存储情况
     */
    public OrderStorageAnalysisResult analyzeOrderStorage(String orderTopicName, String kafkaLogDir) {
        try {
            // 获取存储层次结构
            KafkaStorageArchitectureManager.StorageHierarchy hierarchy = 
                storageManager.getStorageHierarchy(orderTopicName, kafkaLogDir);
            
            List<PartitionAnalysis> partitionAnalyses = new ArrayList<>();
            long totalOrders = 0;
            double totalStorageSize = 0;
            
            // 分析每个分区
            for (KafkaStorageArchitectureManager.PartitionInfo partition : hierarchy.getPartitions()) {
                PartitionAnalysis analysis = analyzePartition(partition);
                partitionAnalyses.add(analysis);
                
                totalOrders += analysis.getOrderCount();
                totalStorageSize += analysis.getStorageSize();
            }
            
            // 生成优化建议
            StorageRecommendation recommendation = generateRecommendation(
                partitionAnalyses, totalOrders, totalStorageSize);
            
            return new OrderStorageAnalysisResult(
                orderTopicName, totalOrders, totalStorageSize,
                hierarchy.getPartitionCount(), partitionAnalyses, recommendation
            );
            
        } catch (Exception e) {
            logger.error("分析订单存储失败", e);
            throw new RuntimeException("分析订单存储失败", e);
        }
    }
    
    /**
     * 分析单个分区
     */
    private PartitionAnalysis analyzePartition(KafkaStorageArchitectureManager.PartitionInfo partition) {
        long orderCount = 0;
        double storageSize = partition.getTotalSize() / (1024.0 * 1024.0); // MB
        int segmentCount = partition.getSegments().size();
        
        // 估算订单数量（基于Segment信息）
        for (KafkaStorageArchitectureManager.SegmentInfo segment : partition.getSegments()) {
            // 假设平均每个订单2KB
            orderCount += segment.getSize() / 2048;
        }
        
        double avgOrderSize = orderCount > 0 ? (storageSize * 1024 * 1024) / orderCount : 0;
        
        // 评估性能等级
        String performanceLevel = evaluatePerformanceLevel(storageSize, segmentCount, avgOrderSize);
        
        return new PartitionAnalysis(
            partition.getPartitionId(), orderCount, storageSize,
            segmentCount, avgOrderSize, performanceLevel
        );
    }
    
    /**
     * 评估性能等级
     */
    private String evaluatePerformanceLevel(double storageSize, int segmentCount, double avgOrderSize) {
        // 基于存储大小和Segment数量评估
        if (storageSize > 10240) { // 大于10GB
            return "需要优化";
        } else if (segmentCount > 100) {
            return "需要关注";
        } else if (avgOrderSize > 5120) { // 大于5KB
            return "正常";
        } else {
            return "良好";
        }
    }
    
    /**
     * 生成优化建议
     */
    private StorageRecommendation generateRecommendation(
            List<PartitionAnalysis> analyses, long totalOrders, double totalStorageSize) {
        
        List<String> recommendations = new ArrayList<>();
        Map<String, Object> suggestedConfig = new HashMap<>();
        boolean needOptimization = false;
        
        // 检查存储大小
        if (totalStorageSize > 50 * 1024) { // 大于50GB
            needOptimization = true;
            recommendations.add("总存储大小过大，建议调整日志保留策略");
            suggestedConfig.put("log.retention.ms", 3 * 24 * 60 * 60 * 1000L); // 3天
        }
        
        // 检查分区平衡
        double avgPartitionSize = totalStorageSize / analyses.size();
        long imbalancedPartitions = analyses.stream()
            .mapToLong(analysis -> Math.abs((long)(analysis.getStorageSize() - avgPartitionSize)) > avgPartitionSize * 0.5 ? 1 : 0)
            .sum();
        
        if (imbalancedPartitions > analyses.size() * 0.3) {
            needOptimization = true;
            recommendations.add("分区数据不平衡，建议检查分区键策略");
        }
        
        // 检查Segment大小
        boolean hasLargeSegments = analyses.stream()
            .anyMatch(analysis -> analysis.getSegmentCount() > 50);
        
        if (hasLargeSegments) {
            needOptimization = true;
            recommendations.add("部分分区Segment数量过多，建议调整Segment大小");
            suggestedConfig.put("log.segment.bytes", 2L * 1024 * 1024 * 1024); // 2GB
        }
        
        // 检查订单大小
        double avgOrderSize = analyses.stream()
            .mapToDouble(PartitionAnalysis::getAvgOrderSize)
            .average().orElse(0);
        
        if (avgOrderSize > 10 * 1024) { // 大于10KB
            recommendations.add("平均订单大小较大，建议启用压缩");
            suggestedConfig.put("compression.type", "lz4");
        }
        
        if (recommendations.isEmpty()) {
            recommendations.add("存储配置良好，无需优化");
        }
        
        return new StorageRecommendation(needOptimization, recommendations, suggestedConfig);
    }
    
    /**
     * 生成订单存储分析报告
     */
    public String generateOrderStorageReport(OrderStorageAnalysisResult result) {
        StringBuilder report = new StringBuilder();
        report.append("=== 电商订单存储分析报告 ===\n");
        report.append(String.format("Topic: %s\n", result.getTopicName()));
        report.append(String.format("总订单数: %,d\n", result.getTotalOrders()));
        report.append(String.format("总存储大小: %.2f GB\n", result.getTotalStorageSize() / 1024));
        report.append(String.format("分区数量: %d\n\n", result.getPartitionCount()));
        
        // 分区详情
        report.append("=== 分区存储详情 ===\n");
        result.getPartitionAnalyses().forEach(analysis -> {
            report.append(String.format("分区 %d:\n", analysis.getPartitionId()));
            report.append(String.format("  订单数: %,d\n", analysis.getOrderCount()));
            report.append(String.format("  存储大小: %.2f MB\n", analysis.getStorageSize()));
            report.append(String.format("  Segment数: %d\n", analysis.getSegmentCount()));
            report.append(String.format("  平均订单大小: %.2f bytes\n", analysis.getAvgOrderSize()));
            report.append(String.format("  性能等级: %s\n\n", analysis.getPerformanceLevel()));
        });
        
        // 优化建议
        StorageRecommendation recommendation = result.getRecommendation();
        report.append("=== 优化建议 ===\n");
        report.append(String.format("需要优化: %s\n", recommendation.isNeedOptimization() ? "是" : "否"));
        
        recommendation.getRecommendations().forEach(rec -> 
            report.append(String.format("- %s\n", rec)));
        
        if (!recommendation.getSuggestedConfig().isEmpty()) {
            report.append("\n建议配置:\n");
            recommendation.getSuggestedConfig().forEach((key, value) -> 
                report.append(String.format("  %s=%s\n", key, value)));
        }
        
        return report.toString();
    }
}
```

## 6. 实战练习

### 练习1：存储架构分析
1. 分析本地Kafka集群的存储目录结构
2. 统计各Topic的存储大小和分区分布
3. 生成存储使用报告

### 练习2：Segment文件解析
1. 选择一个活跃的Topic分区
2. 解析其Segment文件结构
3. 分析索引文件的利用率

### 练习3：存储配置优化
1. 根据业务场景设计存储配置
2. 对比不同配置的性能影响
3. 实施配置优化并验证效果

## 7. 课后作业

### 作业1：企业级存储监控系统
设计并实现一个Kafka存储监控系统，包括：
- 实时存储使用情况监控
- 存储增长趋势分析
- 自动化存储告警
- 存储优化建议生成

### 作业2：多租户存储隔离方案
设计一个支持多租户的Kafka存储隔离方案，要求：
- 按租户隔离存储目录
- 实现租户级别的配额管理
- 提供租户存储使用统计
- 支持租户级别的存储策略配置

```java
/**
 * 多租户存储隔离管理器
 */
@Component
public class MultiTenantStorageManager {
    
    private static final Logger logger = LoggerFactory.getLogger(MultiTenantStorageManager.class);
    
    /**
     * 租户存储配置
     */
    @Data
    @Builder
    public static class TenantStorageConfig {
        private String tenantId;
        private String storageDir;
        private long quotaBytes;           // 存储配额
        private int maxTopics;             // 最大Topic数
        private int maxPartitionsPerTopic; // 每个Topic最大分区数
        private long retentionMs;          // 数据保留时间
        private String compressionType;    // 压缩类型
        private boolean enableMetrics;     // 是否启用指标收集
    }
    
    /**
     * 租户存储使用情况
     */
    @Data
    @AllArgsConstructor
    public static class TenantStorageUsage {
        private String tenantId;
        private long usedBytes;
        private long quotaBytes;
        private int topicCount;
        private int partitionCount;
        private double utilizationRate;
        private List<String> topicNames;
        private boolean quotaExceeded;
    }
    
    private final Map<String, TenantStorageConfig> tenantConfigs = new ConcurrentHashMap<>();
    
    /**
     * 注册租户存储配置
     */
    public void registerTenant(TenantStorageConfig config) {
        // 验证配置
        validateTenantConfig(config);
        
        // 创建租户存储目录
        createTenantStorageDirectory(config);
        
        // 保存配置
        tenantConfigs.put(config.getTenantId(), config);
        
        logger.info("租户存储配置注册成功: {}", config.getTenantId());
    }
    
    /**
     * 获取租户存储使用情况
     */
    public TenantStorageUsage getTenantStorageUsage(String tenantId) {
        TenantStorageConfig config = tenantConfigs.get(tenantId);
        if (config == null) {
            throw new IllegalArgumentException("租户不存在: " + tenantId);
        }
        
        try {
            Path tenantDir = Paths.get(config.getStorageDir());
            long usedBytes = calculateDirectorySize(tenantDir);
            
            // 统计Topic和分区数量
            List<String> topicNames = new ArrayList<>();
            int partitionCount = 0;
            
            if (Files.exists(tenantDir)) {
                Files.list(tenantDir)
                    .filter(Files::isDirectory)
                    .forEach(topicDir -> {
                        String topicName = extractTopicName(topicDir.getFileName().toString());
                        if (!topicNames.contains(topicName)) {
                            topicNames.add(topicName);
                        }
                    });
                
                partitionCount = (int) Files.list(tenantDir)
                    .filter(Files::isDirectory)
                    .count();
            }
            
            double utilizationRate = config.getQuotaBytes() > 0 ? 
                (double) usedBytes / config.getQuotaBytes() : 0;
            
            boolean quotaExceeded = config.getQuotaBytes() > 0 && usedBytes > config.getQuotaBytes();
            
            return new TenantStorageUsage(
                tenantId, usedBytes, config.getQuotaBytes(),
                topicNames.size(), partitionCount, utilizationRate,
                topicNames, quotaExceeded
            );
            
        } catch (IOException e) {
            logger.error("获取租户存储使用情况失败: {}", tenantId, e);
            throw new RuntimeException("获取租户存储使用情况失败", e);
        }
    }
    
    /**
     * 检查租户配额
     */
    public boolean checkTenantQuota(String tenantId, long additionalBytes) {
        TenantStorageUsage usage = getTenantStorageUsage(tenantId);
        TenantStorageConfig config = tenantConfigs.get(tenantId);
        
        if (config.getQuotaBytes() <= 0) {
            return true; // 无配额限制
        }
        
        return (usage.getUsedBytes() + additionalBytes) <= config.getQuotaBytes();
    }
    
    /**
     * 生成租户存储报告
     */
    public String generateTenantStorageReport() {
        StringBuilder report = new StringBuilder();
        report.append("=== 多租户存储使用报告 ===\n\n");
        
        for (String tenantId : tenantConfigs.keySet()) {
            TenantStorageUsage usage = getTenantStorageUsage(tenantId);
            TenantStorageConfig config = tenantConfigs.get(tenantId);
            
            report.append(String.format("租户: %s\n", tenantId));
            report.append(String.format("  存储目录: %s\n", config.getStorageDir()));
            report.append(String.format("  已用存储: %.2f MB\n", usage.getUsedBytes() / (1024.0 * 1024.0)));
            
            if (config.getQuotaBytes() > 0) {
                report.append(String.format("  存储配额: %.2f MB\n", config.getQuotaBytes() / (1024.0 * 1024.0)));
                report.append(String.format("  利用率: %.2f%%\n", usage.getUtilizationRate() * 100));
                report.append(String.format("  配额状态: %s\n", usage.isQuotaExceeded() ? "超额" : "正常"));
            }
            
            report.append(String.format("  Topic数量: %d/%d\n", usage.getTopicCount(), config.getMaxTopics()));
            report.append(String.format("  分区数量: %d\n", usage.getPartitionCount()));
            report.append(String.format("  数据保留: %d 天\n", config.getRetentionMs() / (24 * 60 * 60 * 1000L)));
            report.append(String.format("  压缩类型: %s\n", config.getCompressionType()));
            
            if (!usage.getTopicNames().isEmpty()) {
                report.append("  Topic列表:\n");
                usage.getTopicNames().forEach(topic -> 
                    report.append(String.format("    - %s\n", topic)));
            }
            
            report.append("\n");
        }
        
        return report.toString();
    }
    
    /**
     * 验证租户配置
     */
    private void validateTenantConfig(TenantStorageConfig config) {
        if (config.getTenantId() == null || config.getTenantId().trim().isEmpty()) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        
        if (config.getStorageDir() == null || config.getStorageDir().trim().isEmpty()) {
            throw new IllegalArgumentException("存储目录不能为空");
        }
        
        if (config.getQuotaBytes() < 0) {
            throw new IllegalArgumentException("存储配额不能为负数");
        }
        
        if (config.getMaxTopics() <= 0) {
            throw new IllegalArgumentException("最大Topic数必须大于0");
        }
    }
    
    /**
     * 创建租户存储目录
     */
    private void createTenantStorageDirectory(TenantStorageConfig config) {
        try {
            Path tenantDir = Paths.get(config.getStorageDir());
            if (!Files.exists(tenantDir)) {
                Files.createDirectories(tenantDir);
                logger.info("创建租户存储目录: {}", tenantDir);
            }
        } catch (IOException e) {
            throw new RuntimeException("创建租户存储目录失败", e);
        }
    }
    
    /**
     * 计算目录大小
     */
    private long calculateDirectorySize(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return 0;
        }
        
        return Files.walk(directory)
            .filter(Files::isRegularFile)
            .mapToLong(file -> {
                try {
                    return Files.size(file);
                } catch (IOException e) {
                    return 0L;
                }
            })
            .sum();
    }
    
    /**
     * 提取Topic名称
     */
    private String extractTopicName(String dirName) {
        if (dirName.matches(".+-\\d+")) {
            int lastDashIndex = dirName.lastIndexOf('-');
            return dirName.substring(0, lastDashIndex);
        }
        return dirName;
    }
}
```

## 8. 课程总结

### 8.1 核心知识点回顾

1. **Kafka存储架构**
   - 三层存储结构：Topic → Partition → Segment
   - 每个Segment包含.log、.index、.timeindex文件
   - 存储目录的组织和管理方式

2. **日志文件结构**
   - 消息批次的存储格式
   - 消息记录的内部结构
   - 文件滚动和管理机制

3. **索引机制**
   - 偏移量索引：快速定位消息位置
   - 时间戳索引：基于时间的消息检索
   - 索引文件的稀疏特性和查找算法

4. **存储配置优化**
   - 不同场景的配置策略
   - 性能与存储空间的平衡
   - 配置参数的影响和调优方法

### 8.2 最佳实践总结

1. **存储规划**
   - 根据数据量和保留期规划存储容量
   - 合理设置Segment大小和滚动策略
   - 考虑多磁盘分布以提高I/O性能

2. **配置优化**
   - 高吞吐场景：增大Segment大小，启用压缩
   - 低延迟场景：减小刷盘间隔，使用SSD存储
   - 长期存储：启用日志压缩，优化清理策略

3. **监控和维护**
   - 定期监控存储使用情况
   - 及时清理过期数据
   - 监控索引文件利用率

### 8.3 常见问题和解决方案

1. **存储空间不足**
   - 调整日志保留策略
   - 启用数据压缩
   - 增加存储容量或清理历史数据

2. **读写性能问题**
   - 优化Segment大小配置
   - 使用多个日志目录分散I/O
   - 调整索引间隔参数

3. **数据恢复问题**
   - 理解日志文件结构
   - 使用Kafka提供的恢复工具
   - 建立完善的备份策略

### 8.4 进阶学习方向

1. **深入源码研究**
   - 研究Kafka存储层源码实现
   - 理解日志管理器的工作原理
   - 学习索引构建和维护机制

2. **性能调优实践**
   - 基于实际业务场景进行性能测试
   - 分析不同配置对性能的影响
   - 建立性能监控和告警体系

3. **企业级应用**
   - 设计多租户存储隔离方案
   - 实现自动化存储管理
   - 集成企业级监控和运维平台

通过本课程的学习，你应该已经掌握了Kafka存储机制的核心原理和实践技能。这些知识将为你在实际项目中优化Kafka性能、解决存储相关问题提供坚实的基础。

---

**下节预告**：第4天我们将学习Kafka的复制机制，包括Leader-Follower模型、ISR机制、数据一致性保证等核心内容。