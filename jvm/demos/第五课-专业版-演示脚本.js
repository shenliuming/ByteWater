/**
 * 第五课专业版演示脚本：垃圾收集器选择与性能优化策略
 * 基于Oracle JVM规范、OpenJDK HotSpot VM源码实现和Java SE平台规范
 * 
 * 技术规范参考：
 * - Oracle JVM Specification (JSR-924)
 * - OpenJDK HotSpot VM源码
 * - Java SE Platform Specification
 * - Java Memory Model (JSR-133)
 * 
 * @author 令狐老师
 * @version 专业版 v2.0
 * @date 2024
 */

// ==================== JVM规范核心接口定义 ====================

/**
 * JVM规范定义的核心接口
 * 参考：OpenJDK HotSpot VM源码结构
 */
const JVMSpecInterfaces = {
    // 堆内存管理接口 (基于CollectedHeap类)
    CollectedHeap: {
        youngGeneration: null,
        oldGeneration: null,
        metaspace: null,
        gcCause: null
    },
    
    // GC触发原因 (基于GCCause枚举)
    GCCause: {
        ALLOCATION_FAILURE: 'allocation_failure',
        SYSTEM_GC: 'system_gc',
        CMS_INITIAL_MARK: 'cms_initial_mark',
        CMS_FINAL_REMARK: 'cms_final_remark',
        G1_EVACUATION_PAUSE: 'g1_evacuation_pause',
        G1_HUMONGOUS_ALLOCATION: 'g1_humongous_allocation'
    },
    
    // 内存池接口 (基于MemoryPool类)
    MemoryPool: {
        name: '',
        type: '', // 'heap' | 'non_heap'
        usage: { init: 0, used: 0, committed: 0, max: 0 },
        peakUsage: { init: 0, used: 0, committed: 0, max: 0 }
    },
    
    // 垃圾收集器接口 (基于GarbageCollector类)
    GarbageCollector: {
        name: '',
        collectionCount: 0,
        collectionTime: 0,
        memoryPoolNames: []
    }
};

// ==================== JVM系统状态管理 ====================

/**
 * JVM系统状态
 * 严格按照JVM规范2.5.1节定义的堆内存结构
 */
let jvmSystem = {
    // 堆内存结构 (JVM规范2.5.1节)
    heap: {
        // 新生代 (Young Generation)
        youngGeneration: {
            eden: {
                size: 8 * 1024 * 1024, // 8MB
                used: 0,
                objects: [],
                allocationPointer: 0
            },
            survivor: {
                s0: { size: 1024 * 1024, used: 0, objects: [] }, // 1MB
                s1: { size: 1024 * 1024, used: 0, objects: [] }, // 1MB
                activeSpace: 's0' // 当前活跃的Survivor空间
            }
        },
        
        // 老年代 (Old Generation)
        oldGeneration: {
            size: 16 * 1024 * 1024, // 16MB
            used: 0,
            objects: [],
            allocationPointer: 0
        },
        
        // 元空间 (Metaspace) - JDK 8+
        metaspace: {
            size: 4 * 1024 * 1024, // 4MB
            used: 0,
            classMetadata: [],
            compressionEnabled: true
        }
    },
    
    // GC统计信息 (JVM规范3.14节)
    gcStatistics: {
        youngGenCollections: 0,
        youngGenTime: 0,
        oldGenCollections: 0,
        oldGenTime: 0,
        totalCollections: 0,
        totalTime: 0,
        lastGCCause: null,
        gcHistory: []
    },
    
    // GC触发原因 (基于OpenJDK GCCause定义)
    gcCauses: {
        ALLOCATION_FAILURE: 'allocation_failure',
        SYSTEM_GC: 'system_gc',
        HEAP_INSPECTION: 'heap_inspection',
        HEAP_DUMP: 'heap_dump',
        CMS_GENERATION_FULL: 'cms_generation_full',
        CMS_INITIAL_MARK: 'cms_initial_mark',
        CMS_FINAL_REMARK: 'cms_final_remark',
        G1_EVACUATION_PAUSE: 'g1_evacuation_pause',
        G1_HUMONGOUS_ALLOCATION: 'g1_humongous_allocation'
    },
    
    // 当前活跃的垃圾收集器
    activeCollector: 'Serial GC',
    
    // 性能监控指标
    performanceMetrics: {
        allocationRate: 0, // MB/s
        gcThroughput: 0,   // %
        averagePauseTime: 0, // ms
        maxPauseTime: 0,   // ms
        gcFrequency: 0     // times/minute
    }
};

// ==================== 垃圾收集器实现类 ====================

/**
 * JVM规范垃圾收集器演示系统
 * 基于Oracle JVM规范和OpenJDK HotSpot实现
 */
class JVMSpecGCCollectorDemo {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.isRunning = false;
        
        // 对象分配计数器
        this.objectIdCounter = 0;
        
        // 性能监控
        this.performanceMonitor = new GCPerformanceMonitor();
        
