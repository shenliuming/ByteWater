// 第四课：垃圾收集器与内存分配策略 - 演示脚本
// 基于Oracle JVM Specification (JSR-924) 和 OpenJDK HotSpot 实现

/**
 * 根据Oracle JVM规范，垃圾收集器必须实现以下核心接口：
 * 1. CollectedHeap - 堆内存管理接口
 * 2. GCCause - 垃圾收集触发原因枚举
 * 3. MemoryPool - 内存池抽象
 * 4. GarbageCollector - 垃圾收集器抽象类
 */

// 全局变量
let currentDemo = null;
let animationId = null;
let demoSpeed = 1;
let isPaused = false;
let currentStep = 0;

// JVM规范定义的系统状态
let jvmSystem = {
    // 根据JVM规范2.5.1节：堆内存结构
    heap: {
        youngGeneration: {
            eden: { size: 512, used: 0, objects: [] },
            survivor0: { size: 64, used: 0, objects: [] },
            survivor1: { size: 64, used: 0, objects: [] }
        },
        oldGeneration: {
            size: 1024,
            used: 0,
            objects: []
        },
        // JVM规范2.5.8节：方法区（元空间）
        metaspace: {
            size: 256,
            used: 0,
            classMetadata: []
        }
    },
    // JVM规范3.14节：垃圾收集统计
    gcStats: {
        youngGCCount: 0,
        oldGCCount: 0,
        fullGCCount: 0,
        totalPauseTime: 0,
        lastGCCause: null
    },
    // JVM规范定义的GC触发原因
    gcCauses: {
        ALLOCATION_FAILURE: 'Allocation Failure',
        SYSTEM_GC: 'System.gc()',
        CMS_INITIAL_MARK: 'CMS Initial Mark',
        CMS_FINAL_REMARK: 'CMS Final Remark',
        G1_EVACUATION_PAUSE: 'G1 Evacuation Pause',
        G1_HUMONGOUS_ALLOCATION: 'G1 Humongous Allocation'
    },
    // 当前运行状态
    isRunning: false,
     currentPhase: 'IDLE'
 };

/**
 * JVM规范定义的内存管理器
 * 参考：OpenJDK HotSpot VM 的 CollectedHeap 类
 */
class MemoryManager {
    constructor() {
        this.objects = new Map(); // oop -> object 映射
        this.freeList = [];       // 空闲内存块列表
        this.allocatedSize = 0;   // 已分配内存大小
        this.totalSize = 2048;    // 总内存大小（KB）
    }
    
    /**
     * 分配对象内存（JVM规范2.17.1节）
     */
    allocateObject(obj) {
        if (this.allocatedSize + obj.instanceData.size > this.totalSize) {
            throw new Error('OutOfMemoryError: Java heap space');
        }
        
        this.objects.set(obj.oop, obj);
        this.allocatedSize += obj.instanceData.size;
        
        // 更新JVM系统状态
        if (obj.gcInfo.generation === 'young') {
            jvmSystem.heap.youngGeneration.eden.used += obj.instanceData.size;
            jvmSystem.heap.youngGeneration.eden.objects.push(obj.oop);
        } else {
            jvmSystem.heap.oldGeneration.used += obj.instanceData.size;
            jvmSystem.heap.oldGeneration.objects.push(obj.oop);
        }
    }
    
    /**
     * 释放对象内存
     */
    deallocateObject(oop) {
        const obj = this.objects.get(oop);
        if (obj) {
            this.allocatedSize -= obj.instanceData.size;
            this.objects.delete(oop);
            
            // 添加到空闲列表
            this.freeList.push({
                address: oop,
                size: obj.instanceData.size
            });
        }
    }
    
    /**
     * 获取所有对象
     */
    getAllObjects() {
        return Array.from(this.objects.values());
    }
    
    /**
     * 根据OOP获取对象
     */
    getObject(oop) {
        return this.objects.get(oop);
    }
    
    /**
     * 重置内存管理器
     */
    reset() {
        this.objects.clear();
        this.freeList = [];
        this.allocatedSize = 0;
        
        // 重置JVM系统状态
        jvmSystem.heap.youngGeneration.eden.used = 0;
        jvmSystem.heap.youngGeneration.eden.objects = [];
        jvmSystem.heap.youngGeneration.survivor0.used = 0;
        jvmSystem.heap.youngGeneration.survivor0.objects = [];
        jvmSystem.heap.youngGeneration.survivor1.used = 0;
        jvmSystem.heap.youngGeneration.survivor1.objects = [];
        jvmSystem.heap.oldGeneration.used = 0;
        jvmSystem.heap.oldGeneration.objects = [];
    }
    
    /**
     * 获取内存使用统计
     */
    getMemoryStats() {
        return {
            totalSize: this.totalSize,
            allocatedSize: this.allocatedSize,
            freeSize: this.totalSize - this.allocatedSize,
            objectCount: this.objects.size,
            fragmentationRatio: this.calculateFragmentation()
        };
    }
    
    /**
     * 计算内存碎片率
     */
    calculateFragmentation() {
        if (this.freeList.length === 0) return 0;
        
        const totalFreeSize = this.freeList.reduce((sum, block) => sum + block.size, 0);
        const largestFreeBlock = Math.max(...this.freeList.map(block => block.size));
        
        return totalFreeSize > 0 ? 1 - (largestFreeBlock / totalFreeSize) : 0;
    }
}

/**
 * JVM规范定义的标记位图
 * 参考：OpenJDK HotSpot VM 的 MarkBitMap 类
 */
class MarkBitMap {
    constructor() {
        this.markedObjects = new Set();
        this.markStack = [];  // 标记栈，用于深度优先遍历
        this.markQueue = [];  // 标记队列，用于广度优先遍历
    }
    
    /**
     * 标记对象为存活
     */
    mark(oop) {
        this.markedObjects.add(oop);
    }
    
    /**
     * 检查对象是否已标记
     */
    isMarked(oop) {
        return this.markedObjects.has(oop);
    }
    
    /**
     * 清除所有标记
     */
    clear() {
        this.markedObjects.clear();
        this.markStack = [];
        this.markQueue = [];
    }
    
    /**
     * 获取所有已标记的对象
     */
    getMarkedObjects() {
        return Array.from(this.markedObjects);
    }
    
    /**
     * 获取未标记的对象（垃圾对象）
     */
    getUnmarkedObjects(allObjects) {
        return allObjects.filter(obj => !this.isMarked(obj.oop));
    }
    
    /**
     * 压入标记栈
     */
    pushToMarkStack(oop) {
        this.markStack.push(oop);
    }
    
    /**
     * 从标记栈弹出
     */
    popFromMarkStack() {
        return this.markStack.pop();
    }
    
    /**
     * 标记栈是否为空
     */
    isMarkStackEmpty() {
        return this.markStack.length === 0;
    }
}

/**
 * JVM规范定义的垃圾收集器抽象类
 * 参考：OpenJDK HotSpot VM 的 AbstractGangWorker 类
 */
class AbstractGarbageCollector {
    constructor(name, memoryManager, markBitMap) {
        this.name = name;
        this.memoryManager = memoryManager;
        this.markBitMap = markBitMap;
        this.gcPhase = 'IDLE';
        this.pauseTime = 0;
        this.throughput = 0;
    }
    
    /**
     * 执行垃圾收集（模板方法）
     */
    collect(gcCause) {
        const startTime = performance.now();
        
        try {
            this.preGC();
            this.markPhase();
            this.processPhase();
            this.postGC();
        } finally {
            this.pauseTime = performance.now() - startTime;
            this.updateStatistics(gcCause);
        }
    }
    
    /**
     * GC前置处理
     */
    preGC() {
        this.gcPhase = 'PRE_GC';
        jvmSystem.currentPhase = `${this.name}_PRE_GC`;
    }
    
    /**
     * 标记阶段（抽象方法）
     */
    markPhase() {
        throw new Error('markPhase() must be implemented by subclass');
    }
    
    /**
     * 处理阶段（抽象方法）
     */
    processPhase() {
        throw new Error('processPhase() must be implemented by subclass');
    }
    
    /**
     * GC后置处理
     */
    postGC() {
        this.gcPhase = 'POST_GC';
        jvmSystem.currentPhase = 'IDLE';
    }
    
    /**
     * 更新GC统计信息
     */
    updateStatistics(gcCause) {
        jvmSystem.gcStats.lastGCCause = gcCause;
        jvmSystem.gcStats.totalPauseTime += this.pauseTime;
    }
}

/**
 * 根据Oracle JVM规范实现的垃圾收集算法演示类
 * 参考：JVM规范第3章 - 垃圾收集算法
 * 实现：OpenJDK HotSpot VM 源码
 */
class JVMSpecGCAlgorithmsDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 12;
        this.currentAlgorithm = 'mark-sweep';
        
        // JVM规范定义的内存管理器
        this.memoryManager = new MemoryManager();
        
        // JVM规范定义的对象标记位图
        this.markBitMap = new MarkBitMap();
        
        // JVM规范定义的GC根对象集合
        this.gcRoots = new Set();
        
        this.initializeJVMMemory();
    }
    
    /**
     * 根据JVM规范2.5.1节初始化堆内存结构
     */
    initializeJVMMemory() {
        // 清空现有状态
        this.memoryManager.reset();
        this.markBitMap.clear();
        this.gcRoots.clear();
        
        // 创建符合JVM规范的对象布局
        this.createJVMObjects();
        
        // 建立符合JVM规范的引用关系
        this.establishReferenceChains();
        
        // 初始化GC Roots（JVM规范3.4节）
        this.initializeGCRoots();
    }
    
    /**
     * 创建符合JVM规范的对象实例
     * 每个对象包含：对象头(Object Header) + 实例数据(Instance Data) + 对齐填充(Padding)
     */
    createJVMObjects() {
        const objectCount = 15;
        
        for (let i = 0; i < objectCount; i++) {
            const obj = {
                // JVM规范定义的对象标识
                oop: `0x${(0x100000 + i * 0x1000).toString(16)}`, // 对象指针
                
                // 对象头信息（JVM规范2.3.1节）
                header: {
                    markWord: this.generateMarkWord(),
                    klassPointer: `0x${(0x200000 + i % 5 * 0x100).toString(16)}`
                },
                
                // 对象实例数据
                instanceData: {
                    size: Math.floor(Math.random() * 64) + 16, // 字节大小
                    fields: Math.floor(Math.random() * 5) + 1
                },
                
                // 垃圾收集相关属性
                gcInfo: {
                    generation: i < 10 ? 'young' : 'old',
                    age: Math.floor(Math.random() * 15),
                    marked: false,
                    forwarded: false,
                    remembered: false
                },
                
                // 引用关系
                references: [],
                referencedBy: [],
                
                // 可视化属性
                visual: {
                    x: 60 + (i % 5) * 120,
                    y: 120 + Math.floor(i / 5) * 80,
                    width: 100,
                    height: 60
                }
            };
            
            this.memoryManager.allocateObject(obj);
        }
    }
    
    /**
     * 生成JVM规范定义的Mark Word
     * 包含：哈希码、GC分代年龄、锁状态标志、偏向锁标志等
     */
    generateMarkWord() {
        return {
            hashCode: Math.floor(Math.random() * 0xFFFFFF),
            age: Math.floor(Math.random() * 15), // 4位年龄计数器
            biasedLock: Math.random() > 0.8,
            lockState: ['unlocked', 'biased', 'lightweight', 'heavyweight'][Math.floor(Math.random() * 4)]
        };
    }
    
    /**
     * 建立符合JVM规范的对象引用关系
     */
    establishReferenceChains() {
        const objects = this.memoryManager.getAllObjects();
        
        // 创建引用链，确保有可达和不可达的对象
        for (let i = 0; i < objects.length - 1; i++) {
            if (Math.random() > 0.4) {
                const targetIndex = Math.floor(Math.random() * objects.length);
                if (targetIndex !== i) {
                    objects[i].references.push(objects[targetIndex].oop);
                    objects[targetIndex].referencedBy.push(objects[i].oop);
                }
            }
        }
    }
    
    /**
     * 初始化GC Roots（JVM规范3.4节定义）
     */
    initializeGCRoots() {
        const objects = this.memoryManager.getAllObjects();
        
        // 模拟不同类型的GC Roots
        const rootTypes = [
            'VM_STACK_LOCAL',      // 虚拟机栈中的局部变量
            'NATIVE_STACK',        // 本地方法栈中的引用
            'STATIC_FIELD',        // 方法区中的静态属性
            'CONSTANT_POOL',       // 方法区中的常量引用
            'ACTIVE_THREAD',       // 活跃线程
            'JNI_GLOBAL'          // JNI全局引用
        ];
        
        // 随机选择3-5个对象作为GC Roots
        const rootCount = Math.floor(Math.random() * 3) + 3;
        const selectedRoots = objects.slice(0, rootCount);
        
        selectedRoots.forEach((obj, index) => {
            obj.gcInfo.isGCRoot = true;
            obj.gcInfo.rootType = rootTypes[index % rootTypes.length];
            this.gcRoots.add(obj.oop);
        });
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('垃圾收集算法对比', 20, 30);
        
        // 绘制当前算法
        this.drawCurrentAlgorithm();
        
        // 绘制内存区域
        this.drawMemoryArea();
        
        // 绘制算法步骤
        this.drawAlgorithmSteps();
        
        // 绘制性能对比
        this.drawPerformanceComparison();
    }
    
    drawCurrentAlgorithm() {
        const algorithmNames = {
            'mark-sweep': '标记-清除算法',
            'copying': '复制算法',
            'mark-compact': '标记-整理算法'
        };
        
        const x = 20;
        const y = 60;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`当前算法: ${algorithmNames[this.currentAlgorithm]}`, x, y);
        
        // 算法切换按钮（模拟）
        const algorithms = ['mark-sweep', 'copying', 'mark-compact'];
        algorithms.forEach((alg, index) => {
            const btnX = x + 250 + index * 120;
            const btnY = y - 20;
            const isActive = alg === this.currentAlgorithm;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#e2e8f0';
            this.ctx.fillRect(btnX, btnY, 100, 30);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(btnX, btnY, 100, 30);
            
            this.ctx.fillStyle = isActive ? 'white' : '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(algorithmNames[alg], btnX + 5, btnY + 20);
        });
    }
    
    drawMemoryArea() {
        const startY = 100;
        
        if (this.currentAlgorithm === 'copying') {
            this.drawCopyingMemory(startY);
        } else {
            this.drawStandardMemory(startY);
        }
    }
    
    drawStandardMemory(startY) {
        // 绘制内存区域标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('内存区域', 50, startY - 10);
        
        // 绘制内存块
        this.memoryBlocks.forEach(block => {
            let fillColor = '#f7fafc'; // 空闲
            let strokeColor = '#e2e8f0';
            
            if (block.occupied) {
                if (this.step >= 2 && block.marked) {
                    fillColor = '#48bb78'; // 已标记
                    strokeColor = '#38a169';
                } else if (this.step >= 4 && !block.marked && block.occupied) {
                    fillColor = '#f56565'; // 待回收
                    strokeColor = '#e53e3e';
                } else {
                    fillColor = '#4299e1'; // 已占用
                    strokeColor = '#3182ce';
                }
            }
            
            this.ctx.fillStyle = fillColor;
            this.ctx.fillRect(block.x, block.y, block.width, block.height);
            
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(block.x, block.y, block.width, block.height);
            
            // 显示对象ID
            if (block.occupied) {
                this.ctx.fillStyle = '#2d3748';
                this.ctx.font = '10px Arial';
                this.ctx.fillText(`${block.id}`, block.x + 5, block.y + 15);
                
                if (this.step >= 2 && block.marked) {
                    this.ctx.fillStyle = 'white';
                    this.ctx.fillText('✓', block.x + 35, block.y + 15);
                }
            }
        });
        
        // 绘制内存整理效果（标记-整理算法）
        if (this.currentAlgorithm === 'mark-compact' && this.step >= 6) {
            this.drawCompactionArrows();
        }
    }
    
    drawCopyingMemory(startY) {
        const fromSpaceX = 50;
        const toSpaceX = 400;
        const spaceWidth = 300;
        const spaceHeight = 120;
        
        // From Space
        this.ctx.fillStyle = '#fef5e7';
        this.ctx.fillRect(fromSpaceX, startY, spaceWidth, spaceHeight);
        this.ctx.strokeStyle = '#ed8936';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(fromSpaceX, startY, spaceWidth, spaceHeight);
        
        this.ctx.fillStyle = '#ed8936';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('From Space', fromSpaceX + 10, startY - 5);
        
        // To Space
        this.ctx.fillStyle = '#e6fffa';
        this.ctx.fillRect(toSpaceX, startY, spaceWidth, spaceHeight);
        this.ctx.strokeStyle = '#38b2ac';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(toSpaceX, startY, spaceWidth, spaceHeight);
        
        this.ctx.fillStyle = '#38b2ac';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('To Space', toSpaceX + 10, startY - 5);
        
        // 绘制对象
        this.objects.forEach((obj, index) => {
            let objX = obj.x;
            let objY = obj.y;
            
            // 复制阶段的对象移动
            if (this.step >= 4 && obj.reachable) {
                objX = toSpaceX + 20 + (index % 8) * 35;
                objY = startY + 20 + Math.floor(index / 8) * 25;
            }
            
            let fillColor = obj.reachable ? '#48bb78' : '#f56565';
            if (this.step >= 4 && obj.reachable) {
                fillColor = '#38b2ac';
            }
            
            this.ctx.fillStyle = fillColor;
            this.ctx.fillRect(objX, objY, 20, 20);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(objX, objY, 20, 20);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(obj.id.toString(), objX + 5, objY + 15);
        });
        
        // 绘制复制箭头
        if (this.step >= 3 && this.step <= 5) {
            this.drawCopyingArrows(fromSpaceX + spaceWidth, startY + spaceHeight / 2, toSpaceX, startY + spaceHeight / 2);
        }
    }
    
    drawCompactionArrows() {
        // 绘制内存整理的移动箭头
        const compactedBlocks = this.memoryBlocks.filter(block => block.marked);
        compactedBlocks.forEach((block, index) => {
            const targetX = 50 + index * 60;
            const targetY = 180;
            
            if (block.x !== targetX || block.y !== targetY) {
                this.drawArrow(block.x + 25, block.y + 15, targetX + 25, targetY + 15, '#9f7aea');
            }
        });
    }
    
    drawCopyingArrows(x1, y1, x2, y2) {
        this.ctx.strokeStyle = '#4299e1';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        
        // 箭头头部
        const headLength = 15;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.stroke();
        
        // 复制标签
        this.ctx.fillStyle = '#4299e1';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText('复制存活对象', x1 + 50, y1 - 10);
    }
    
    drawArrow(x1, y1, x2, y2, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        // 箭头头部
        const headLength = 8;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.stroke();
    }
    
    drawAlgorithmSteps() {
        const x = 50;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('算法执行步骤', x, y);
        
        const steps = this.getAlgorithmSteps();
        
        steps.forEach((step, index) => {
            const stepY = y + 25 + index * 20;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(x - 5, stepY - 12, 300, 16);
                this.ctx.fillStyle = 'white';
            } else if (isCompleted) {
                this.ctx.fillStyle = '#48bb78';
            } else {
                this.ctx.fillStyle = '#a0aec0';
            }
            
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`${index + 1}. ${step}`, x, stepY);
        });
    }
    
    getAlgorithmSteps() {
        const steps = {
            'mark-sweep': [
                '标记阶段：从GC Roots开始标记',
                '遍历所有可达对象',
                '标记完成，开始清除阶段',
                '清除未标记的对象',
                '回收内存空间',
                '清除完成，产生内存碎片',
                '等待下次GC触发',
                'GC周期结束'
            ],
            'copying': [
                '将内存分为From和To两个区域',
                '对象分配在From区域',
                '开始复制GC',
                '复制存活对象到To区域',
                '清空From区域',
                '交换From和To区域角色',
                '复制完成，无内存碎片',
                'GC周期结束'
            ],
            'mark-compact': [
                '标记阶段：从GC Roots开始标记',
                '遍历所有可达对象',
                '标记完成，开始整理阶段',
                '计算对象新位置',
                '更新对象引用',
                '移动对象到新位置',
                '整理完成，消除内存碎片',
                'GC周期结束'
            ]
        };
        
        return steps[this.currentAlgorithm] || [];
    }
    
    drawPerformanceComparison() {
        const x = 400;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('算法性能对比', x, y);
        
        const metrics = [
            { name: '吞吐量', markSweep: 85, copying: 90, markCompact: 80 },
            { name: '暂停时间', markSweep: 60, copying: 40, markCompact: 70 },
            { name: '内存利用率', markSweep: 95, copying: 50, markCompact: 95 },
            { name: '内存碎片', markSweep: 30, copying: 100, markCompact: 100 }
        ];
        
        metrics.forEach((metric, index) => {
            const metricY = y + 30 + index * 35;
            
            // 指标名称
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(metric.name, x, metricY);
            
            // 性能条
            const barWidth = 80;
            const barHeight = 8;
            const barStartX = x + 80;
            
            // 标记-清除
            this.ctx.fillStyle = '#4299e1';
            this.ctx.fillRect(barStartX, metricY - 15, (metric.markSweep / 100) * barWidth, barHeight);
            
            // 复制算法
            this.ctx.fillStyle = '#48bb78';
            this.ctx.fillRect(barStartX, metricY - 5, (metric.copying / 100) * barWidth, barHeight);
            
            // 标记-整理
            this.ctx.fillStyle = '#ed8936';
            this.ctx.fillRect(barStartX, metricY + 5, (metric.markCompact / 100) * barWidth, barHeight);
        });
        
        // 图例
        const legendY = y + 170;
        this.ctx.fillStyle = '#4299e1';
        this.ctx.fillRect(x, legendY, 15, 10);
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('标记-清除', x + 20, legendY + 8);
        
        this.ctx.fillStyle = '#48bb78';
        this.ctx.fillRect(x + 80, legendY, 15, 10);
        this.ctx.fillStyle = '#2d3748';
        this.ctx.fillText('复制算法', x + 100, legendY + 8);
        
        this.ctx.fillStyle = '#ed8936';
        this.ctx.fillRect(x + 160, legendY, 15, 10);
        this.ctx.fillStyle = '#2d3748';
        this.ctx.fillText('标记-整理', x + 180, legendY + 8);
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateAlgorithmStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateAlgorithmStep() {
        switch (this.currentAlgorithm) {
            case 'mark-sweep':
                this.simulateMarkSweepStep();
                break;
            case 'copying':
                this.simulateCopyingStep();
                break;
            case 'mark-compact':
                this.simulateMarkCompactStep();
                break;
        }
    }
    
    simulateMarkSweepStep() {
        switch (this.step) {
            case 1: // 开始标记
                this.memoryBlocks.forEach(block => {
                    if (block.occupied && Math.random() > 0.3) {
                        block.marked = true;
                    }
                });
                break;
            case 3: // 清除未标记对象
                this.memoryBlocks.forEach(block => {
                    if (block.occupied && !block.marked) {
                        block.occupied = false;
                    }
                });
                break;
        }
    }
    
    simulateCopyingStep() {
        switch (this.step) {
            case 2: // 标记可达对象
                this.objects.forEach(obj => {
                    obj.reachable = Math.random() > 0.4;
                });
                break;
            case 4: // 复制对象
                this.objects = this.objects.filter(obj => obj.reachable);
                break;
        }
    }
    
    simulateMarkCompactStep() {
        switch (this.step) {
            case 1: // 标记阶段
                this.memoryBlocks.forEach(block => {
                    if (block.occupied && Math.random() > 0.3) {
                        block.marked = true;
                    }
                });
                break;
            case 5: // 移动对象
                const markedBlocks = this.memoryBlocks.filter(block => block.marked);
                markedBlocks.forEach((block, index) => {
                    block.x = 50 + index * 60;
                    block.y = 180;
                });
                break;
        }
    }
    
    switchAlgorithm(algorithm) {
        this.currentAlgorithm = algorithm;
        this.reset();
    }
    
    reset() {
        this.step = 0;
        this.markedObjects.clear();
        this.initializeMemory();
    }
}