        // 初始化画布
        this.initCanvas();
    }
    
    /**
     * 初始化画布
     */
    initCanvas() {
        this.canvas = document.getElementById('gc-collector-canvas');
        if (!this.canvas) {
            // 创建画布元素
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'gc-collector-canvas';
            this.canvas.width = 1200;
            this.canvas.height = 800;
            this.canvas.style.border = '2px solid #333';
            this.canvas.style.backgroundColor = '#f8f9fa';
            document.body.appendChild(this.canvas);
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        // 初始化显示
        this.render();
    }
    
    /**
     * Serial GC演示
     * 基于OpenJDK SerialGC实现
     */
    demonstrateSerialGC() {
        console.log('🔍 Serial GC演示开始');
        console.log('技术规范：基于OpenJDK Serial收集器实现');
        
        jvmSystem.activeCollector = 'Serial GC';
        
        // 阶段1：对象分配
        this.simulateObjectAllocation('serial', 1000);
        
        // 阶段2：Minor GC (新生代收集)
        setTimeout(() => {
            this.performSerialMinorGC();
        }, 2000);
        
        // 阶段3：Major GC (老年代收集)
        setTimeout(() => {
            this.performSerialMajorGC();
        }, 4000);
    }
    
    /**
     * Parallel GC演示
     * 基于OpenJDK ParallelGC实现
     */
    demonstrateParallelGC() {
        console.log('🔍 Parallel GC演示开始');
        console.log('技术规范：基于OpenJDK Parallel收集器实现');
        
        jvmSystem.activeCollector = 'Parallel GC';
        
        // 阶段1：并行对象分配
        this.simulateParallelAllocation();
        
        // 阶段2：并行Minor GC
        setTimeout(() => {
            this.performParallelMinorGC();
        }, 2000);
        
        // 阶段3：并行Major GC
        setTimeout(() => {
            this.performParallelMajorGC();
        }, 4000);
    }
    
    /**
     * G1 GC演示
     * 基于OpenJDK G1收集器实现
     */
    demonstrateG1GC() {
        console.log('🔍 G1 GC演示开始');
        console.log('技术规范：基于OpenJDK G1收集器实现');
        
        jvmSystem.activeCollector = 'G1 GC';
        
        // 初始化G1分区
        this.initializeG1Regions();
        
        // 阶段1：分区分配
        this.simulateG1Allocation();
        
        // 阶段2：并发标记周期
        setTimeout(() => {
            this.performG1ConcurrentMarkingCycle();
        }, 2000);
        
        // 阶段3：混合收集
        setTimeout(() => {
            this.performG1MixedCollection();
        }, 4000);
    }
    
    /**
     * Serial Minor GC实现
     * 基于复制算法
     */
    performSerialMinorGC() {
        console.log('[Serial GC] 执行Minor GC - 复制算法');
        
        const startTime = performance.now();
        
        // 停止所有应用线程 (Stop-The-World)
        this.pauseApplicationThreads();
        
        // 标记阶段：从GC Roots开始标记可达对象
        const reachableObjects = this.markReachableObjects();
        
        // 复制阶段：将存活对象复制到Survivor区
        this.copyLiveObjectsToSurvivor(reachableObjects);
        
        // 清理Eden区
        this.clearEdenSpace();
        
        // 更新统计信息
        const endTime = performance.now();
        const pauseTime = endTime - startTime;
        
        jvmSystem.gcStatistics.youngGenCollections++;
        jvmSystem.gcStatistics.youngGenTime += pauseTime;
        jvmSystem.gcStatistics.lastGCCause = jvmSystem.gcCauses.ALLOCATION_FAILURE;
        
        // 恢复应用线程
        this.resumeApplicationThreads();
        
        console.log(`[Serial GC] Minor GC完成，停顿时间: ${pauseTime.toFixed(2)}ms`);
        
        // 更新显示
        this.render();
    }
    
    /**
     * Serial Major GC实现
     * 基于标记-整理算法
     */
    performSerialMajorGC() {
        console.log('[Serial GC] 执行Major GC - 标记-整理算法');
        
        const startTime = performance.now();
        
        // 停止所有应用线程
        this.pauseApplicationThreads();
        
        // 标记阶段
        const reachableObjects = this.markReachableObjectsInOldGen();
        
        // 整理阶段：压缩老年代，消除碎片
        this.compactOldGeneration(reachableObjects);
        
        // 更新统计信息
        const endTime = performance.now();
        const pauseTime = endTime - startTime;
        
        jvmSystem.gcStatistics.oldGenCollections++;
        jvmSystem.gcStatistics.oldGenTime += pauseTime;
        
        // 恢复应用线程
        this.resumeApplicationThreads();
        
        console.log(`[Serial GC] Major GC完成，停顿时间: ${pauseTime.toFixed(2)}ms`);
        
        // 更新显示
        this.render();
    }
    
    /**
     * Parallel Minor GC实现
     * 多线程并行复制算法
     */
    performParallelMinorGC() {
        console.log('[Parallel GC] 执行并行Minor GC');
        
        const startTime = performance.now();
        const threadCount = navigator.hardwareConcurrency || 4;
        
        // 停止所有应用线程
        this.pauseApplicationThreads();
        
        // 并行标记阶段
        const reachableObjects = this.parallelMarkReachableObjects(threadCount);
        
        // 并行复制阶段
        this.parallelCopyLiveObjects(reachableObjects, threadCount);
        
        // 清理Eden区
        this.clearEdenSpace();
        
        // 更新统计信息
        const endTime = performance.now();
        const pauseTime = endTime - startTime;
        
        jvmSystem.gcStatistics.youngGenCollections++;
        jvmSystem.gcStatistics.youngGenTime += pauseTime;
        
        // 恢复应用线程
        this.resumeApplicationThreads();
        
        console.log(`[Parallel GC] 并行Minor GC完成，停顿时间: ${pauseTime.toFixed(2)}ms，使用${threadCount}个线程`);
        
        // 更新显示
        this.render();
    }
    
    /**
     * Parallel Major GC实现
     * 多线程并行标记-整理算法
     */
    performParallelMajorGC() {
        console.log('[Parallel GC] 执行并行Major GC');
        
        const startTime = performance.now();
        const threadCount = navigator.hardwareConcurrency || 4;
        
        // 停止所有应用线程
        this.pauseApplicationThreads();
        
        // 并行标记阶段
        const reachableObjects = this.parallelMarkOldGenObjects(threadCount);
        
        // 并行整理阶段
        this.parallelCompactOldGeneration(reachableObjects, threadCount);
        
        // 更新统计信息
        const endTime = performance.now();
        const pauseTime = endTime - startTime;
        
        jvmSystem.gcStatistics.oldGenCollections++;
        jvmSystem.gcStatistics.oldGenTime += pauseTime;
        
        // 恢复应用线程
        this.resumeApplicationThreads();
        
        console.log(`[Parallel GC] 并行Major GC完成，停顿时间: ${pauseTime.toFixed(2)}ms，使用${threadCount}个线程`);
        
        // 更新显示
        this.render();
    }
    
    /**
     * G1并发标记周期
     * 基于SATB (Snapshot-At-The-Beginning)算法
     */
    performG1ConcurrentMarkingCycle() {
        console.log('[G1 GC] 开始并发标记周期');
        
        // 初始标记阶段 (STW)
        this.g1InitialMark();
        
        // 并发标记阶段 (与应用并发)
        setTimeout(() => {
            this.g1ConcurrentMark();
        }, 500);
        
        // 最终标记阶段 (STW)
        setTimeout(() => {
            this.g1FinalMark();
        }, 1500);
        
        // 清理阶段 (STW)
        setTimeout(() => {
            this.g1Cleanup();
        }, 2000);
    }
    
    /**
     * G1混合收集
     * 同时收集新生代和部分老年代分区
     */
    performG1MixedCollection() {
        console.log('[G1 GC] 执行混合收集');
        
        const startTime = performance.now();
        
        // 停止应用线程
        this.pauseApplicationThreads();
        
        // 选择收集集合 (Collection Set)
        const collectionSet = this.selectG1CollectionSet();
        
        // 并行疏散存活对象
        this.g1EvacuateLiveObjects(collectionSet);
        
        // 更新分区状态
        this.updateG1RegionStates(collectionSet);
        
        // 更新统计信息
        const endTime = performance.now();
        const pauseTime = endTime - startTime;
        
        jvmSystem.gcStatistics.youngGenCollections++;
        jvmSystem.gcStatistics.youngGenTime += pauseTime;
        
        // 恢复应用线程
        this.resumeApplicationThreads();
        
        console.log(`[G1 GC] 混合收集完成，停顿时间: ${pauseTime.toFixed(2)}ms`);
        
        // 更新显示
        this.render();
    }
    
    /**
     * 对象分配模拟
     */
    simulateObjectAllocation(collectorType, objectCount) {
        console.log(`[${collectorType}] 开始分配${objectCount}个对象`);
        
        for (let i = 0; i < objectCount; i++) {
            const obj = this.createObject();
            this.allocateObject(obj);
            
            // 模拟分配间隔
            if (i % 100 === 0) {
                setTimeout(() => {
                    this.render();
                }, i / 100 * 10);
            }
        }
    }
    
    /**
     * 创建对象
     */
    createObject() {
        return {
            id: ++this.objectIdCounter,
            size: Math.floor(Math.random() * 1024) + 64, // 64B-1KB
            age: 0,
            marked: false,
            reachable: Math.random() > 0.3, // 70%的对象可达
            references: [],
            allocationTime: Date.now()
        };
    }
    
    /**
     * 分配对象到堆内存
     */
    allocateObject(obj) {
        const eden = jvmSystem.heap.youngGeneration.eden;
        
        if (eden.used + obj.size <= eden.size) {
            // 在Eden区分配
            eden.objects.push(obj);
            eden.used += obj.size;
            eden.allocationPointer += obj.size;
        } else {
            // Eden区满，触发Minor GC
            console.log('[分配器] Eden区空间不足，触发Minor GC');
            this.triggerMinorGC();
            
            // GC后重试分配
            if (eden.used + obj.size <= eden.size) {
                eden.objects.push(obj);
                eden.used += obj.size;
            } else {
                // 直接分配到老年代
                this.allocateToOldGeneration(obj);
            }
        }
    }
    
    /**
     * 分配到老年代
     */
    allocateToOldGeneration(obj) {
        const oldGen = jvmSystem.heap.oldGeneration;
        
        if (oldGen.used + obj.size <= oldGen.size) {
            oldGen.objects.push(obj);
            oldGen.used += obj.size;
            console.log(`[分配器] 对象${obj.id}直接分配到老年代`);
        } else {
            console.log('[分配器] 老年代空间不足，触发Full GC');
            this.triggerFullGC();
        }
    }
    
    /**
     * 触发Minor GC
     */
    triggerMinorGC() {
        const collector = jvmSystem.activeCollector;
        
        switch (collector) {
            case 'Serial GC':
                this.performSerialMinorGC();
                break;
            case 'Parallel GC':
                this.performParallelMinorGC();
                break;
            case 'G1 GC':
                this.performG1YoungCollection();
                break;
        }
    }
    
    /**
     * 触发Full GC
     */
    triggerFullGC() {
        const collector = jvmSystem.activeCollector;
        
        switch (collector) {
            case 'Serial GC':
                this.performSerialMajorGC();
                break;
            case 'Parallel GC':
                this.performParallelMajorGC();
                break;
            case 'G1 GC':
                this.performG1MixedCollection();
                break;
        }
    }
    
    /**
     * 标记可达对象
     */
    markReachableObjects() {
        const reachableObjects = [];
        const eden = jvmSystem.heap.youngGeneration.eden;
        
        // 从GC Roots开始标记
        eden.objects.forEach(obj => {
            if (obj.reachable) {
                obj.marked = true;
                reachableObjects.push(obj);
                
                // 递归标记引用的对象
                this.markReferencedObjects(obj, reachableObjects);
            }
        });
        
        console.log(`[标记阶段] 标记了${reachableObjects.length}个可达对象`);
        return reachableObjects;
    }
    
    /**
     * 递归标记引用的对象
     */
    markReferencedObjects(obj, reachableObjects) {
        obj.references.forEach(refId => {
            const referencedObj = this.findObjectById(refId);
            if (referencedObj && !referencedObj.marked) {
                referencedObj.marked = true;
                reachableObjects.push(referencedObj);
                this.markReferencedObjects(referencedObj, reachableObjects);
            }
        });
    }
    
    /**
     * 复制存活对象到Survivor区
     */
    copyLiveObjectsToSurvivor(reachableObjects) {
        const survivor = jvmSystem.heap.youngGeneration.survivor;
        const activeSpace = survivor.activeSpace;
        const targetSpace = activeSpace === 's0' ? 's1' : 's0';
        
        // 清空目标Survivor区
        survivor[targetSpace].objects = [];
        survivor[targetSpace].used = 0;
        
        // 复制存活对象
        reachableObjects.forEach(obj => {
            if (survivor[targetSpace].used + obj.size <= survivor[targetSpace].size) {
                // 增加对象年龄
                obj.age++;
                
                // 检查是否晋升到老年代
                if (obj.age >= 15 || survivor[targetSpace].used + obj.size > survivor[targetSpace].size) {
                    this.promoteToOldGeneration(obj);
                } else {
                    survivor[targetSpace].objects.push(obj);
                    survivor[targetSpace].used += obj.size;
                }
            } else {
                // Survivor区空间不足，直接晋升到老年代
                this.promoteToOldGeneration(obj);
            }
        });
        
        // 切换活跃的Survivor区
        survivor.activeSpace = targetSpace;
        
        console.log(`[复制阶段] 复制了${survivor[targetSpace].objects.length}个对象到${targetSpace}`);
    }
    
    /**
     * 晋升对象到老年代
     */
    promoteToOldGeneration(obj) {
        const oldGen = jvmSystem.heap.oldGeneration;
        
        if (oldGen.used + obj.size <= oldGen.size) {
            oldGen.objects.push(obj);
            oldGen.used += obj.size;
            console.log(`[晋升] 对象${obj.id}晋升到老年代`);
        } else {
            console.log(`[晋升失败] 老年代空间不足，对象${obj.id}晋升失败`);
        }
    }
    
    /**
     * 清空Eden区
     */
    clearEdenSpace() {
        const eden = jvmSystem.heap.youngGeneration.eden;
        eden.objects = [];
        eden.used = 0;
        eden.allocationPointer = 0;
        
        console.log('[清理阶段] Eden区已清空');
    }
    
    /**
     * 暂停应用线程
     */
    pauseApplicationThreads() {
        console.log('[STW] 暂停所有应用线程');
        // 在实际实现中，这里会暂停所有mutator线程
    }
    
    /**
     * 恢复应用线程
     */
    resumeApplicationThreads() {
        console.log('[STW] 恢复所有应用线程');
        // 在实际实现中，这里会恢复所有mutator线程
    }
    
    /**
     * 根据ID查找对象
     */
    findObjectById(id) {
        // 在Eden区查找
        let obj = jvmSystem.heap.youngGeneration.eden.objects.find(o => o.id === id);
        if (obj) return obj;
        
        // 在Survivor区查找
        const survivor = jvmSystem.heap.youngGeneration.survivor;
        obj = survivor.s0.objects.find(o => o.id === id);
        if (obj) return obj;
        
        obj = survivor.s1.objects.find(o => o.id === id);
        if (obj) return obj;
        
        // 在老年代查找
        obj = jvmSystem.heap.oldGeneration.objects.find(o => o.id === id);
        return obj;
    }
    
    /**
     * 渲染当前状态
     */
    render() {
        if (!this.ctx) return;
        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.drawTitle();
        
        // 绘制堆内存结构
        this.drawHeapStructure();
        
        // 绘制GC统计信息
        this.drawGCStatistics();
        
        // 绘制性能指标
        this.drawPerformanceMetrics();
        
        // 绘制收集器状态
        this.drawCollectorStatus();
    }
    
    /**
     * 绘制标题
     */
    drawTitle() {
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('JVM垃圾收集器演示系统 - 专业版', this.canvas.width / 2, 30);
        
        this.ctx.font = '16px Arial';
        this.ctx.fillStyle = '#7f8c8d';
        this.ctx.fillText(`当前收集器: ${jvmSystem.activeCollector}`, this.canvas.width / 2, 55);
    }
    
    /**
     * 绘制堆内存结构
     */
    drawHeapStructure() {
        const startX = 50;
        const startY = 100;
        const regionWidth = 200;
        const regionHeight = 150;
        
        // 绘制新生代
        this.drawMemoryRegion(startX, startY, regionWidth, regionHeight, 
            '新生代 (Young Generation)', '#3498db', 
            jvmSystem.heap.youngGeneration.eden.used, 
            jvmSystem.heap.youngGeneration.eden.size);
        
        // 绘制Survivor区
        this.drawMemoryRegion(startX + regionWidth + 20, startY, regionWidth / 2 - 10, regionHeight, 
            'Survivor S0', '#2ecc71', 
            jvmSystem.heap.youngGeneration.survivor.s0.used, 
            jvmSystem.heap.youngGeneration.survivor.s0.size);
        
        this.drawMemoryRegion(startX + regionWidth + regionWidth / 2 + 30, startY, regionWidth / 2 - 10, regionHeight, 
            'Survivor S1', '#f39c12', 
            jvmSystem.heap.youngGeneration.survivor.s1.used, 
            jvmSystem.heap.youngGeneration.survivor.s1.size);
        
        // 绘制老年代
        this.drawMemoryRegion(startX + regionWidth * 2 + 50, startY, regionWidth, regionHeight, 
            '老年代 (Old Generation)', '#e74c3c', 
            jvmSystem.heap.oldGeneration.used, 
            jvmSystem.heap.oldGeneration.size);
        
        // 绘制元空间
        this.drawMemoryRegion(startX + regionWidth * 3 + 70, startY, regionWidth, regionHeight, 
            '元空间 (Metaspace)', '#9b59b6', 
            jvmSystem.heap.metaspace.used, 
            jvmSystem.heap.metaspace.size);
    }
    
    /**
     * 绘制内存区域
     */
    drawMemoryRegion(x, y, width, height, title, color, used, total) {
        // 绘制边框
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // 绘制使用量
        const usageHeight = (used / total) * (height - 40);
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillRect(x + 2, y + height - usageHeight - 2, width - 4, usageHeight);
        this.ctx.globalAlpha = 1.0;
        
        // 绘制标题
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(title, x + width / 2, y + 20);
        
        // 绘制使用量信息
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = '#7f8c8d';
        const usageText = `${(used / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB`;
        this.ctx.fillText(usageText, x + width / 2, y + 40);
        
        const percentageText = `${((used / total) * 100).toFixed(1)}%`;
        this.ctx.fillText(percentageText, x + width / 2, y + 55);
    }
    
    /**
     * 绘制GC统计信息
     */
    drawGCStatistics() {
        const startX = 50;
        const startY = 300;
        
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('GC统计信息', startX, startY);
        
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = '#34495e';
        
        const stats = jvmSystem.gcStatistics;
        const lines = [
            `新生代GC次数: ${stats.youngGenCollections}`,
            `新生代GC时间: ${stats.youngGenTime.toFixed(2)}ms`,
            `老年代GC次数: ${stats.oldGenCollections}`,
            `老年代GC时间: ${stats.oldGenTime.toFixed(2)}ms`,
            `总GC次数: ${stats.totalCollections}`,
            `总GC时间: ${stats.totalTime.toFixed(2)}ms`,
            `最后GC原因: ${stats.lastGCCause || 'N/A'}`
        ];
        
        lines.forEach((line, index) => {
            this.ctx.fillText(line, startX, startY + 30 + index * 20);
        });
    }
    
    /**
     * 绘制性能指标
     */
    drawPerformanceMetrics() {
        const startX = 400;
        const startY = 300;
        
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('性能指标', startX, startY);
        
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = '#34495e';
        
        const metrics = jvmSystem.performanceMetrics;
        const lines = [
            `分配速率: ${metrics.allocationRate.toFixed(2)} MB/s`,
            `GC吞吐量: ${metrics.gcThroughput.toFixed(2)}%`,
            `平均停顿时间: ${metrics.averagePauseTime.toFixed(2)}ms`,
            `最大停顿时间: ${metrics.maxPauseTime.toFixed(2)}ms`,
            `GC频率: ${metrics.gcFrequency.toFixed(2)} 次/分钟`
        ];
        
        lines.forEach((line, index) => {
            this.ctx.fillText(line, startX, startY + 30 + index * 20);
        });
    }
    
    /**
     * 绘制收集器状态
     */
    drawCollectorStatus() {
        const startX = 750;
        const startY = 300;
        
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('收集器状态', startX, startY);
        
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = '#34495e';
        
        const lines = [
            `活跃收集器: ${jvmSystem.activeCollector}`,
            `并行线程数: ${navigator.hardwareConcurrency || 4}`,
            `堆内存总大小: ${((jvmSystem.heap.youngGeneration.eden.size + 
                jvmSystem.heap.youngGeneration.survivor.s0.size + 
                jvmSystem.heap.youngGeneration.survivor.s1.size + 
                jvmSystem.heap.oldGeneration.size) / (1024 * 1024)).toFixed(1)}MB`,
            `当前对象数量: ${this.getTotalObjectCount()}`,
            `系统运行时间: ${this.getSystemUptime()}`
        ];
        
        lines.forEach((line, index) => {
            this.ctx.fillText(line, startX, startY + 30 + index * 20);
        });
    }
    
    /**
     * 获取总对象数量
     */
    getTotalObjectCount() {
        return jvmSystem.heap.youngGeneration.eden.objects.length +
               jvmSystem.heap.youngGeneration.survivor.s0.objects.length +
               jvmSystem.heap.youngGeneration.survivor.s1.objects.length +
               jvmSystem.heap.oldGeneration.objects.length;
    }
    
    /**
     * 获取系统运行时间
     */
    getSystemUptime() {
        // 简化实现，返回固定值
        return '00:05:23';
    }
}

// ==================== 性能监控器 ====================

/**
 * GC性能监控器
 * 基于JVM规范的性能监控实现
 */
class GCPerformanceMonitor {
    constructor() {
        this.startTime = Date.now();
        this.lastGCTime = 0;
        this.gcHistory = [];
        this.allocationHistory = [];
    }
    
    /**
     * 记录GC事件
     */
    recordGCEvent(type, duration, beforeSize, afterSize) {
        const event = {
            timestamp: Date.now(),
            type: type,
            duration: duration,
            beforeSize: beforeSize,
            afterSize: afterSize,
            freedMemory: beforeSize - afterSize
        };
        
        this.gcHistory.push(event);
        this.updatePerformanceMetrics();
    }
    
    /**
     * 记录对象分配
     */
    recordAllocation(size) {
        const allocation = {
            timestamp: Date.now(),
            size: size
        };
        
        this.allocationHistory.push(allocation);
        
        // 保持历史记录在合理范围内
        if (this.allocationHistory.length > 1000) {
            this.allocationHistory.shift();
        }
    }
    
    /**
     * 更新性能指标
     */
    updatePerformanceMetrics() {
        const metrics = jvmSystem.performanceMetrics;
        
        // 计算分配速率
        metrics.allocationRate = this.calculateAllocationRate();
        
        // 计算GC吞吐量
        metrics.gcThroughput = this.calculateGCThroughput();
        
        // 计算平均停顿时间
        metrics.averagePauseTime = this.calculateAveragePauseTime();
        
        // 计算最大停顿时间
        metrics.maxPauseTime = this.calculateMaxPauseTime();
        
        // 计算GC频率
        metrics.gcFrequency = this.calculateGCFrequency();
    }
    