// 垃圾收集器演示类
class GCCollectorsDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.currentCollector = 'Serial';
        this.heapRegions = [];
        this.gcThreads = [];
        this.initializeHeap();
    }
    
    initializeHeap() {
        this.heapRegions = [
            { name: 'Eden', x: 50, y: 100, width: 150, height: 60, used: 80, max: 100, color: '#4299e1' },
            { name: 'S0', x: 220, y: 100, width: 60, height: 60, used: 20, max: 30, color: '#48bb78' },
            { name: 'S1', x: 300, y: 100, width: 60, height: 60, used: 0, max: 30, color: '#48bb78' },
            { name: 'Old Gen', x: 50, y: 180, width: 310, height: 80, used: 150, max: 200, color: '#ed8936' }
        ];
        
        this.gcThreads = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('垃圾收集器对比', 20, 30);
        
        // 绘制当前收集器
        this.drawCurrentCollector();
        
        // 绘制堆内存结构
        this.drawHeapStructure();
        
        // 绘制GC线程
        this.drawGCThreads();
        
        // 绘制收集器特性
        this.drawCollectorCharacteristics();
        
        // 绘制性能指标
        this.drawPerformanceMetrics();
    }
    
    drawCurrentCollector() {
        const x = 20;
        const y = 60;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`当前收集器: ${this.currentCollector}`, x, y);
        
        // 收集器切换按钮
        const collectors = ['Serial', 'ParNew', 'CMS', 'G1'];
        collectors.forEach((collector, index) => {
            const btnX = x + 200 + index * 80;
            const btnY = y - 20;
            const isActive = collector === this.currentCollector;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#e2e8f0';
            this.ctx.fillRect(btnX, btnY, 70, 30);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(btnX, btnY, 70, 30);
            
            this.ctx.fillStyle = isActive ? 'white' : '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(collector, btnX + 10, btnY + 20);
        });
    }
    
    drawHeapStructure() {
        // 绘制堆内存区域
        this.heapRegions.forEach(region => {
            // 区域背景
            this.ctx.fillStyle = region.color + '40'; // 透明度
            this.ctx.fillRect(region.x, region.y, region.width, region.height);
            
            // 使用量
            const usedWidth = (region.used / region.max) * region.width;
            this.ctx.fillStyle = region.color;
            this.ctx.fillRect(region.x, region.y, usedWidth, region.height);
            
            // 边框
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(region.x, region.y, region.width, region.height);
            
            // 区域名称
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(region.name, region.x + 5, region.y - 5);
            
            // 使用率
            this.ctx.font = '12px Arial';
            const usagePercent = ((region.used / region.max) * 100).toFixed(1);
            this.ctx.fillText(`${region.used}/${region.max}MB (${usagePercent}%)`, region.x + 5, region.y + 20);
        });
    }
    
    drawGCThreads() {
        if (this.gcThreads.length === 0) return;
        
        const threadY = 300;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('GC线程活动', 50, threadY);
        
        this.gcThreads.forEach((thread, index) => {
            const threadX = 50 + index * 100;
            const threadBoxY = threadY + 20;
            
            // 线程框
            this.ctx.fillStyle = thread.active ? '#48bb78' : '#e2e8f0';
            this.ctx.fillRect(threadX, threadBoxY, 80, 40);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(threadX, threadBoxY, 80, 40);
            
            // 线程信息
            this.ctx.fillStyle = thread.active ? 'white' : '#4a5568';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Thread ${index + 1}`, threadX + 5, threadBoxY + 15);
            this.ctx.fillText(thread.task || 'Idle', threadX + 5, threadBoxY + 30);
            
            // 活动指示器
            if (thread.active) {
                this.ctx.fillStyle = '#f56565';
                this.ctx.beginPath();
                this.ctx.arc(threadX + 70, threadBoxY + 10, 5, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });
    }
    
    drawCollectorCharacteristics() {
        const x = 400;
        const y = 100;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(`${this.currentCollector} 特性`, x, y);
        
        const characteristics = this.getCollectorCharacteristics();
        
        characteristics.forEach((char, index) => {
            const charY = y + 25 + index * 20;
            
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`• ${char}`, x, charY);
        });
    }
    
    getCollectorCharacteristics() {
        const characteristics = {
            'Serial': [
                '单线程收集器',
                '适用于客户端模式',
                'Stop The World时间较长',
                '内存占用小',
                '简单高效'
            ],
            'ParNew': [
                'Serial的多线程版本',
                '新生代并行收集',
                '与CMS配合使用',
                '适用于服务器环境',
                '可控制并行线程数'
            ],
            'CMS': [
                '并发标记清除',
                '低延迟收集器',
                '与应用程序并发执行',
                '会产生内存碎片',
                '适用于响应时间敏感应用'
            ],
            'G1': [
                '面向服务端应用',
                '可预测的停顿时间',
                '整堆收集器',
                '内存分区管理',
                '适用于大堆内存'
            ]
        };
        
        return characteristics[this.currentCollector] || [];
    }
    
    drawPerformanceMetrics() {
        const x = 400;
        const y = 250;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('性能指标', x, y);
        
        const metrics = this.getPerformanceMetrics();
        
        Object.entries(metrics).forEach(([key, value], index) => {
            const metricY = y + 25 + index * 20;
            
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`${key}: ${value}`, x, metricY);
        });
    }
    
    getPerformanceMetrics() {
        const metrics = {
            'Serial': {
                '平均停顿时间': '100-200ms',
                '吞吐量': '95%',
                '内存开销': '低',
                '适用堆大小': '<100MB'
            },
            'ParNew': {
                '平均停顿时间': '50-100ms',
                '吞吐量': '90%',
                '内存开销': '中等',
                '适用堆大小': '100MB-2GB'
            },
            'CMS': {
                '平均停顿时间': '10-50ms',
                '吞吐量': '80%',
                '内存开销': '高',
                '适用堆大小': '2GB-32GB'
            },
            'G1': {
                '平均停顿时间': '<10ms',
                '吞吐量': '85%',
                '内存开销': '中等',
                '适用堆大小': '>4GB'
            }
        };
        
        return metrics[this.currentCollector] || {};
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateGCStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateGCStep() {
        switch (this.step) {
            case 1: // 触发GC
                this.heapRegions[0].used = this.heapRegions[0].max; // Eden满
                break;
            case 2: // 启动GC线程
                this.startGCThreads();
                break;
            case 3: // 标记阶段
                this.gcThreads.forEach(thread => {
                    thread.task = 'Marking';
                });
                break;
            case 4: // 清理阶段
                this.gcThreads.forEach(thread => {
                    thread.task = 'Sweeping';
                });
                break;
            case 5: // 移动对象
                this.heapRegions[0].used = 20; // Eden清理后
                this.heapRegions[1].used = 25; // Survivor增加
                break;
            case 6: // GC完成
                this.gcThreads.forEach(thread => {
                    thread.active = false;
                    thread.task = 'Idle';
                });
                break;
        }
    }
    
    startGCThreads() {
        const threadCount = this.getThreadCount();
        this.gcThreads = [];
        
        for (let i = 0; i < threadCount; i++) {
            this.gcThreads.push({
                id: i,
                active: true,
                task: 'Starting'
            });
        }
    }
    
    getThreadCount() {
        const threadCounts = {
            'Serial': 1,
            'ParNew': 4,
            'CMS': 2,
            'G1': 4
        };
        
        return threadCounts[this.currentCollector] || 1;
    }
    
    switchCollector(collector) {
        this.currentCollector = collector;
        this.reset();
    }
    
    reset() {
        this.step = 0;
        this.gcThreads = [];
        this.initializeHeap();
    }
}

// 内存分配策略演示类
class MemoryAllocationDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 10;
        this.objects = [];
        this.allocationEvents = [];
        this.heapRegions = {
            eden: { x: 50, y: 100, width: 200, height: 60, used: 0, max: 100, objects: [] },
            survivor0: { x: 270, y: 100, width: 80, height: 60, used: 0, max: 20, objects: [] },
            survivor1: { x: 370, y: 100, width: 80, height: 60, used: 0, max: 20, objects: [] },
            oldGen: { x: 50, y: 180, width: 400, height: 80, used: 0, max: 200, objects: [] }
        };
        this.initializeAllocation();
    }
    
    initializeAllocation() {
        this.objects = [];
        this.allocationEvents = [];
        Object.values(this.heapRegions).forEach(region => {
            region.used = 0;
            region.objects = [];
        });
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('内存分配策略', 20, 30);
        
        // 绘制堆内存区域
        this.drawHeapRegions();
        
        // 绘制对象分配
        this.drawObjectAllocation();
        
        // 绘制分配策略说明
        this.drawAllocationStrategies();
        
        // 绘制分配事件日志
        this.drawAllocationEvents();
    }
    
    drawHeapRegions() {
        Object.entries(this.heapRegions).forEach(([name, region]) => {
            // 区域背景
            let bgColor = '#f7fafc';
            let borderColor = '#e2e8f0';
            
            switch (name) {
                case 'eden':
                    bgColor = '#ebf8ff';
                    borderColor = '#4299e1';
                    break;
                case 'survivor0':
                case 'survivor1':
                    bgColor = '#f0fff4';
                    borderColor = '#48bb78';
                    break;
                case 'oldGen':
                    bgColor = '#fffaf0';
                    borderColor = '#ed8936';
                    break;
            }
            
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(region.x, region.y, region.width, region.height);
            
            // 使用量显示
            const usedWidth = (region.used / region.max) * region.width;
            this.ctx.fillStyle = borderColor + '80';
            this.ctx.fillRect(region.x, region.y, usedWidth, region.height);
            
            // 边框
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(region.x, region.y, region.width, region.height);
            
            // 区域标签
            const labels = {
                eden: 'Eden区',
                survivor0: 'S0',
                survivor1: 'S1',
                oldGen: '老年代'
            };
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(labels[name], region.x + 5, region.y - 5);
            
            // 使用率
            this.ctx.font = '10px Arial';
            const usagePercent = ((region.used / region.max) * 100).toFixed(1);
            this.ctx.fillText(`${region.used}/${region.max}MB`, region.x + 5, region.y + 15);
            this.ctx.fillText(`${usagePercent}%`, region.x + 5, region.y + 30);
        });
    }
    
    drawObjectAllocation() {
        this.objects.forEach(obj => {
            let color = '#4299e1';
            
            switch (obj.type) {
                case 'small':
                    color = '#4299e1';
                    break;
                case 'large':
                    color = '#ed8936';
                    break;
                case 'longLived':
                    color = '#9f7aea';
                    break;
            }
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
            
            // 对象信息
            this.ctx.fillStyle = 'white';
            this.ctx.font = '8px Arial';
            this.ctx.fillText(obj.id.toString(), obj.x + 2, obj.y + 10);
            
            // 年龄显示
            if (obj.age > 0) {
                this.ctx.fillText(`${obj.age}`, obj.x + 2, obj.y + obj.height - 2);
            }
        });
    }
    
    drawAllocationStrategies() {
        const x = 500;
        const y = 100;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('分配策略', x, y);
        
        const strategies = [
            '1. 对象优先在Eden分配',
            '2. 大对象直接进入老年代',
            '3. 长期存活对象进入老年代',
            '4. 动态对象年龄判定',
            '5. 空间分配担保'
        ];
        
        strategies.forEach((strategy, index) => {
            const strategyY = y + 25 + index * 20;
            const isActive = index <= this.step;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#a0aec0';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(strategy, x, strategyY);
        });
        
        // 当前策略详细说明
        if (this.step < strategies.length) {
            const detailY = y + 150;
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText('当前策略详情:', x, detailY);
            
            const details = this.getStrategyDetails();
            if (details[this.step]) {
                this.ctx.fillStyle = '#4a5568';
                this.ctx.font = '11px Arial';
                const lines = details[this.step].split('\n');
                lines.forEach((line, lineIndex) => {
                    this.ctx.fillText(line, x, detailY + 20 + lineIndex * 15);
                });
            }
        }
    }
    
    getStrategyDetails() {
        return [
            '新创建的对象优先在Eden区分配\n当Eden区没有足够空间时触发Minor GC',
            '大对象（需要大量连续内存的对象）\n直接分配在老年代，避免复制开销',
            '对象在Survivor区每熬过一次GC\n年龄增加1，达到阈值后晋升老年代',
            '如果Survivor中相同年龄对象大小\n超过Survivor空间一半，则直接晋升',
            '老年代空间不足时，检查历史晋升\n对象平均大小，决定是否担保'
        ];
    }
    
    drawAllocationEvents() {
        const x = 50;
        const y = 300;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('分配事件日志', x, y);
        
        const visibleEvents = this.allocationEvents.slice(-8); // 显示最近8个事件
        
        visibleEvents.forEach((event, index) => {
            const eventY = y + 25 + index * 15;
            
            let color = '#4a5568';
            switch (event.type) {
                case 'allocation':
                    color = '#4299e1';
                    break;
                case 'promotion':
                    color = '#ed8936';
                    break;
                case 'gc':
                    color = '#f56565';
                    break;
            }
            
            this.ctx.fillStyle = color;
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`[${event.timestamp}] ${event.message}`, x, eventY);
        });
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateAllocationStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateAllocationStep() {
        const timestamp = `T${this.step.toString().padStart(2, '0')}`;
        
        switch (this.step) {
            case 1: // Eden区分配小对象
                this.allocateSmallObjects(timestamp);
                break;
            case 2: // Eden区满，触发Minor GC
                this.triggerMinorGC(timestamp);
                break;
            case 3: // 分配大对象
                this.allocateLargeObject(timestamp);
                break;
            case 4: // 继续分配对象
                this.allocateMoreObjects(timestamp);
                break;
            case 5: // 对象年龄增长
                this.ageObjects(timestamp);
                break;
            case 6: // 对象晋升
                this.promoteObjects(timestamp);
                break;
            case 7: // 空间分配担保
                this.handleSpaceGuarantee(timestamp);
                break;
            case 8: // Full GC
                this.triggerFullGC(timestamp);
                break;
        }
    }
    
    allocateSmallObjects(timestamp) {
        for (let i = 0; i < 5; i++) {
            const obj = {
                id: this.objects.length + 1,
                type: 'small',
                x: this.heapRegions.eden.x + 10 + (this.objects.length % 8) * 20,
                y: this.heapRegions.eden.y + 10 + Math.floor(this.objects.length / 8) * 15,
                width: 15,
                height: 12,
                age: 0,
                region: 'eden'
            };
            
            this.objects.push(obj);
            this.heapRegions.eden.objects.push(obj);
            this.heapRegions.eden.used += 2;
        }
        
        this.allocationEvents.push({
            timestamp,
            type: 'allocation',
            message: '在Eden区分配5个小对象'
        });
    }
    
    triggerMinorGC(timestamp) {
        // 模拟Minor GC：移动存活对象到Survivor
        const survivingObjects = this.heapRegions.eden.objects.filter(() => Math.random() > 0.3);
        
        survivingObjects.forEach((obj, index) => {
            obj.region = 'survivor0';
            obj.x = this.heapRegions.survivor0.x + 5 + (index % 3) * 20;
            obj.y = this.heapRegions.survivor0.y + 5 + Math.floor(index / 3) * 15;
            obj.age++;
        });
        
        this.heapRegions.eden.objects = [];
        this.heapRegions.eden.used = 0;
        this.heapRegions.survivor0.objects = survivingObjects;
        this.heapRegions.survivor0.used = survivingObjects.length * 2;
        
        this.allocationEvents.push({
            timestamp,
            type: 'gc',
            message: `Minor GC: ${survivingObjects.length}个对象存活并移至S0`
        });
    }
    
    allocateLargeObject(timestamp) {
        const largeObj = {
            id: this.objects.length + 1,
            type: 'large',
            x: this.heapRegions.oldGen.x + 10,
            y: this.heapRegions.oldGen.y + 10,
            width: 40,
            height: 25,
            age: 0,
            region: 'oldGen'
        };
        
        this.objects.push(largeObj);
        this.heapRegions.oldGen.objects.push(largeObj);
        this.heapRegions.oldGen.used += 20;
        
        this.allocationEvents.push({
            timestamp,
            type: 'allocation',
            message: '大对象直接分配到老年代'
        });
    }
    
    allocateMoreObjects(timestamp) {
        for (let i = 0; i < 3; i++) {
            const obj = {
                id: this.objects.length + 1,
                type: 'small',
                x: this.heapRegions.eden.x + 10 + i * 25,
                y: this.heapRegions.eden.y + 30,
                width: 15,
                height: 12,
                age: 0,
                region: 'eden'
            };
            
            this.objects.push(obj);
            this.heapRegions.eden.objects.push(obj);
            this.heapRegions.eden.used += 2;
        }
        
        this.allocationEvents.push({
            timestamp,
            type: 'allocation',
            message: '继续在Eden区分配对象'
        });
    }
    
    ageObjects(timestamp) {
        this.heapRegions.survivor0.objects.forEach(obj => {
            obj.age++;
        });
        
        this.allocationEvents.push({
            timestamp,
            type: 'promotion',
            message: 'Survivor区对象年龄增长'
        });
    }
    
    promoteObjects(timestamp) {
        const promotionThreshold = 3;
        const objectsToPromote = this.heapRegions.survivor0.objects.filter(obj => obj.age >= promotionThreshold);
        
        objectsToPromote.forEach((obj, index) => {
            obj.region = 'oldGen';
            obj.x = this.heapRegions.oldGen.x + 60 + (index % 5) * 25;
            obj.y = this.heapRegions.oldGen.y + 40;
            this.heapRegions.oldGen.objects.push(obj);
            this.heapRegions.oldGen.used += 2;
        });
        
        this.heapRegions.survivor0.objects = this.heapRegions.survivor0.objects.filter(obj => obj.age < promotionThreshold);
        this.heapRegions.survivor0.used -= objectsToPromote.length * 2;
        
        this.allocationEvents.push({
            timestamp,
            type: 'promotion',
            message: `${objectsToPromote.length}个长期存活对象晋升到老年代`
        });
    }
    
    handleSpaceGuarantee(timestamp) {
        this.allocationEvents.push({
            timestamp,
            type: 'allocation',
            message: '检查空间分配担保机制'
        });
    }
    
    triggerFullGC(timestamp) {
        // 模拟Full GC：清理所有区域
        const totalObjectsBefore = this.objects.length;
        this.objects = this.objects.filter(() => Math.random() > 0.4);
        const survivedObjects = this.objects.length;
        
        // 重新分布存活对象
        this.redistributeObjects();
        
        this.allocationEvents.push({
            timestamp,
            type: 'gc',
            message: `Full GC: ${totalObjectsBefore}个对象中${survivedObjects}个存活`
        });
    }
    
    redistributeObjects() {
        Object.values(this.heapRegions).forEach(region => {
            region.objects = [];
            region.used = 0;
        });
        
        this.objects.forEach((obj, index) => {
            if (obj.type === 'large' || obj.age >= 2) {
                obj.region = 'oldGen';
                obj.x = this.heapRegions.oldGen.x + 10 + (index % 10) * 35;
                obj.y = this.heapRegions.oldGen.y + 10 + Math.floor(index / 10) * 20;
                this.heapRegions.oldGen.objects.push(obj);
                this.heapRegions.oldGen.used += obj.type === 'large' ? 20 : 2;
            } else {
                obj.region = 'survivor0';
                obj.x = this.heapRegions.survivor0.x + 5 + (index % 3) * 20;
                obj.y = this.heapRegions.survivor0.y + 5 + Math.floor(index / 3) * 15;
                this.heapRegions.survivor0.objects.push(obj);
                this.heapRegions.survivor0.used += 2;
            }
        });
    }
    
    reset() {
        this.step = 0;
        this.initializeAllocation();
    }
}

// GC调优实战演示类
class GCTuningDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.gcLogs = [];
        this.performanceMetrics = {
            throughput: 85,
            latency: 150,
            memoryUtilization: 75,
            gcFrequency: 12
        };
        this.tuningActions = [];
        this.initializeTuning();
    }
    
    initializeTuning() {
        this.gcLogs = [
            { time: '2024-01-01 10:00:01', type: 'Minor GC', duration: 45, before: 512, after: 128 },
            { time: '2024-01-01 10:00:15', type: 'Minor GC', duration: 52, before: 512, after: 156 },
            { time: '2024-01-01 10:00:32', type: 'Major GC', duration: 180, before: 1024, after: 256 },
            { time: '2024-01-01 10:00:45', type: 'Minor GC', duration: 48, before: 512, after: 134 }
        ];
        
        this.tuningActions = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('GC调优实战', 20, 30);
        
        // 绘制GC日志分析
        this.drawGCLogAnalysis();
        
        // 绘制性能指标
        this.drawPerformanceMetrics();
        
        // 绘制调优建议
        this.drawTuningRecommendations();
        
        // 绘制调优效果对比
        this.drawTuningComparison();
    }
    
    drawGCLogAnalysis() {
        const x = 20;
        const y = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('GC日志分析', x, y);
        
        // 表头
        const headers = ['时间', '类型', '耗时(ms)', '回收前(MB)', '回收后(MB)'];
        const colWidths = [120, 80, 80, 100, 100];
        let currentX = x;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.fillRect(currentX, y + 10, colWidths.reduce((a, b) => a + b, 0), 25);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Arial';
        headers.forEach((header, index) => {
            this.ctx.fillText(header, currentX + 5, y + 27);
            currentX += colWidths[index];
        });
        
        // 数据行
        this.gcLogs.forEach((log, index) => {
            const rowY = y + 40 + index * 20;
            currentX = x;
            
            // 行背景
            this.ctx.fillStyle = index % 2 === 0 ? '#f7fafc' : '#edf2f7';
            this.ctx.fillRect(currentX, rowY - 5, colWidths.reduce((a, b) => a + b, 0), 20);
            
            // 数据
            const rowData = [log.time, log.type, log.duration, log.before, log.after];
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '11px Arial';
            
            rowData.forEach((data, colIndex) => {
                this.ctx.fillText(data.toString(), currentX + 5, rowY + 10);
                currentX += colWidths[colIndex];
            });
        });
        
        // 分析结果
        const analysisY = y + 160;
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('分析结果:', x, analysisY);
        
        const analysisResults = [
            '• Minor GC频率过高，平均15秒一次',
            '• Major GC耗时较长，达到180ms',
            '• 内存回收效率不佳，存在内存泄漏风险',
            '• 建议调整堆大小和GC参数'
        ];
        
        analysisResults.forEach((result, index) => {
            this.ctx.fillStyle = '#e53e3e';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(result, x, analysisY + 20 + index * 18);
        });
    }
    
    drawPerformanceMetrics() {
        const x = 550;
        const y = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('性能指标', x, y);
        
        const metrics = [
            { name: '吞吐量', value: this.performanceMetrics.throughput, unit: '%', target: 95, color: '#4299e1' },
            { name: '延迟', value: this.performanceMetrics.latency, unit: 'ms', target: 50, color: '#ed8936' },
            { name: '内存利用率', value: this.performanceMetrics.memoryUtilization, unit: '%', target: 80, color: '#48bb78' },
            { name: 'GC频率', value: this.performanceMetrics.gcFrequency, unit: '/min', target: 5, color: '#9f7aea' }
        ];
        
        metrics.forEach((metric, index) => {
            const metricY = y + 30 + index * 60;
            
            // 指标名称
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(metric.name, x, metricY);
            
            // 当前值
            this.ctx.fillStyle = metric.color;
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(`${metric.value}${metric.unit}`, x, metricY + 20);
            
            // 目标值
            this.ctx.fillStyle = '#a0aec0';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`目标: ${metric.target}${metric.unit}`, x, metricY + 35);
            
            // 进度条
            const barWidth = 100;
            const barHeight = 8;
            const progress = Math.min(metric.value / metric.target, 1);
            
            // 背景
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.fillRect(x + 120, metricY + 10, barWidth, barHeight);
            
            // 进度
            this.ctx.fillStyle = progress >= 0.8 ? '#48bb78' : progress >= 0.6 ? '#ed8936' : '#f56565';
            this.ctx.fillRect(x + 120, metricY + 10, barWidth * progress, barHeight);
        });
    }
    
    drawTuningRecommendations() {
        const x = 20;
        const y = 320;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('调优建议', x, y);
        
        const recommendations = [
            { title: '堆大小调整', desc: '增加堆大小到4GB，减少GC频率', priority: 'high' },
            { title: '新生代比例', desc: '调整新生代占堆的比例到1/3', priority: 'medium' },
            { title: '收集器选择', desc: '使用G1收集器替代CMS', priority: 'high' },
            { title: '并行线程数', desc: '设置GC并行线程数为CPU核心数', priority: 'low' }
        ];
        
        recommendations.forEach((rec, index) => {
            const recY = y + 25 + index * 40;
            const isActive = index <= this.step;
            
            // 优先级标识
            let priorityColor = '#a0aec0';
            switch (rec.priority) {
                case 'high':
                    priorityColor = '#f56565';
                    break;
                case 'medium':
                    priorityColor = '#ed8936';
                    break;
                case 'low':
                    priorityColor = '#48bb78';
                    break;
            }
            
            this.ctx.fillStyle = priorityColor;
            this.ctx.fillRect(x, recY - 5, 5, 25);
            
            // 建议内容
            this.ctx.fillStyle = isActive ? '#2d3748' : '#a0aec0';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(rec.title, x + 15, recY + 5);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillText(rec.desc, x + 15, recY + 20);
        });
    }
    
    drawTuningComparison() {
        const x = 400;
        const y = 320;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('调优前后对比', x, y);
        
        const comparison = [
            { metric: '平均GC时间', before: 85, after: 35, unit: 'ms' },
            { metric: 'GC频率', before: 12, after: 4, unit: '/min' },
            { metric: '吞吐量', before: 85, after: 95, unit: '%' },
            { metric: '最大暂停时间', before: 180, after: 50, unit: 'ms' }
        ];
        
        comparison.forEach((comp, index) => {
            const compY = y + 30 + index * 25;
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '11px Arial';
            this.ctx.fillText(comp.metric, x, compY);
            
            // 调优前
            this.ctx.fillStyle = '#f56565';
            this.ctx.fillText(`${comp.before}${comp.unit}`, x + 100, compY);
            
            // 箭头
            this.ctx.fillStyle = '#4299e1';
            this.ctx.fillText('→', x + 150, compY);
            
            // 调优后
            this.ctx.fillStyle = '#48bb78';
            this.ctx.fillText(`${comp.after}${comp.unit}`, x + 170, compY);
            
            // 改善百分比
            const improvement = ((comp.before - comp.after) / comp.before * 100).toFixed(1);
            if (improvement > 0) {
                this.ctx.fillStyle = '#48bb78';
                this.ctx.font = '9px Arial';
                this.ctx.fillText(`↓${improvement}%`, x + 220, compY);
            }
        });
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateTuningStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateTuningStep() {
        switch (this.step) {
            case 1:
                this.performanceMetrics.throughput = 88;
                break;
            case 2:
                this.performanceMetrics.latency = 120;
                this.performanceMetrics.gcFrequency = 10;
                break;
            case 3:
                this.performanceMetrics.throughput = 92;
                this.performanceMetrics.latency = 80;
                break;
            case 4:
                this.performanceMetrics.gcFrequency = 6;
                this.performanceMetrics.memoryUtilization = 82;
                break;
            case 5:
                this.performanceMetrics.throughput = 95;
                this.performanceMetrics.latency = 50;
                break;
            case 6:
                this.performanceMetrics.gcFrequency = 4;
                break;
        }
    }
    
    reset() {
        this.step = 0;
        this.initializeTuning();
        this.performanceMetrics = {
            throughput: 85,
            latency: 150,
            memoryUtilization: 75,
            gcFrequency: 12
        };
    }
}

// 低延迟垃圾收集器演示类
class LowLatencyGCDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.currentCollector = 'ZGC';
        this.memoryRegions = [];
        this.gcPhases = [];
        this.latencyData = [];
        this.initializeLowLatencyGC();
    }
    
    initializeLowLatencyGC() {
        this.memoryRegions = [
            { id: 1, x: 50, y: 100, width: 80, height: 40, used: 60, color: '#4299e1', status: 'active' },
            { id: 2, x: 150, y: 100, width: 80, height: 40, used: 80, color: '#ed8936', status: 'relocating' },
            { id: 3, x: 250, y: 100, width: 80, height: 40, used: 40, color: '#48bb78', status: 'free' },
            { id: 4, x: 350, y: 100, width: 80, height: 40, used: 90, color: '#9f7aea', status: 'marked' }
        ];
        
        this.gcPhases = [
            { name: '并发标记', duration: 2, color: '#4299e1' },
            { name: '并发重定位', duration: 3, color: '#ed8936' },
            { name: '并发引用处理', duration: 1, color: '#48bb78' },
            { name: '暂停根扫描', duration: 0.5, color: '#f56565' }
        ];
        
        this.latencyData = [
            { collector: 'G1', p99: 50, p999: 200, max: 500 },
            { collector: 'CMS', p99: 80, p999: 300, max: 800 },
            { collector: 'ZGC', p99: 2, p999: 5, max: 10 },
            { collector: 'Shenandoah', p99: 3, p999: 8, max: 15 }
        ];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('低延迟垃圾收集器', 20, 30);
        
        // 绘制当前收集器
        this.drawCurrentCollector();
        
        // 绘制内存区域
        this.drawMemoryRegions();
        
        // 绘制GC阶段
        this.drawGCPhases();
        
        // 绘制延迟对比
        this.drawLatencyComparison();
        
        // 绘制技术特性
        this.drawTechnicalFeatures();
    }
    
    drawCurrentCollector() {
        const x = 20;
        const y = 60;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`当前收集器: ${this.currentCollector}`, x, y);
        
        // 收集器切换按钮
        const collectors = ['ZGC', 'Shenandoah'];
        collectors.forEach((collector, index) => {
            const btnX = x + 200 + index * 100;
            const btnY = y - 20;
            const isActive = collector === this.currentCollector;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#e2e8f0';
            this.ctx.fillRect(btnX, btnY, 90, 30);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(btnX, btnY, 90, 30);
            
            this.ctx.fillStyle = isActive ? 'white' : '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(collector, btnX + 15, btnY + 20);
        });
    }
    
    drawMemoryRegions() {
        const x = 50;
        const y = 100;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('内存区域状态', x, y - 10);
        
        this.memoryRegions.forEach(region => {
            // 区域背景
            this.ctx.fillStyle = region.color + '40';
            this.ctx.fillRect(region.x, region.y, region.width, region.height);
            
            // 使用量
            const usedWidth = (region.used / 100) * region.width;
            this.ctx.fillStyle = region.color;
            this.ctx.fillRect(region.x, region.y, usedWidth, region.height);
            
            // 边框
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(region.x, region.y, region.width, region.height);
            
            // 区域信息
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(`Region ${region.id}`, region.x + 5, region.y - 5);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`${region.used}%`, region.x + 5, region.y + 15);
            this.ctx.fillText(region.status, region.x + 5, region.y + 30);
            
            // 状态指示器
            if (region.status === 'relocating' && this.step >= 3) {
                this.drawRelocationArrows(region);
            }
        });
    }
    
    drawRelocationArrows(region) {
        // 绘制重定位箭头
        const arrowCount = 3;
        for (let i = 0; i < arrowCount; i++) {
            const startX = region.x + 10 + i * 20;
            const startY = region.y + 20;
            const endX = startX + 15;
            const endY = startY - 10;
            
            this.ctx.strokeStyle = '#f56565';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
            
            // 箭头头部
            this.ctx.beginPath();
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(endX - 5, endY + 3);
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(endX - 3, endY + 5);
            this.ctx.stroke();
        }
    }
    
    drawGCPhases() {
        const x = 500;
        const y = 100;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('GC阶段时间线', x, y - 10);
        
        let currentY = y;
        this.gcPhases.forEach((phase, index) => {
            const phaseHeight = 30;
            const isActive = index === Math.floor(this.step / 2);
            
            // 阶段条
            this.ctx.fillStyle = isActive ? phase.color : phase.color + '60';
            this.ctx.fillRect(x, currentY, phase.duration * 40, phaseHeight);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, currentY, phase.duration * 40, phaseHeight);
            
            // 阶段名称
            this.ctx.fillStyle = isActive ? 'white' : '#2d3748';
            this.ctx.font = '11px Arial';
            this.ctx.fillText(phase.name, x + 5, currentY + 15);
            
            // 持续时间
            this.ctx.font = '9px Arial';
            this.ctx.fillText(`${phase.duration}ms`, x + 5, currentY + 25);
            
            currentY += phaseHeight + 5;
        });
        
        // 总暂停时间
        const totalPause = this.gcPhases.filter(p => p.name.includes('暂停')).reduce((sum, p) => sum + p.duration, 0);
        this.ctx.fillStyle = '#f56565';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText(`总暂停时间: ${totalPause}ms`, x, currentY + 10);
    }
    
    drawLatencyComparison() {
        const x = 50;
        const y = 200;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('延迟对比 (毫秒)', x, y);
        
        // 表头
        const headers = ['收集器', 'P99', 'P99.9', '最大值'];
        const colWidths = [80, 60, 60, 60];
        let currentX = x;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.fillRect(currentX, y + 10, colWidths.reduce((a, b) => a + b, 0), 25);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Arial';
        headers.forEach((header, index) => {
            this.ctx.fillText(header, currentX + 5, y + 27);
            currentX += colWidths[index];
        });
        
        // 数据行
        this.latencyData.forEach((data, index) => {
            const rowY = y + 40 + index * 25;
            currentX = x;
            
            // 行背景
            let bgColor = '#f7fafc';
            if (data.collector === this.currentCollector) {
                bgColor = '#e6fffa';
            }
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(currentX, rowY - 5, colWidths.reduce((a, b) => a + b, 0), 25);
            
            // 数据
            const rowData = [data.collector, data.p99, data.p999, data.max];
            this.ctx.fillStyle = data.collector === this.currentCollector ? '#2d3748' : '#4a5568';
            this.ctx.font = data.collector === this.currentCollector ? 'bold 11px Arial' : '11px Arial';
            
            rowData.forEach((cellData, colIndex) => {
                this.ctx.fillText(cellData.toString(), currentX + 5, rowY + 10);
                currentX += colWidths[colIndex];
            });
        });
        
        // 延迟图表
        this.drawLatencyChart(x + 300, y + 20);
    }
    
    drawLatencyChart(x, y) {
        const chartWidth = 200;
        const chartHeight = 120;
        
        // 图表背景
        this.ctx.fillStyle = '#f7fafc';
        this.ctx.fillRect(x, y, chartWidth, chartHeight);
        
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, chartWidth, chartHeight);
        
        // Y轴标签
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = '10px Arial';
        for (let i = 0; i <= 5; i++) {
            const labelY = y + chartHeight - (i * chartHeight / 5);
            const value = (i * 100).toString();
            this.ctx.fillText(value, x - 20, labelY + 3);
            
            // 网格线
            this.ctx.strokeStyle = '#e2e8f0';
            this.ctx.beginPath();
            this.ctx.moveTo(x, labelY);
            this.ctx.lineTo(x + chartWidth, labelY);
            this.ctx.stroke();
        }
        
        // 绘制柱状图
        const barWidth = chartWidth / this.latencyData.length;
        this.latencyData.forEach((data, index) => {
            const barX = x + index * barWidth + 10;
            const barHeight = (data.max / 500) * chartHeight;
            const barY = y + chartHeight - barHeight;
            
            let color = '#4299e1';
            if (data.collector === 'ZGC') color = '#48bb78';
            if (data.collector === 'Shenandoah') color = '#9f7aea';
            if (data.collector === 'CMS') color = '#ed8936';
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(barX, barY, barWidth - 20, barHeight);
            
            // 收集器名称
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '9px Arial';
            this.ctx.save();
            this.ctx.translate(barX + (barWidth - 20) / 2, y + chartHeight + 15);
            this.ctx.rotate(-Math.PI / 4);
            this.ctx.fillText(data.collector, 0, 0);
            this.ctx.restore();
        });
    }
    
    drawTechnicalFeatures() {
        const x = 50;
        const y = 380;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(`${this.currentCollector} 技术特性`, x, y);
        
        const features = this.getTechnicalFeatures();
        
        features.forEach((feature, index) => {
            const featureY = y + 25 + index * 20;
            
            this.ctx.fillStyle = '#4299e1';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`• ${feature}`, x, featureY);
        });
        
        // 适用场景
        const scenarioX = x + 400;
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('适用场景', scenarioX, y);
        
        const scenarios = this.getUsageScenarios();
        scenarios.forEach((scenario, index) => {
            const scenarioY = y + 25 + index * 20;
            
            this.ctx.fillStyle = '#48bb78';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`• ${scenario}`, scenarioX, scenarioY);
        });
    }
    
    getTechnicalFeatures() {
        const features = {
            'ZGC': [
                '彩色指针技术 (Colored Pointers)',
                '并发标记和重定位',
                '区域化内存管理',
                '负载屏障 (Load Barriers)',
                '支持TB级堆内存'
            ],
            'Shenandoah': [
                'Brooks指针技术',
                '并发疏散 (Concurrent Evacuation)',
                '连接矩阵 (Connection Matrix)',
                '部分并行标记',
                '适应性大小调整'
            ]
        };
        
        return features[this.currentCollector] || [];
    }
    
    getUsageScenarios() {
        const scenarios = {
            'ZGC': [
                '大内存应用 (>32GB)',
                '低延迟要求 (<10ms)',
                '实时交易系统',
                '大数据处理平台',
                '高并发Web服务'
            ],
            'Shenandoah': [
                '中等内存应用 (8-64GB)',
                '响应时间敏感应用',
                '微服务架构',
                '容器化部署',
                '云原生应用'
            ]
        };
        
        return scenarios[this.currentCollector] || [];
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateLowLatencyGCStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateLowLatencyGCStep() {
        switch (this.step) {
            case 1: // 开始并发标记
                this.memoryRegions[0].status = 'marking';
                break;
            case 2: // 标记完成
                this.memoryRegions[0].status = 'marked';
                this.memoryRegions[1].status = 'relocating';
                break;
            case 3: // 开始重定位
                this.memoryRegions[1].used = 20;
                this.memoryRegions[2].used = 60;
                break;
            case 4: // 重定位完成
                this.memoryRegions[1].status = 'free';
                this.memoryRegions[1].used = 0;
                break;
            case 5: // 引用处理
                this.memoryRegions[3].status = 'processing';
                break;
            case 6: // 根扫描暂停
                this.memoryRegions.forEach(region => {
                    if (region.status === 'processing') {
                        region.status = 'active';
                    }
                });
                break;
        }
    }
    
    switchCollector(collector) {
        this.currentCollector = collector;
        this.reset();
    }
    
    reset() {
        this.step = 0;
        this.initializeLowLatencyGC();
    }
}

// 引用计数与可达性分析演示类
class ReferenceAnalysisDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.currentMethod = 'reachability';
        this.objects = [];
        this.references = [];
        this.gcRoots = [];
        this.initializeReferenceAnalysis();
    }
    
    initializeReferenceAnalysis() {
        // 创建对象
        this.objects = [
            { id: 'A', x: 100, y: 100, refCount: 2, reachable: true, marked: false },
            { id: 'B', x: 200, y: 100, refCount: 1, reachable: true, marked: false },
            { id: 'C', x: 300, y: 100, refCount: 1, reachable: false, marked: false },
            { id: 'D', x: 150, y: 180, refCount: 2, reachable: true, marked: false },
            { id: 'E', x: 250, y: 180, refCount: 1, reachable: false, marked: false },
            { id: 'F', x: 350, y: 180, refCount: 0, reachable: false, marked: false }
        ];
        
        // 创建引用关系
        this.references = [
            { from: 'Root1', to: 'A', type: 'strong' },
            { from: 'Root2', to: 'B', type: 'strong' },
            { from: 'A', to: 'D', type: 'strong' },
            { from: 'B', to: 'D', type: 'strong' },
            { from: 'C', to: 'E', type: 'strong' },
            { from: 'E', to: 'C', type: 'strong' } // 循环引用
        ];
        
        // GC Roots
        this.gcRoots = [
            { id: 'Root1', x: 50, y: 50, type: 'Stack Variable' },
            { id: 'Root2', x: 150, y: 50, type: 'Static Variable' }
        ];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('引用计数 vs 可达性分析', 20, 30);
        
        // 绘制方法切换
        this.drawMethodSwitch();
        
        // 绘制GC Roots
        this.drawGCRoots();
        
        // 绘制对象
        this.drawObjects();
        
        // 绘制引用关系
        this.drawReferences();
        
        // 绘制算法说明
        this.drawAlgorithmExplanation();
        
        // 绘制问题对比
        this.drawProblemComparison();
    }
    
    drawMethodSwitch() {
        const x = 20;
        const y = 60;
        
        this.ctx.fillStyle = '#4299e1';
        this.ctx.font = 'bold 16px Arial';
        const methodNames = {
            'reachability': '可达性分析',
            'refCount': '引用计数'
        };
        this.ctx.fillText(`当前方法: ${methodNames[this.currentMethod]}`, x, y);
        
        // 方法切换按钮
        const methods = ['reachability', 'refCount'];
        methods.forEach((method, index) => {
            const btnX = x + 200 + index * 120;
            const btnY = y - 20;
            const isActive = method === this.currentMethod;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#e2e8f0';
            this.ctx.fillRect(btnX, btnY, 110, 30);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(btnX, btnY, 110, 30);
            
            this.ctx.fillStyle = isActive ? 'white' : '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(methodNames[method], btnX + 10, btnY + 20);
        });
    }
    
    drawGCRoots() {
        this.gcRoots.forEach(root => {
            // 根对象
            this.ctx.fillStyle = '#f56565';
            this.ctx.fillRect(root.x - 15, root.y - 15, 30, 30);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(root.x - 15, root.y - 15, 30, 30);
            
            // 根标识
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.fillText('ROOT', root.x - 12, root.y + 3);
            
            // 根类型
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '9px Arial';
            this.ctx.fillText(root.type, root.x - 20, root.y + 25);
        });
    }
    
    drawObjects() {
        this.objects.forEach(obj => {
            let fillColor = '#e2e8f0';
            let strokeColor = '#a0aec0';
            
            if (this.currentMethod === 'reachability') {
                if (this.step >= 2 && obj.marked) {
                    fillColor = '#48bb78';
                    strokeColor = '#38a169';
                } else if (this.step >= 4 && !obj.reachable) {
                    fillColor = '#f56565';
                    strokeColor = '#e53e3e';
                } else if (obj.reachable) {
                    fillColor = '#4299e1';
                    strokeColor = '#3182ce';
                }
            } else {
                if (obj.refCount > 0) {
                    fillColor = '#4299e1';
                    strokeColor = '#3182ce';
                } else {
                    fillColor = '#f56565';
                    strokeColor = '#e53e3e';
                }
            }
            
            // 对象圆形
            this.ctx.fillStyle = fillColor;
            this.ctx.beginPath();
            this.ctx.arc(obj.x, obj.y, 20, 0, 2 * Math.PI);
            this.ctx.fill();
            
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 对象ID
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(obj.id, obj.x - 5, obj.y + 5);
            
            // 引用计数或可达性状态
            if (this.currentMethod === 'refCount') {
                this.ctx.fillStyle = '#2d3748';
                this.ctx.font = '10px Arial';
                this.ctx.fillText(`RC:${obj.refCount}`, obj.x - 10, obj.y + 35);
            } else {
                const status = obj.reachable ? '可达' : '不可达';
                this.ctx.fillStyle = obj.reachable ? '#48bb78' : '#f56565';
                this.ctx.font = '9px Arial';
                this.ctx.fillText(status, obj.x - 12, obj.y + 35);
            }
        });
    }
    
    drawReferences() {
        this.references.forEach(ref => {
            let fromObj = this.gcRoots.find(r => r.id === ref.from) || this.objects.find(o => o.id === ref.from);
            let toObj = this.objects.find(o => o.id === ref.to);
            
            if (!fromObj || !toObj) return;
            
            // 引用箭头
            let strokeColor = '#4a5568';
            if (ref.from === 'C' && ref.to === 'E' || ref.from === 'E' && ref.to === 'C') {
                strokeColor = '#f56565'; // 循环引用用红色
            }
            
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(fromObj.x, fromObj.y);
            this.ctx.lineTo(toObj.x, toObj.y);
            this.ctx.stroke();
            
            // 箭头头部
            const angle = Math.atan2(toObj.y - fromObj.y, toObj.x - fromObj.x);
            const headLength = 10;
            
            this.ctx.beginPath();
            this.ctx.moveTo(toObj.x - 20 * Math.cos(angle), toObj.y - 20 * Math.sin(angle));
            this.ctx.lineTo(
                toObj.x - 20 * Math.cos(angle) - headLength * Math.cos(angle - Math.PI / 6),
                toObj.y - 20 * Math.sin(angle) - headLength * Math.sin(angle - Math.PI / 6)
            );
            this.ctx.moveTo(toObj.x - 20 * Math.cos(angle), toObj.y - 20 * Math.sin(angle));
            this.ctx.lineTo(
                toObj.x - 20 * Math.cos(angle) - headLength * Math.cos(angle + Math.PI / 6),
                toObj.y - 20 * Math.sin(angle) - headLength * Math.sin(angle + Math.PI / 6)
            );
            this.ctx.stroke();
        });
    }
    
    drawAlgorithmExplanation() {
        const x = 450;
        const y = 100;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(`${this.currentMethod === 'reachability' ? '可达性分析' : '引用计数'}算法`, x, y);
        
        const explanations = this.getAlgorithmExplanation();
        
        explanations.forEach((exp, index) => {
            const expY = y + 25 + index * 18;
            const isActive = index <= this.step;
            
            this.ctx.fillStyle = isActive ? '#4299e1' : '#a0aec0';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`${index + 1}. ${exp}`, x, expY);
        });
    }
    
    getAlgorithmExplanation() {
        if (this.currentMethod === 'reachability') {
            return [
                '从GC Roots开始遍历',
                '标记所有可达对象',
                '未标记对象为垃圾',
                '回收垃圾对象',
                '能处理循环引用',
                '主流JVM采用方案'
            ];
        } else {
            return [
                '每个对象维护引用计数',
                '引用增加时计数+1',
                '引用删除时计数-1',
                '计数为0时回收对象',
                '无法处理循环引用',
                '需要额外机制解决'
            ];
        }
    }
    
    drawProblemComparison() {
        const x = 450;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('算法对比', x, y);
        
        const comparison = [
            { aspect: '循环引用', reachability: '✓ 能处理', refCount: '✗ 无法处理' },
            { aspect: '实时性', reachability: '✗ 需要暂停', refCount: '✓ 实时回收' },
            { aspect: '空间开销', reachability: '✓ 较小', refCount: '✗ 每对象额外计数' },
            { aspect: '时间开销', reachability: '✗ 集中式GC', refCount: '✓ 分散式处理' },
            { aspect: '实现复杂度', reachability: '✓ 相对简单', refCount: '✗ 需要额外机制' }
        ];
        
        comparison.forEach((comp, index) => {
            const compY = y + 25 + index * 20;
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '11px Arial';
            this.ctx.fillText(comp.aspect, x, compY);
            
            // 可达性分析
            this.ctx.fillStyle = comp.reachability.startsWith('✓') ? '#48bb78' : '#f56565';
            this.ctx.fillText(comp.reachability, x + 80, compY);
            
            // 引用计数
            this.ctx.fillStyle = comp.refCount.startsWith('✓') ? '#48bb78' : '#f56565';
            this.ctx.fillText(comp.refCount, x + 180, compY);
        });
        
        // 循环引用示例
        if (this.currentMethod === 'refCount') {
            const exampleY = y + 150;
            this.ctx.fillStyle = '#f56565';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('循环引用问题示例:', x, exampleY);
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('对象C和E相互引用，引用计数永远不为0', x, exampleY + 15);
            this.ctx.fillText('即使从根对象不可达，也无法被回收', x, exampleY + 30);
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateAnalysisStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateAnalysisStep() {
        if (this.currentMethod === 'reachability') {
            switch (this.step) {
                case 1: // 开始从根遍历
                    this.objects.find(o => o.id === 'A').marked = true;
                    this.objects.find(o => o.id === 'B').marked = true;
                    break;
                case 2: // 标记可达对象
                    this.objects.find(o => o.id === 'D').marked = true;
                    break;
                case 3: // 标记完成
                    break;
                case 4: // 识别垃圾对象
                    this.objects.forEach(obj => {
                        if (!obj.marked) {
                            obj.reachable = false;
                        }
                    });
                    break;
            }
        } else {
            // 引用计数模拟
            switch (this.step) {
                case 1:
                    // 删除某个引用
                    this.objects.find(o => o.id === 'F').refCount = 0;
                    break;
                case 2:
                    // 模拟循环引用问题
                    break;
            }
        }
    }
    
    switchMethod(method) {
        this.currentMethod = method;
        this.reset();
    }
    
    reset() {
        this.step = 0;
        this.initializeReferenceAnalysis();
    }
}

// 演示管理功能
function openDemo(demoType) {
    const modal = document.getElementById('demoModal');
    const canvas = document.getElementById('demoCanvas');
    const demoTitle = document.getElementById('demoTitle');
    
    // 设置标题
    const titles = {
        'gc-algorithms': '垃圾收集算法演示',
        'gc-collectors': '垃圾收集器演示',
        'memory-allocation': '内存分配策略演示',
        'gc-tuning': 'GC调优实战演示',
        'low-latency-gc': '低延迟垃圾收集器演示',
        'reference-analysis': '引用计数与可达性分析演示'
    };
    demoTitle.textContent = titles[demoType] || '演示';
    
    // 调整画布大小
    resizeCanvas();
    
    // 创建对应的演示实例
    switch (demoType) {
        case 'gc-algorithms':
            currentDemo = new GCAlgorithmsDemo(canvas);
            break;
        case 'gc-collectors':
            currentDemo = new GCCollectorsDemo(canvas);
            break;
        case 'memory-allocation':
            currentDemo = new MemoryAllocationDemo(canvas);
            break;
        case 'gc-tuning':
            currentDemo = new GCTuningDemo(canvas);
            break;
        case 'low-latency-gc':
            currentDemo = new LowLatencyGCDemo(canvas);
            break;
        case 'reference-analysis':
            currentDemo = new ReferenceAnalysisDemo(canvas);
            break;
    }
    
    // 初始化步骤指示器
    initializeStepIndicator(currentDemo.maxSteps);
    
    // 绘制初始状态
    currentDemo.draw();
    
    // 显示模态框
    modal.style.display = 'flex';
}

function closeDemo() {
    const modal = document.getElementById('demoModal');
    modal.style.display = 'none';
    
    // 停止动画
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置状态
    currentDemo = null;
    demoSystem.isRunning = false;
    isPaused = false;
    currentStep = 0;
}

function resizeCanvas() {
    const canvas = document.getElementById('demoCanvas');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth - 40;
    canvas.height = container.clientHeight - 40;
}

function initializeStepIndicator(maxSteps) {
    const container = document.getElementById('stepIndicator');
    container.innerHTML = '';
    
    for (let i = 0; i < maxSteps; i++) {
        const step = document.createElement('div');
        step.className = 'step';
        step.textContent = i + 1;
        if (i === 0) step.classList.add('active');
        container.appendChild(step);
    }
}

function updateStepIndicator(currentStep, maxSteps) {
    const steps = document.querySelectorAll('#stepIndicator .step');
    steps.forEach((step, index) => {
        step.classList.remove('active', 'completed');
        if (index < currentStep) {
            step.classList.add('completed');
        } else if (index === currentStep) {
            step.classList.add('active');
        }
    });
}

function updateStatusPanel() {
    const statusPanel = document.getElementById('statusPanel');
    if (!currentDemo) return;
    
    let statusHTML = `
        <div class="status-item">
            <span class="status-label">当前步骤:</span>
            <span class="status-value">${currentStep + 1}/${currentDemo.maxSteps}</span>
        </div>
        <div class="status-item">
            <span class="status-label">演示状态:</span>
            <span class="status-value">${demoSystem.isRunning ? '运行中' : '已停止'}</span>
        </div>
    `;
    
    // 根据不同演示类型添加特定状态
    if (currentDemo instanceof GCAlgorithmsDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">当前算法:</span>
                <span class="status-value">${currentDemo.currentAlgorithm}</span>
            </div>
            <div class="status-item">
                <span class="status-label">内存块数:</span>
                <span class="status-value">${currentDemo.memoryBlocks.length}</span>
            </div>
        `;
    } else if (currentDemo instanceof GCCollectorsDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">当前收集器:</span>
                <span class="status-value">${currentDemo.currentCollector}</span>
            </div>
            <div class="status-item">
                <span class="status-label">GC线程数:</span>
                <span class="status-value">${currentDemo.gcThreads.length}</span>
            </div>
        `;
    } else if (currentDemo instanceof MemoryAllocationDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">对象总数:</span>
                <span class="status-value">${currentDemo.objects.length}</span>
            </div>
            <div class="status-item">
                <span class="status-label">分配事件:</span>
                <span class="status-value">${currentDemo.allocationEvents.length}</span>
            </div>
        `;
    } else if (currentDemo instanceof GCTuningDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">吞吐量:</span>
                <span class="status-value">${currentDemo.performanceMetrics.throughput}%</span>
            </div>
            <div class="status-item">
                <span class="status-label">延迟:</span>
                <span class="status-value">${currentDemo.performanceMetrics.latency}ms</span>
            </div>
        `;
    } else if (currentDemo instanceof LowLatencyGCDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">当前收集器:</span>
                <span class="status-value">${currentDemo.currentCollector}</span>
            </div>
            <div class="status-item">
                <span class="status-label">内存区域:</span>
                <span class="status-value">${currentDemo.memoryRegions.length}</span>
            </div>
        `;
    } else if (currentDemo instanceof ReferenceAnalysisDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">分析方法:</span>
                <span class="status-value">${currentDemo.currentMethod === 'reachability' ? '可达性分析' : '引用计数'}</span>
            </div>
            <div class="status-item">
                <span class="status-label">对象数量:</span>
                <span class="status-value">${currentDemo.objects.length}</span>
            </div>
        `;
    }
    
    statusPanel.innerHTML = statusHTML;
}

// 演示控制函数
function startDemo() {
    if (!currentDemo) return;
    
    demoSystem.isRunning = true;
    isPaused = false;
    
    function animate() {
        if (!demoSystem.isRunning || isPaused) return;
        
        const hasNext = currentDemo.nextStep();
        currentStep = currentDemo.step;
        
        currentDemo.draw();
        updateStepIndicator(currentStep, currentDemo.maxSteps);
        updateStatusPanel();
        
        if (hasNext) {
            animationId = setTimeout(() => {
                requestAnimationFrame(animate);
            }, 2000 / demoSpeed);
        } else {
            demoSystem.isRunning = false;
            updateStatusPanel();
        }
    }
    
    animate();
}

function pauseDemo() {
    isPaused = !isPaused;
    const pauseBtn = document.querySelector('button[onclick="pauseDemo()"]');
    pauseBtn.textContent = isPaused ? '继续' : '暂停';
    
    if (!isPaused && demoSystem.isRunning) {
        startDemo();
    }
    
    updateStatusPanel();
}

function resetDemo() {
    if (!currentDemo) return;
    
    // 停止动画
    if (animationId) {
        clearTimeout(animationId);
        animationId = null;
    }
    
    // 重置状态
    demoSystem.isRunning = false;
    isPaused = false;
    currentStep = 0;
    
    // 重置演示
    currentDemo.reset();
    currentDemo.draw();
    
    // 更新UI
    updateStepIndicator(0, currentDemo.maxSteps);
    updateStatusPanel();
    
    const pauseBtn = document.querySelector('button[onclick="pauseDemo()"]');
    pauseBtn.textContent = '暂停';
}

function stepDemo() {
    if (!currentDemo || demoSystem.isRunning) return;
    
    const hasNext = currentDemo.nextStep();
    currentStep = currentDemo.step;
    
    currentDemo.draw();
    updateStepIndicator(currentStep, currentDemo.maxSteps);
    updateStatusPanel();
}

function adjustSpeed(newSpeed) {
    demoSpeed = newSpeed;
    document.getElementById('speedValue').textContent = `${newSpeed}x`;
}

// 窗口事件处理
window.addEventListener('resize', () => {
    if (currentDemo) {
        resizeCanvas();
        currentDemo.draw();
    }
});

// 点击模态框外部关闭
document.getElementById('demoModal').addEventListener('click', (e) => {
    if (e.target.id === 'demoModal') {
        closeDemo();
    }
});