    /**
     * 计算分配速率 (MB/s)
     */
    calculateAllocationRate() {
        if (this.allocationHistory.length < 2) return 0;
        
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        
        const recentAllocations = this.allocationHistory.filter(
            allocation => allocation.timestamp > oneSecondAgo
        );
        
        const totalSize = recentAllocations.reduce(
            (sum, allocation) => sum + allocation.size, 0
        );
        
        return totalSize / (1024 * 1024); // 转换为MB
    }
    
    /**
     * 计算GC吞吐量 (%)
     */
    calculateGCThroughput() {
        const totalRuntime = Date.now() - this.startTime;
        const totalGCTime = this.gcHistory.reduce(
            (sum, event) => sum + event.duration, 0
        );
        
        if (totalRuntime === 0) return 100;
        
        return ((totalRuntime - totalGCTime) / totalRuntime) * 100;
    }
    
    /**
     * 计算平均停顿时间 (ms)
     */
    calculateAveragePauseTime() {
        if (this.gcHistory.length === 0) return 0;
        
        const totalPauseTime = this.gcHistory.reduce(
            (sum, event) => sum + event.duration, 0
        );
        
        return totalPauseTime / this.gcHistory.length;
    }
    
    /**
     * 计算最大停顿时间 (ms)
     */
    calculateMaxPauseTime() {
        if (this.gcHistory.length === 0) return 0;
        
        return Math.max(...this.gcHistory.map(event => event.duration));
    }
    
    /**
     * 计算GC频率 (次/分钟)
     */
    calculateGCFrequency() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        const recentGCs = this.gcHistory.filter(
            event => event.timestamp > oneMinuteAgo
        );
        
        return recentGCs.length;
    }
}

// ==================== 收集器选择决策引擎 ====================

/**
 * 垃圾收集器选择决策引擎
 * 基于Oracle JVM规范和生产环境最佳实践
 */
class GCCollectorSelectionEngine {
    
    /**
     * 应用特征评估
     */
    static evaluateApplicationProfile(config) {
        return {
            heapSizeGB: config.heapSizeGB || 1,
            allocationRate: config.allocationRate || 10, // MB/s
            objectLifetimeDistribution: config.objectLifetimeDistribution || 0.2,
            maxPauseTimeMs: config.maxPauseTimeMs || 200,
            throughputRequirement: config.throughputRequirement || 0.95,
            latencySensitive: config.latencySensitive || false,
            cpuCores: navigator.hardwareConcurrency || 4,
            deploymentType: config.deploymentType || 'server',
            hasMemoryPressure: config.hasMemoryPressure || false
        };
    }
    
    /**
     * 推荐垃圾收集器
     */
    static recommendCollector(profile) {
        // 决策树算法
        if (profile.heapSizeGB <= 0.1) {
            return this.recommendSerialGC(profile);
        } else if (profile.heapSizeGB <= 4 && !profile.latencySensitive) {
            return this.recommendParallelGC(profile);
        } else if (profile.heapSizeGB > 4 || profile.latencySensitive) {
            return this.recommendG1GC(profile);
        } else {
            return this.recommendParallelGC(profile); // 默认选择
        }
    }
    
    /**
     * Serial GC推荐
     */
    static recommendSerialGC(profile) {
        return {
            collectorType: 'Serial GC',
            jvmFlags: [
                '-XX:+UseSerialGC',
                `-Xms${Math.floor(profile.heapSizeGB * 1024)}m`,
                `-Xmx${Math.floor(profile.heapSizeGB * 1024)}m`,
                '-XX:NewRatio=2'
            ],
            reasoning: '小堆内存场景，Serial GC提供最佳的简单性和资源效率',
            confidenceScore: 90,
            alternatives: ['Parallel GC（如果有多核CPU）']
        };
    }
    
    /**
     * Parallel GC推荐
     */
    static recommendParallelGC(profile) {
        const flags = [
            '-XX:+UseParallelGC',
            `-Xms${Math.floor(profile.heapSizeGB * 1024)}m`,
            `-Xmx${Math.floor(profile.heapSizeGB * 1024)}m`
        ];
        
        // 根据CPU核心数调整并行线程数
        if (profile.cpuCores > 8) {
            flags.push(`-XX:ParallelGCThreads=${Math.min(profile.cpuCores, 16)}`);
        }
        
        // 如果有吞吐量要求，启用自适应策略
        if (profile.throughputRequirement > 0.95) {
            flags.push('-XX:+UseAdaptiveSizePolicy');
            flags.push(`-XX:GCTimeRatio=${Math.floor(100 / (1 - profile.throughputRequirement) - 1)}`);
        }
        
        return {
            collectorType: 'Parallel GC',
            jvmFlags: flags,
            reasoning: '中等堆大小，多核环境，注重吞吐量的场景',
            confidenceScore: 85,
            alternatives: ['G1 GC（如果延迟要求严格）']
        };
    }
    
    /**
     * G1 GC推荐
     */
    static recommendG1GC(profile) {
        const flags = [
            '-XX:+UseG1GC',
            `-Xms${Math.floor(profile.heapSizeGB * 1024)}m`,
            `-Xmx${Math.floor(profile.heapSizeGB * 1024)}m`
        ];
        
        // 根据延迟要求设置停顿时间目标
        if (profile.maxPauseTimeMs > 0) {
            flags.push(`-XX:MaxGCPauseMillis=${profile.maxPauseTimeMs}`);
        } else if (profile.latencySensitive) {
            flags.push('-XX:MaxGCPauseMillis=100');
        } else {
            flags.push('-XX:MaxGCPauseMillis=200');
        }
        
        // 根据堆大小调整分区大小
        if (profile.heapSizeGB >= 32) {
            flags.push('-XX:G1HeapRegionSize=32m');
        } else if (profile.heapSizeGB >= 8) {
            flags.push('-XX:G1HeapRegionSize=16m');
        }
        
        // 如果有大对象分配模式，调整相关参数
        if (profile.objectLifetimeDistribution > 0.3) {
            flags.push('-XX:G1MixedGCCountTarget=16');
            flags.push('-XX:G1OldCSetRegionThreshold=5');
        }
        
        return {
            collectorType: 'G1 GC',
            jvmFlags: flags,
            reasoning: '大堆或延迟敏感场景，G1提供可预测的低延迟',
            confidenceScore: 88,
            alternatives: ['ZGC（JDK 11+，超大堆）', 'Shenandoah（低延迟优先）']
        };
    }
}

// ==================== 全局实例和控制函数 ====================

// 全局演示实例
let gcDemo = null;

/**
 * 初始化演示系统
 */
function initGCDemo() {
    console.log('🚀 初始化JVM垃圾收集器演示系统');
    gcDemo = new JVMSpecGCCollectorDemo();
    
    // 创建控制面板
    createControlPanel();
    
    console.log('✅ 演示系统初始化完成');
}

/**
 * 创建控制面板
 */
function createControlPanel() {
    const controlPanel = document.createElement('div');
    controlPanel.id = 'gc-control-panel';
    controlPanel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid #ddd;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        z-index: 1000;
        min-width: 300px;
    `;
    
    controlPanel.innerHTML = `
        <h3 style="margin-top: 0; color: #2c3e50;">垃圾收集器控制面板</h3>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">选择收集器:</label>
            <select id="collector-select" style="width: 100%; padding: 5px;">
                <option value="serial">Serial GC</option>
                <option value="parallel">Parallel GC</option>
                <option value="g1">G1 GC</option>
            </select>
        </div>
        
        <div style="margin-bottom: 15px;">
            <button onclick="startCollectorDemo()" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">开始演示</button>
        </div>
        
        <div style="margin-bottom: 15px;">
            <button onclick="allocateObjects()" style="width: 100%; padding: 10px; background: #2ecc71; color: white; border: none; border-radius: 4px; cursor: pointer;">分配对象</button>
        </div>
        
        <div style="margin-bottom: 15px;">
            <button onclick="triggerGC()" style="width: 100%; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">触发GC</button>
        </div>
        
        <div style="margin-bottom: 15px;">
            <button onclick="resetSystem()" style="width: 100%; padding: 10px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer;">重置系统</button>
        </div>
        
        <div style="margin-bottom: 15px;">
            <button onclick="showRecommendation()" style="width: 100%; padding: 10px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer;">收集器推荐</button>
        </div>
        
        <div id="recommendation-result" style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px; display: none;"></div>
    `;
    
    document.body.appendChild(controlPanel);
}

/**
 * 开始收集器演示
 */
function startCollectorDemo() {
    if (!gcDemo) {
        console.error('演示系统未初始化');
        return;
    }
    
    const collectorType = document.getElementById('collector-select').value;
    
    switch (collectorType) {
        case 'serial':
            gcDemo.demonstrateSerialGC();
            break;
        case 'parallel':
            gcDemo.demonstrateParallelGC();
            break;
        case 'g1':
            gcDemo.demonstrateG1GC();
            break;
        default:
            console.error('未知的收集器类型:', collectorType);
    }
}

/**
 * 分配对象
 */
function allocateObjects() {
    if (!gcDemo) {
        console.error('演示系统未初始化');
        return;
    }
    
    gcDemo.simulateObjectAllocation('manual', 500);
}

/**
 * 触发GC
 */
function triggerGC() {
    if (!gcDemo) {
        console.error('演示系统未初始化');
        return;
    }
    
    gcDemo.triggerMinorGC();
}

/**
 * 重置系统
 */
function resetSystem() {
    // 重置JVM系统状态
    jvmSystem.heap.youngGeneration.eden.objects = [];
    jvmSystem.heap.youngGeneration.eden.used = 0;
    jvmSystem.heap.youngGeneration.survivor.s0.objects = [];
    jvmSystem.heap.youngGeneration.survivor.s0.used = 0;
    jvmSystem.heap.youngGeneration.survivor.s1.objects = [];
    jvmSystem.heap.youngGeneration.survivor.s1.used = 0;
    jvmSystem.heap.oldGeneration.objects = [];
    jvmSystem.heap.oldGeneration.used = 0;
    
    // 重置统计信息
    jvmSystem.gcStatistics = {
        youngGenCollections: 0,
        youngGenTime: 0,
        oldGenCollections: 0,
        oldGenTime: 0,
        totalCollections: 0,
        totalTime: 0,
        lastGCCause: null,
        gcHistory: []
    };
    
    // 重新渲染
    if (gcDemo) {
        gcDemo.render();
    }
    
    console.log('✅ 系统已重置');
}

/**
 * 显示收集器推荐
 */
function showRecommendation() {
    // 模拟应用配置
    const config = {
        heapSizeGB: 2,
        allocationRate: 15,
        objectLifetimeDistribution: 0.25,
        maxPauseTimeMs: 150,
        throughputRequirement: 0.96,
        latencySensitive: false,
        deploymentType: 'server',
        hasMemoryPressure: false
    };
    
    const profile = GCCollectorSelectionEngine.evaluateApplicationProfile(config);
    const recommendation = GCCollectorSelectionEngine.recommendCollector(profile);
    
    const resultDiv = document.getElementById('recommendation-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #2c3e50;">推荐结果</h4>
        <p><strong>推荐收集器:</strong> ${recommendation.collectorType}</p>
        <p><strong>置信度:</strong> ${recommendation.confidenceScore}%</p>
        <p><strong>理由:</strong> ${recommendation.reasoning}</p>
        <p><strong>JVM参数:</strong></p>
        <pre style="background: #ecf0f1; padding: 5px; border-radius: 3px; font-size: 10px; overflow-x: auto;">${recommendation.jvmFlags.join('\n')}</pre>
    `;
}

// ==================== 页面加载完成后初始化 ====================

// 确保DOM加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGCDemo);
} else {
    initGCDemo();
}

// 导出全局函数供HTML调用
window.startCollectorDemo = startCollectorDemo;
window.allocateObjects = allocateObjects;
window.triggerGC = triggerGC;
window.resetSystem = resetSystem;
window.showRecommendation = showRecommendation;

console.log('📚 第五课专业版演示脚本加载完成');
console.log('🎯 基于Oracle JVM规范和OpenJDK HotSpot VM实现');
console.log('✨ 支持Serial GC、Parallel GC和G1 GC的完整演示');