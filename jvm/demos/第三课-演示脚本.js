// 第三课：JVM内存数据区深度解析 - 演示脚本

// 全局变量
let currentDemo = null;
let animationId = null;
let demoSpeed = 1;
let isPaused = false;
let currentStep = 0;
let demoSystem = {
    isRunning: false,
    currentPhase: '',
    memoryUsage: {
        heap: { used: 0, max: 1024, young: 0, old: 0 },
        methodArea: { used: 0, max: 256 },
        stack: { used: 0, max: 128 },
        pcRegister: { used: 0, max: 8 },
        nativeStack: { used: 0, max: 64 },
        directMemory: { used: 0, max: 512 }
    },
    objects: [],
    stackFrames: [],
    gcCount: 0
};

// JVM内存结构总览演示类
class MemoryOverviewDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 6;
        this.memoryAreas = [
            { name: '堆内存', color: '#4299e1', x: 100, y: 50, width: 200, height: 150, visible: false },
            { name: '方法区', color: '#48bb78', x: 350, y: 50, width: 150, height: 100, visible: false },
            { name: '虚拟机栈', color: '#ed8936', x: 550, y: 50, width: 100, height: 200, visible: false },
            { name: '程序计数器', color: '#9f7aea', x: 100, y: 250, width: 80, height: 50, visible: false },
            { name: '本地方法栈', color: '#f56565', x: 220, y: 250, width: 100, height: 80, visible: false },
            { name: '直接内存', color: '#38b2ac', x: 400, y: 250, width: 150, height: 60, visible: false }
        ];
        this.connections = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('JVM内存结构总览', 20, 30);
        
        // 绘制内存区域
        this.memoryAreas.forEach((area, index) => {
            if (index <= this.step) {
                area.visible = true;
                this.drawMemoryArea(area);
            }
        });
        
        // 绘制连接线
        this.drawConnections();
        
        // 绘制说明文字
        this.drawDescription();
    }
    
    drawMemoryArea(area) {
        // 绘制区域框
        this.ctx.fillStyle = area.color;
        this.ctx.fillRect(area.x, area.y, area.width, area.height);
        
        // 绘制边框
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(area.x, area.y, area.width, area.height);
        
        // 绘制区域名称
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText(area.name, area.x + 10, area.y + 25);
        
        // 绘制特性描述
        this.ctx.font = '10px Arial';
        const descriptions = this.getAreaDescription(area.name);
        descriptions.forEach((desc, index) => {
            this.ctx.fillText(desc, area.x + 10, area.y + 45 + index * 15);
        });
    }
    
    getAreaDescription(areaName) {
        const descriptions = {
            '堆内存': ['存储对象实例', '分为新生代和老年代', '垃圾回收主要区域'],
            '方法区': ['存储类信息', '常量池', '静态变量'],
            '虚拟机栈': ['存储栈帧', '局部变量表', '操作数栈'],
            '程序计数器': ['当前执行指令', '线程私有', '唯一不会OOM'],
            '本地方法栈': ['本地方法调用', 'JNI接口', '线程私有'],
            '直接内存': ['堆外内存', 'NIO使用', '不受GC管理']
        };
        return descriptions[areaName] || [];
    }
    
    drawConnections() {
        if (this.step >= 3) {
            // 绘制堆内存与方法区的连接
            this.drawArrow(300, 125, 350, 100, '#718096');
            this.ctx.fillStyle = '#718096';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('类信息引用', 310, 110);
        }
        
        if (this.step >= 4) {
            // 绘制虚拟机栈与堆内存的连接
            this.drawArrow(550, 150, 300, 150, '#718096');
            this.ctx.fillStyle = '#718096';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('对象引用', 400, 140);
        }
    }
    
    drawArrow(x1, y1, x2, y2, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        // 箭头头部
        const headLength = 10;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.stroke();
    }
    
    drawDescription() {
        const x = 50;
        const y = 350;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('内存区域特点', x, y);
        
        const currentArea = this.memoryAreas[this.step];
        if (currentArea) {
            this.ctx.fillStyle = currentArea.color;
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(`当前展示: ${currentArea.name}`, x, y + 30);
            
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '12px Arial';
            
            const details = this.getDetailedDescription(currentArea.name);
            details.forEach((detail, index) => {
                this.ctx.fillText(detail, x, y + 55 + index * 20);
            });
        }
    }
    
    getDetailedDescription(areaName) {
        const details = {
            '堆内存': [
                '• 所有线程共享的内存区域',
                '• 存储所有对象实例和数组',
                '• 是垃圾收集器管理的主要区域',
                '• 可以处于物理上不连续的内存空间中'
            ],
            '方法区': [
                '• 存储已被虚拟机加载的类信息',
                '• 包含运行时常量池',
                '• 存储静态变量和即时编译器编译后的代码',
                '• Java 8后被元空间(Metaspace)替代'
            ],
            '虚拟机栈': [
                '• 线程私有，生命周期与线程相同',
                '• 描述Java方法执行的内存模型',
                '• 每个方法执行时创建一个栈帧',
                '• 存储局部变量表、操作数栈等信息'
            ],
            '程序计数器': [
                '• 当前线程执行字节码的行号指示器',
                '• 线程私有，每个线程都有独立的程序计数器',
                '• 唯一不会出现OutOfMemoryError的区域',
                '• 执行本地方法时计数器值为空(Undefined)'
            ],
            '本地方法栈': [
                '• 为虚拟机使用到的Native方法服务',
                '• 与虚拟机栈作用相似',
                '• 有些虚拟机将本地方法栈和虚拟机栈合二为一',
                '• 会抛出StackOverflowError和OutOfMemoryError'
            ],
            '直接内存': [
                '• 不是虚拟机运行时数据区的一部分',
                '• NIO类使用Native函数库直接分配堆外内存',
                '• 不受Java堆大小限制',
                '• 可能导致OutOfMemoryError异常'
            ]
        };
        return details[areaName] || [];
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        this.memoryAreas.forEach(area => {
            area.visible = false;
        });
    }
}

// 堆内存详解演示类
class HeapMemoryDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.heapStructure = {
            youngGen: {
                eden: { used: 0, max: 80, objects: [] },
                survivor0: { used: 0, max: 10, objects: [] },
                survivor1: { used: 0, max: 10, objects: [] }
            },
            oldGen: { used: 0, max: 200, objects: [] }
        };
        this.gcEvents = [];
        this.objectId = 0;
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('堆内存分代结构', 20, 30);
        
        // 绘制堆内存结构
        this.drawHeapStructure();
        
        // 绘制对象分配过程
        this.drawObjectAllocation();
        
        // 绘制GC过程
        this.drawGCProcess();
        
        // 绘制内存使用统计
        this.drawMemoryStats();
    }
    
    drawHeapStructure() {
        const startX = 50;
        const startY = 60;
        
        // 新生代区域
        this.ctx.fillStyle = '#e6fffa';
        this.ctx.fillRect(startX, startY, 400, 120);
        this.ctx.strokeStyle = '#38b2ac';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(startX, startY, 400, 120);
        
        this.ctx.fillStyle = '#38b2ac';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('新生代 (Young Generation)', startX + 10, startY - 10);
        
        // Eden区
        this.drawMemoryRegion('Eden区', startX + 10, startY + 10, 200, 100, '#4fd1c7', this.heapStructure.youngGen.eden);
        
        // Survivor区
        this.drawMemoryRegion('S0', startX + 220, startY + 10, 80, 45, '#81e6d9', this.heapStructure.youngGen.survivor0);
        this.drawMemoryRegion('S1', startX + 220, startY + 65, 80, 45, '#81e6d9', this.heapStructure.youngGen.survivor1);
        
        // 老年代区域
        this.ctx.fillStyle = '#fef5e7';
        this.ctx.fillRect(startX, startY + 140, 400, 100);
        this.ctx.strokeStyle = '#ed8936';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(startX, startY + 140, 400, 100);
        
        this.ctx.fillStyle = '#ed8936';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('老年代 (Old Generation)', startX + 10, startY + 130);
        
        this.drawMemoryRegion('老年代', startX + 10, startY + 150, 380, 80, '#f6ad55', this.heapStructure.oldGen);
    }
    
    drawMemoryRegion(name, x, y, width, height, color, region) {
        // 背景
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
        
        // 边框
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, height);
        
        // 区域名称
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText(name, x + 5, y + 15);
        
        // 使用率
        const usagePercent = (region.used / region.max) * 100;
        this.ctx.font = '10px Arial';
        this.ctx.fillText(`${region.used}/${region.max}MB (${usagePercent.toFixed(1)}%)`, x + 5, y + 30);
        
        // 使用率条
        const barWidth = width - 10;
        const barHeight = 8;
        const barY = y + height - 15;
        
        this.ctx.fillStyle = '#e2e8f0';
        this.ctx.fillRect(x + 5, barY, barWidth, barHeight);
        
        this.ctx.fillStyle = usagePercent > 80 ? '#f56565' : '#48bb78';
        this.ctx.fillRect(x + 5, barY, barWidth * (usagePercent / 100), barHeight);
        
        // 绘制对象
        this.drawObjects(region.objects, x + 5, y + 35, width - 10, height - 55);
    }
    
    drawObjects(objects, x, y, width, height) {
        const objectSize = 8;
        const cols = Math.floor(width / (objectSize + 2));
        
        objects.forEach((obj, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const objX = x + col * (objectSize + 2);
            const objY = y + row * (objectSize + 2);
            
            if (objY + objectSize <= y + height) {
                this.ctx.fillStyle = obj.color || '#4299e1';
                this.ctx.fillRect(objX, objY, objectSize, objectSize);
                
                this.ctx.strokeStyle = '#2d3748';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(objX, objY, objectSize, objectSize);
            }
        });
    }
    
    drawObjectAllocation() {
        const x = 500;
        const y = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('对象分配过程', x, y);
        
        const steps = [
            '1. 新对象在Eden区分配',
            '2. Eden区满时触发Minor GC',
            '3. 存活对象移到Survivor区',
            '4. Survivor区对象年龄增长',
            '5. 达到阈值晋升到老年代',
            '6. 老年代满时触发Major GC',
            '7. Full GC清理整个堆',
            '8. 内存不足抛出OOM异常'
        ];
        
        this.ctx.font = '12px Arial';
        steps.forEach((step, index) => {
            const stepY = y + 25 + index * 20;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(x - 5, stepY - 12, 200, 16);
                this.ctx.fillStyle = 'white';
            } else if (isCompleted) {
                this.ctx.fillStyle = '#48bb78';
            } else {
                this.ctx.fillStyle = '#a0aec0';
            }
            
            this.ctx.fillText(step, x, stepY);
        });
    }
    
    drawGCProcess() {
        if (this.step >= 2) {
            const x = 500;
            const y = 250;
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText('GC事件记录', x, y);
            
            this.ctx.font = '10px Arial';
            this.gcEvents.slice(-5).forEach((event, index) => {
                const eventY = y + 20 + index * 15;
                this.ctx.fillStyle = event.type === 'Minor GC' ? '#4299e1' : '#f56565';
                this.ctx.fillText(`${event.type}: ${event.description}`, x, eventY);
            });
        }
    }
    
    drawMemoryStats() {
        const x = 50;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('内存使用统计', x, y);
        
        const totalUsed = this.heapStructure.youngGen.eden.used + 
                         this.heapStructure.youngGen.survivor0.used + 
                         this.heapStructure.youngGen.survivor1.used + 
                         this.heapStructure.oldGen.used;
        
        const totalMax = this.heapStructure.youngGen.eden.max + 
                        this.heapStructure.youngGen.survivor0.max + 
                        this.heapStructure.youngGen.survivor1.max + 
                        this.heapStructure.oldGen.max;
        
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = '#4a5568';
        this.ctx.fillText(`总使用量: ${totalUsed}MB / ${totalMax}MB`, x, y + 20);
        this.ctx.fillText(`使用率: ${((totalUsed / totalMax) * 100).toFixed(1)}%`, x, y + 40);
        this.ctx.fillText(`GC次数: ${this.gcEvents.length}`, x, y + 60);
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateStep();
        }
        return this.step < this.maxSteps;
    }
    
    simulateStep() {
        switch (this.step) {
            case 1: // 分配对象到Eden区
                this.allocateObjects(5, this.heapStructure.youngGen.eden);
                break;
            case 2: // Eden区满，触发Minor GC
                this.heapStructure.youngGen.eden.used = this.heapStructure.youngGen.eden.max;
                this.gcEvents.push({ type: 'Minor GC', description: 'Eden区已满，开始垃圾回收' });
                break;
            case 3: // 存活对象移到Survivor区
                this.moveObjects(this.heapStructure.youngGen.eden, this.heapStructure.youngGen.survivor0, 2);
                break;
            case 4: // 继续分配对象
                this.allocateObjects(3, this.heapStructure.youngGen.eden);
                break;
            case 5: // 对象晋升到老年代
                this.moveObjects(this.heapStructure.youngGen.survivor0, this.heapStructure.oldGen, 1);
                break;
            case 6: // 老年代GC
                this.gcEvents.push({ type: 'Major GC', description: '老年代垃圾回收' });
                break;
            case 7: // Full GC
                this.gcEvents.push({ type: 'Full GC', description: '全堆垃圾回收' });
                this.clearAllObjects();
                break;
        }
    }
    
    allocateObjects(count, region) {
        for (let i = 0; i < count && region.used < region.max; i++) {
            region.objects.push({
                id: this.objectId++,
                age: 0,
                color: '#4299e1'
            });
            region.used += Math.ceil(region.max / 20); // 每个对象占用一定空间
        }
    }
    
    moveObjects(fromRegion, toRegion, count) {
        const objectsToMove = fromRegion.objects.splice(0, count);
        objectsToMove.forEach(obj => {
            obj.age++;
            if (toRegion === this.heapStructure.oldGen) {
                obj.color = '#ed8936'; // 老年代对象颜色
            }
            toRegion.objects.push(obj);
        });
        
        fromRegion.used = Math.max(0, fromRegion.used - count * Math.ceil(fromRegion.max / 20));
        toRegion.used += count * Math.ceil(toRegion.max / 20);
    }
    
    clearAllObjects() {
        this.heapStructure.youngGen.eden.objects = [];
        this.heapStructure.youngGen.survivor0.objects = [];
        this.heapStructure.youngGen.survivor1.objects = [];
        this.heapStructure.oldGen.objects = [];
        
        this.heapStructure.youngGen.eden.used = 0;
        this.heapStructure.youngGen.survivor0.used = 0;
        this.heapStructure.youngGen.survivor1.used = 0;
        this.heapStructure.oldGen.used = 0;
    }
    
    reset() {
        this.step = 0;
        this.objectId = 0;
        this.gcEvents = [];
        this.clearAllObjects();
    }
}

// 方法区与元空间演示类
class MethodAreaDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 6;
        this.methodAreaContent = {
            classInfo: [],
            constantPool: [],
            staticVariables: [],
            methodCode: []
        };
        this.metaspaceUsage = { used: 0, max: 256 };
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('方法区与元空间', 20, 30);
        
        // 绘制方法区结构
        this.drawMethodAreaStructure();
        
        // 绘制Java 8变化
        this.drawJava8Changes();
        
        // 绘制内容详情
        this.drawContentDetails();
    }
    
    drawMethodAreaStructure() {
        const startX = 50;
        const startY = 60;
        const sectionWidth = 150;
        const sectionHeight = 100;
        const gap = 20;
        
        const sections = [
            { name: '类信息', color: '#4299e1', content: this.methodAreaContent.classInfo },
            { name: '常量池', color: '#48bb78', content: this.methodAreaContent.constantPool },
            { name: '静态变量', color: '#ed8936', content: this.methodAreaContent.staticVariables },
            { name: '方法代码', color: '#9f7aea', content: this.methodAreaContent.methodCode }
        ];
        
        sections.forEach((section, index) => {
            const x = startX + index * (sectionWidth + gap);
            const y = startY;
            const isVisible = index <= this.step;
            
            if (isVisible) {
                // 绘制区域
                this.ctx.fillStyle = section.color;
                this.ctx.fillRect(x, y, sectionWidth, sectionHeight);
                
                this.ctx.strokeStyle = '#2d3748';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, y, sectionWidth, sectionHeight);
                
                // 区域名称
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.fillText(section.name, x + 10, y + 25);
                
                // 内容数量
                this.ctx.font = '12px Arial';
                this.ctx.fillText(`${section.content.length} 项`, x + 10, y + 45);
                
                // 使用率
                const usage = Math.min((section.content.length / 10) * 100, 100);
                this.ctx.fillText(`${usage.toFixed(0)}% 使用`, x + 10, y + 65);
            }
        });
    }
    
    drawJava8Changes() {
        const x = 50;
        const y = 200;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('Java 8 重要变化', x, y);
        
        if (this.step >= 4) {
            // 绘制对比图
            const beforeX = x;
            const afterX = x + 300;
            const boxY = y + 20;
            const boxWidth = 200;
            const boxHeight = 80;
            
            // Java 7及之前
            this.ctx.fillStyle = '#fed7d7';
            this.ctx.fillRect(beforeX, boxY, boxWidth, boxHeight);
            this.ctx.strokeStyle = '#c53030';
            this.ctx.strokeRect(beforeX, boxY, boxWidth, boxHeight);
            
            this.ctx.fillStyle = '#c53030';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('Java 7及之前', beforeX + 10, boxY + 20);
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('• 永久代(PermGen)', beforeX + 10, boxY + 35);
            this.ctx.fillText('• 存储在堆内存中', beforeX + 10, boxY + 50);
            this.ctx.fillText('• 容易OutOfMemoryError', beforeX + 10, boxY + 65);
            
            // Java 8及之后
            this.ctx.fillStyle = '#c6f6d5';
            this.ctx.fillRect(afterX, boxY, boxWidth, boxHeight);
            this.ctx.strokeStyle = '#38a169';
            this.ctx.strokeRect(afterX, boxY, boxWidth, boxHeight);
            
            this.ctx.fillStyle = '#38a169';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('Java 8及之后', afterX + 10, boxY + 20);
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('• 元空间(Metaspace)', afterX + 10, boxY + 35);
            this.ctx.fillText('• 使用本地内存', afterX + 10, boxY + 50);
            this.ctx.fillText('• 自动扩展大小', afterX + 10, boxY + 65);
            
            // 箭头
            this.drawArrow(beforeX + boxWidth + 10, boxY + boxHeight / 2, afterX - 10, boxY + boxHeight / 2, '#4a5568');
        }
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
    
    drawContentDetails() {
        const x = 50;
        const y = 320;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('存储内容详解', x, y);
        
        if (this.step >= 1) {
            const details = [
                '类信息: 类的版本、字段、方法、接口等描述信息',
                '常量池: 编译期生成的各种字面量和符号引用',
                '静态变量: 类级别的变量，所有实例共享',
                '方法代码: 编译后的字节码指令'
            ];
            
            this.ctx.font = '12px Arial';
            this.ctx.fillStyle = '#4a5568';
            details.forEach((detail, index) => {
                if (index <= this.step) {
                    this.ctx.fillText(detail, x, y + 25 + index * 20);
                }
            });
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateContent();
        }
        return this.step < this.maxSteps;
    }
    
    simulateContent() {
        switch (this.step) {
            case 1:
                this.methodAreaContent.classInfo.push('MyClass', 'String', 'Object');
                break;
            case 2:
                this.methodAreaContent.constantPool.push('"Hello"', '100', 'MyClass.method');
                break;
            case 3:
                this.methodAreaContent.staticVariables.push('staticField', 'CONSTANT');
                break;
            case 4:
                this.methodAreaContent.methodCode.push('main()', 'toString()', 'equals()');
                break;
            case 5:
                this.metaspaceUsage.used = 128;
                break;
        }
    }
    
    reset() {
        this.step = 0;
        this.methodAreaContent = {
            classInfo: [],
            constantPool: [],
            staticVariables: [],
            methodCode: []
        };
        this.metaspaceUsage = { used: 0, max: 256 };
    }
}

// 虚拟机栈详解演示类
class VMStackDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.stackFrames = [];
        this.currentFrame = null;
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('虚拟机栈结构', 20, 30);
        
        // 绘制栈结构
        this.drawStackStructure();
        
        // 绘制栈帧详情
        this.drawStackFrameDetails();
        
        // 绘制方法调用过程
        this.drawMethodCallProcess();
    }
    
    drawStackStructure() {
        const stackX = 50;
        const stackY = 60;
        const stackWidth = 200;
        const frameHeight = 40;
        
        // 绘制栈容器
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(stackX, stackY, stackWidth, 300);
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('虚拟机栈', stackX, stackY - 10);
        
        // 绘制栈帧
        this.stackFrames.forEach((frame, index) => {
            const frameY = stackY + 300 - (index + 1) * (frameHeight + 5);
            
            // 栈帧背景
            this.ctx.fillStyle = frame.isActive ? '#4299e1' : '#e2e8f0';
            this.ctx.fillRect(stackX + 5, frameY, stackWidth - 10, frameHeight);
            
            // 栈帧边框
            this.ctx.strokeStyle = frame.isActive ? '#2b6cb0' : '#a0aec0';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(stackX + 5, frameY, stackWidth - 10, frameHeight);
            
            // 方法名
            this.ctx.fillStyle = frame.isActive ? 'white' : '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(frame.methodName, stackX + 15, frameY + 20);
            
            // 局部变量数量
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`局部变量: ${frame.localVariables.length}`, stackX + 15, frameY + 35);
        });
        
        // 栈指针
        if (this.stackFrames.length > 0) {
            const topFrameY = stackY + 300 - this.stackFrames.length * (frameHeight + 5);
            this.ctx.fillStyle = '#f56565';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('→ 栈顶', stackX + stackWidth + 10, topFrameY + 20);
        }
    }
    
    drawStackFrameDetails() {
        const detailX = 300;
        const detailY = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('栈帧结构详解', detailX, detailY);
        
        if (this.currentFrame) {
            const frameDetailY = detailY + 30;
            
            // 当前方法信息
            this.ctx.fillStyle = '#4299e1';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(`当前方法: ${this.currentFrame.methodName}`, detailX, frameDetailY);
            
            // 局部变量表
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('局部变量表:', detailX, frameDetailY + 30);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#4a5568';
            this.currentFrame.localVariables.forEach((variable, index) => {
                this.ctx.fillText(`[${index}] ${variable.name}: ${variable.value}`, detailX + 20, frameDetailY + 50 + index * 15);
            });
            
            // 操作数栈
            const operandStackY = frameDetailY + 50 + this.currentFrame.localVariables.length * 15 + 20;
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('操作数栈:', detailX, operandStackY);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#4a5568';
            this.currentFrame.operandStack.forEach((operand, index) => {
                this.ctx.fillText(`[${index}] ${operand}`, detailX + 20, operandStackY + 20 + index * 15);
            });
            
            // 动态链接
            const dynamicLinkY = operandStackY + 20 + this.currentFrame.operandStack.length * 15 + 20;
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('动态链接:', detailX, dynamicLinkY);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#4a5568';
            this.ctx.fillText('指向运行时常量池的方法引用', detailX + 20, dynamicLinkY + 20);
            
            // 方法返回地址
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('方法返回地址:', detailX, dynamicLinkY + 50);
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#4a5568';
            this.ctx.fillText(`PC: ${this.currentFrame.returnAddress}`, detailX + 20, dynamicLinkY + 70);
        }
    }
    
    drawMethodCallProcess() {
        const processX = 500;
        const processY = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('方法调用过程', processX, processY);
        
        const steps = [
            'main()方法开始执行',
            '创建main()栈帧',
            '调用methodA()',
            '创建methodA()栈帧',
            'methodA()调用methodB()',
            '创建methodB()栈帧',
            'methodB()执行完毕',
            '依次弹出栈帧'
        ];
        
        this.ctx.font = '12px Arial';
        steps.forEach((step, index) => {
            const stepY = processY + 30 + index * 20;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(processX - 5, stepY - 12, 180, 16);
                this.ctx.fillStyle = 'white';
            } else if (isCompleted) {
                this.ctx.fillStyle = '#48bb78';
            } else {
                this.ctx.fillStyle = '#a0aec0';
            }
            
            this.ctx.fillText(step, processX, stepY);
        });
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateMethodCall();
        }
        return this.step < this.maxSteps;
    }
    
    simulateMethodCall() {
        switch (this.step) {
            case 1: // 创建main()栈帧
                this.pushFrame('main()', ['args']);
                break;
            case 2: // 调用methodA()
                this.currentFrame.operandStack.push('methodA引用');
                break;
            case 3: // 创建methodA()栈帧
                this.pushFrame('methodA()', ['param1', 'localVar']);
                break;
            case 4: // methodA()调用methodB()
                this.currentFrame.operandStack.push('methodB引用');
                break;
            case 5: // 创建methodB()栈帧
                this.pushFrame('methodB()', ['param2']);
                break;
            case 6: // methodB()执行完毕
                this.currentFrame.operandStack.push('返回值');
                break;
            case 7: // 依次弹出栈帧
                this.popFrame();
                this.popFrame();
                break;
        }
    }
    
    pushFrame(methodName, localVars) {
        const frame = {
            methodName: methodName,
            localVariables: localVars.map((name, index) => ({ name, value: `value${index}` })),
            operandStack: [],
            returnAddress: `0x${Math.random().toString(16).substr(2, 8)}`,
            isActive: true
        };
        
        // 将之前的栈帧设为非活跃
        this.stackFrames.forEach(f => f.isActive = false);
        
        this.stackFrames.push(frame);
        this.currentFrame = frame;
    }
    
    popFrame() {
        if (this.stackFrames.length > 0) {
            this.stackFrames.pop();
            this.currentFrame = this.stackFrames.length > 0 ? this.stackFrames[this.stackFrames.length - 1] : null;
            if (this.currentFrame) {
                this.currentFrame.isActive = true;
            }
        }
    }
    
    reset() {
        this.step = 0;
        this.stackFrames = [];
        this.currentFrame = null;
    }
}

// 程序计数器与本地方法栈演示类
class PCAndNativeStackDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 6;
        this.pcValue = 0;
        this.bytecodeInstructions = [
            { pc: 0, instruction: 'iconst_1', description: '将常量1推入操作数栈' },
            { pc: 1, instruction: 'istore_1', description: '将栈顶值存储到局部变量1' },
            { pc: 2, instruction: 'iload_1', description: '将局部变量1推入操作数栈' },
            { pc: 3, instruction: 'iconst_2', description: '将常量2推入操作数栈' },
            { pc: 4, instruction: 'iadd', description: '执行整数加法' },
            { pc: 5, instruction: 'ireturn', description: '返回整数值' }
        ];
        this.nativeMethodStack = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('程序计数器与本地方法栈', 20, 30);
        
        // 绘制程序计数器
        this.drawProgramCounter();
        
        // 绘制字节码指令
        this.drawBytecodeInstructions();
        
        // 绘制本地方法栈
        this.drawNativeMethodStack();
        
        // 绘制特点说明
        this.drawCharacteristics();
    }
    
    drawProgramCounter() {
        const pcX = 50;
        const pcY = 60;
        const pcWidth = 150;
        const pcHeight = 80;
        
        // PC寄存器框
        this.ctx.fillStyle = '#9f7aea';
        this.ctx.fillRect(pcX, pcY, pcWidth, pcHeight);
        
        this.ctx.strokeStyle = '#2d3748';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(pcX, pcY, pcWidth, pcHeight);
        
        // 标题
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('程序计数器', pcX + 10, pcY + 25);
        
        // 当前PC值
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(`PC: ${this.pcValue}`, pcX + 10, pcY + 50);
        
        // 当前指令
        if (this.pcValue < this.bytecodeInstructions.length) {
            const currentInstruction = this.bytecodeInstructions[this.pcValue];
            this.ctx.font = '10px Arial';
            this.ctx.fillText(currentInstruction.instruction, pcX + 10, pcY + 70);
        }
    }
    
    drawBytecodeInstructions() {
        const instrX = 250;
        const instrY = 60;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('字节码指令序列', instrX, instrY);
        
        // 指令列表
        this.bytecodeInstructions.forEach((instr, index) => {
            const instrItemY = instrY + 30 + index * 25;
            const isCurrentPC = index === this.pcValue;
            
            // 高亮当前PC指向的指令
            if (isCurrentPC) {
                this.ctx.fillStyle = '#9f7aea';
                this.ctx.fillRect(instrX - 5, instrItemY - 15, 300, 20);
            }
            
            // PC值
            this.ctx.fillStyle = isCurrentPC ? 'white' : '#4a5568';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(`${instr.pc}:`, instrX, instrItemY);
            
            // 指令
            this.ctx.font = '12px Courier New';
            this.ctx.fillText(instr.instruction, instrX + 25, instrItemY);
            
            // 描述
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = isCurrentPC ? 'white' : '#718096';
            this.ctx.fillText(instr.description, instrX + 100, instrItemY);
        });
    }
    
    drawNativeMethodStack() {
        const nativeX = 50;
        const nativeY = 200;
        const nativeWidth = 200;
        const nativeHeight = 150;
        
        // 本地方法栈框
        this.ctx.fillStyle = '#f7fafc';
        this.ctx.fillRect(nativeX, nativeY, nativeWidth, nativeHeight);
        
        this.ctx.strokeStyle = '#f56565';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(nativeX, nativeY, nativeWidth, nativeHeight);
        
        // 标题
        this.ctx.fillStyle = '#f56565';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('本地方法栈', nativeX + 10, nativeY - 10);
        
        // 栈内容
        if (this.nativeMethodStack.length === 0) {
            this.ctx.fillStyle = '#a0aec0';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('(空)', nativeX + 10, nativeY + 30);
        } else {
            this.nativeMethodStack.forEach((method, index) => {
                const methodY = nativeY + 20 + index * 25;
                
                this.ctx.fillStyle = '#f56565';
                this.ctx.fillRect(nativeX + 10, methodY, nativeWidth - 20, 20);
                
                this.ctx.fillStyle = 'white';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(method, nativeX + 15, methodY + 15);
            });
        }
    }
    
    drawCharacteristics() {
        const charX = 300;
        const charY = 200;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('特点对比', charX, charY);
        
        // 程序计数器特点
        this.ctx.fillStyle = '#9f7aea';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('程序计数器特点:', charX, charY + 30);
        
        const pcCharacteristics = [
            '• 线程私有，每个线程都有独立的PC',
            '• 记录当前线程执行的字节码指令地址',
            '• 唯一不会出现OutOfMemoryError的区域',
            '• 执行本地方法时值为undefined'
        ];
        
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = '11px Arial';
        pcCharacteristics.forEach((char, index) => {
            this.ctx.fillText(char, charX, charY + 50 + index * 15);
        });
        
        // 本地方法栈特点
        this.ctx.fillStyle = '#f56565';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('本地方法栈特点:', charX, charY + 130);
        
        const nativeCharacteristics = [
            '• 为Native方法服务',
            '• 与虚拟机栈作用相似',
            '• 可能抛出StackOverflowError',
            '• 有些JVM将其与虚拟机栈合并'
        ];
        
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = '11px Arial';
        nativeCharacteristics.forEach((char, index) => {
            this.ctx.fillText(char, charX, charY + 150 + index * 15);
        });
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateExecution();
        }
        return this.step < this.maxSteps;
    }
    
    simulateExecution() {
        switch (this.step) {
            case 1:
                this.pcValue = 1;
                break;
            case 2:
                this.pcValue = 2;
                break;
            case 3:
                this.pcValue = 3;
                this.nativeMethodStack.push('System.currentTimeMillis()');
                break;
            case 4:
                this.pcValue = 4;
                break;
            case 5:
                this.pcValue = 5;
                this.nativeMethodStack.pop();
                break;
        }
    }
    
    reset() {
        this.step = 0;
        this.pcValue = 0;
        this.nativeMethodStack = [];
    }
}

// 直接内存与内存映射演示类
class DirectMemoryDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 6;
        this.directMemoryUsage = { used: 0, max: 512 };
        this.memoryMappedFiles = [];
        this.nioBuffers = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('直接内存与内存映射', 20, 30);
        
        // 绘制内存布局
        this.drawMemoryLayout();
        
        // 绘制NIO缓冲区
        this.drawNIOBuffers();
        
        // 绘制内存映射文件
        this.drawMemoryMappedFiles();
        
        // 绘制性能对比
        this.drawPerformanceComparison();
    }
    
    drawMemoryLayout() {
        const layoutX = 50;
        const layoutY = 60;
        
        // JVM堆内存
        this.ctx.fillStyle = '#e6fffa';
        this.ctx.fillRect(layoutX, layoutY, 200, 100);
        this.ctx.strokeStyle = '#38b2ac';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(layoutX, layoutY, 200, 100);
        
        this.ctx.fillStyle = '#38b2ac';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('JVM堆内存', layoutX + 10, layoutY + 25);
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('• 受GC管理', layoutX + 10, layoutY + 45);
        this.ctx.fillText('• 有大小限制', layoutX + 10, layoutY + 65);
        this.ctx.fillText('• 数据拷贝开销', layoutX + 10, layoutY + 85);
        
        // 直接内存
        this.ctx.fillStyle = '#fef5e7';
        this.ctx.fillRect(layoutX + 250, layoutY, 200, 100);
        this.ctx.strokeStyle = '#ed8936';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(layoutX + 250, layoutY, 200, 100);
        
        this.ctx.fillStyle = '#ed8936';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('直接内存', layoutX + 260, layoutY + 25);
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('• 不受GC管理', layoutX + 260, layoutY + 45);
        this.ctx.fillText('• 受物理内存限制', layoutX + 260, layoutY + 65);
        this.ctx.fillText('• 零拷贝技术', layoutX + 260, layoutY + 85);
        
        // 连接箭头
        if (this.step >= 2) {
            this.drawArrow(layoutX + 200, layoutY + 50, layoutX + 250, layoutY + 50, '#4a5568');
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '10px Arial';
            this.ctx.fillText('NIO操作', layoutX + 210, layoutY + 40);
        }
    }
    
    drawNIOBuffers() {
        const bufferX = 50;
        const bufferY = 200;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('NIO缓冲区类型', bufferX, bufferY);
        
        const bufferTypes = [
            { name: 'HeapByteBuffer', color: '#4299e1', inHeap: true },
            { name: 'DirectByteBuffer', color: '#ed8936', inHeap: false },
            { name: 'MappedByteBuffer', color: '#48bb78', inHeap: false }
        ];
        
        bufferTypes.forEach((buffer, index) => {
            if (index <= this.step - 1) {
                const bufferItemY = bufferY + 30 + index * 40;
                
                // 缓冲区框
                this.ctx.fillStyle = buffer.color;
                this.ctx.fillRect(bufferX, bufferItemY, 150, 30);
                
                this.ctx.strokeStyle = '#2d3748';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(bufferX, bufferItemY, 150, 30);
                
                // 缓冲区名称
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 12px Arial';
                this.ctx.fillText(buffer.name, bufferX + 10, bufferItemY + 20);
                
                // 位置标识
                this.ctx.fillStyle = '#2d3748';
                this.ctx.font = '10px Arial';
                const location = buffer.inHeap ? '堆内存' : '直接内存';
                this.ctx.fillText(location, bufferX + 160, bufferItemY + 20);
            }
        });
    }
    
    drawMemoryMappedFiles() {
        const mmfX = 300;
        const mmfY = 200;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('内存映射文件', mmfX, mmfY);
        
        if (this.step >= 4) {
            // 文件系统
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.fillRect(mmfX, mmfY + 20, 100, 60);
            this.ctx.strokeStyle = '#a0aec0';
            this.ctx.strokeRect(mmfX, mmfY + 20, 100, 60);
            
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('文件系统', mmfX + 10, mmfY + 40);
            this.ctx.fillText('data.txt', mmfX + 10, mmfY + 60);
            
            // 内存映射区域
            this.ctx.fillStyle = '#48bb78';
            this.ctx.fillRect(mmfX + 120, mmfY + 20, 100, 60);
            this.ctx.strokeStyle = '#38a169';
            this.ctx.strokeRect(mmfX + 120, mmfY + 20, 100, 60);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('内存映射', mmfX + 130, mmfY + 40);
            this.ctx.fillText('虚拟地址', mmfX + 130, mmfY + 60);
            
            // 映射箭头
            this.drawArrow(mmfX + 100, mmfY + 50, mmfX + 120, mmfY + 50, '#48bb78');
        }
    }
    
    drawPerformanceComparison() {
        const perfX = 50;
        const perfY = 320;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('性能对比', perfX, perfY);
        
        if (this.step >= 5) {
            const comparisons = [
                { operation: '大文件读取', heap: 85, direct: 45, unit: 'ms' },
                { operation: '网络传输', heap: 120, direct: 30, unit: 'ms' },
                { operation: '内存使用', heap: 200, direct: 50, unit: 'MB' }
            ];
            
            comparisons.forEach((comp, index) => {
                const compY = perfY + 30 + index * 60;
                
                // 操作名称
                this.ctx.fillStyle = '#2d3748';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(comp.operation, perfX, compY);
                
                // 堆内存性能条
                const heapBarWidth = (comp.heap / 200) * 100;
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(perfX + 100, compY - 15, heapBarWidth, 12);
                this.ctx.fillText(`堆内存: ${comp.heap}${comp.unit}`, perfX + 210, compY - 5);
                
                // 直接内存性能条
                const directBarWidth = (comp.direct / 200) * 100;
                this.ctx.fillStyle = '#ed8936';
                this.ctx.fillRect(perfX + 100, compY + 5, directBarWidth, 12);
                this.ctx.fillText(`直接内存: ${comp.direct}${comp.unit}`, perfX + 210, compY + 15);
            });
        }
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
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.simulateDirectMemory();
        }
        return this.step < this.maxSteps;
    }
    
    simulateDirectMemory() {
        switch (this.step) {
            case 1:
                this.nioBuffers.push({ type: 'HeapByteBuffer', size: 64 });
                break;
            case 2:
                this.nioBuffers.push({ type: 'DirectByteBuffer', size: 128 });
                this.directMemoryUsage.used += 128;
                break;
            case 3:
                this.nioBuffers.push({ type: 'MappedByteBuffer', size: 256 });
                this.directMemoryUsage.used += 256;
                break;
            case 4:
                this.memoryMappedFiles.push({ name: 'data.txt', size: 1024 });
                break;
            case 5:
                // 性能测试完成
                break;
        }
    }
    
    reset() {
        this.step = 0;
        this.directMemoryUsage = { used: 0, max: 512 };
        this.memoryMappedFiles = [];
        this.nioBuffers = [];
    }
}

// 演示管理功能
function openDemo(demoType) {
    const modal = document.getElementById('demo-modal');
    const canvas = document.getElementById('demo-canvas');
    const title = document.getElementById('demo-title');
    
    // 停止当前演示
    if (currentDemo) {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        currentDemo = null;
    }
    
    // 设置标题和创建对应的演示实例
    switch (demoType) {
        case 'memory-overview':
            title.textContent = 'JVM内存结构总览';
            currentDemo = new MemoryOverviewDemo(canvas);
            break;
        case 'heap-memory':
            title.textContent = '堆内存详解';
            currentDemo = new HeapMemoryDemo(canvas);
            break;
        case 'method-area':
            title.textContent = '方法区与元空间';
            currentDemo = new MethodAreaDemo(canvas);
            break;
        case 'vm-stack':
            title.textContent = '虚拟机栈详解';
            currentDemo = new VMStackDemo(canvas);
            break;
        case 'pc-native-stack':
            title.textContent = '程序计数器与本地方法栈';
            currentDemo = new PCAndNativeStackDemo(canvas);
            break;
        case 'direct-memory':
            title.textContent = '直接内存与内存映射';
            currentDemo = new DirectMemoryDemo(canvas);
            break;
    }
    
    // 调整画布大小
    resizeCanvas();
    
    // 初始化步骤指示器
    initializeStepIndicator();
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绘制初始状态
    if (currentDemo) {
        currentDemo.draw();
        updateStatusPanel();
    }
}

function closeDemo() {
    const modal = document.getElementById('demo-modal');
    
    // 停止动画
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置状态
    if (currentDemo) {
        currentDemo.reset();
        currentDemo = null;
    }
    
    isPaused = false;
    currentStep = 0;
    demoSystem.isRunning = false;
    
    // 隐藏模态框
    modal.style.display = 'none';
}

function resizeCanvas() {
    const canvas = document.getElementById('demo-canvas');
    const container = canvas.parentElement;
    
    canvas.width = container.clientWidth - 40;
    canvas.height = container.clientHeight - 40;
    
    if (currentDemo) {
        currentDemo.canvas = canvas;
        currentDemo.ctx = canvas.getContext('2d');
        currentDemo.draw();
    }
}

function initializeStepIndicator() {
    const indicator = document.getElementById('step-indicator');
    if (!currentDemo) return;
    
    indicator.innerHTML = '';
    
    for (let i = 0; i < currentDemo.maxSteps; i++) {
        const step = document.createElement('div');
        step.className = 'step';
        step.textContent = i + 1;
        
        if (i === 0) {
            step.classList.add('active');
        }
        
        indicator.appendChild(step);
    }
}

function updateStepIndicator() {
    const steps = document.querySelectorAll('.step');
    
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
    const statusPanel = document.getElementById('status-panel');
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
    
    // 根据不同演示类型添加特定状态信息
    if (currentDemo instanceof HeapMemoryDemo) {
        const totalUsed = currentDemo.heapStructure.youngGen.eden.used + 
                         currentDemo.heapStructure.youngGen.survivor0.used + 
                         currentDemo.heapStructure.youngGen.survivor1.used + 
                         currentDemo.heapStructure.oldGen.used;
        const totalMax = currentDemo.heapStructure.youngGen.eden.max + 
                        currentDemo.heapStructure.youngGen.survivor0.max + 
                        currentDemo.heapStructure.youngGen.survivor1.max + 
                        currentDemo.heapStructure.oldGen.max;
        
        statusHTML += `
            <div class="status-item">
                <span class="status-label">堆内存使用:</span>
                <span class="status-value">${totalUsed}MB/${totalMax}MB</span>
            </div>
            <div class="status-item">
                <span class="status-label">GC次数:</span>
                <span class="status-value">${currentDemo.gcEvents.length}</span>
            </div>
        `;
    } else if (currentDemo instanceof VMStackDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">栈帧数量:</span>
                <span class="status-value">${currentDemo.stackFrames.length}</span>
            </div>
            <div class="status-item">
                <span class="status-label">当前方法:</span>
                <span class="status-value">${currentDemo.currentFrame ? currentDemo.currentFrame.methodName : '无'}</span>
            </div>
        `;
    } else if (currentDemo instanceof DirectMemoryDemo) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">直接内存:</span>
                <span class="status-value">${currentDemo.directMemoryUsage.used}MB/${currentDemo.directMemoryUsage.max}MB</span>
            </div>
            <div class="status-item">
                <span class="status-label">NIO缓冲区:</span>
                <span class="status-value">${currentDemo.nioBuffers.length}个</span>
            </div>
        `;
    }
    
    statusPanel.innerHTML = statusHTML;
}

// 演示控制函数
function startDemo() {
    if (!currentDemo || demoSystem.isRunning) return;
    
    demoSystem.isRunning = true;
    isPaused = false;
    
    function animate() {
        if (!demoSystem.isRunning || isPaused) return;
        
        const hasNext = currentDemo.nextStep();
        currentStep = currentDemo.step;
        
        currentDemo.draw();
        updateStepIndicator();
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
    
    if (!isPaused && demoSystem.isRunning) {
        startDemo();
    }
}

function resetDemo() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        clearTimeout(animationId);
        animationId = null;
    }
    
    demoSystem.isRunning = false;
    isPaused = false;
    currentStep = 0;
    
    if (currentDemo) {
        currentDemo.reset();
        currentDemo.draw();
        updateStepIndicator();
        updateStatusPanel();
    }
}

function stepDemo() {
    if (!currentDemo || demoSystem.isRunning) return;
    
    const hasNext = currentDemo.nextStep();
    currentStep = currentDemo.step;
    
    currentDemo.draw();
    updateStepIndicator();
    updateStatusPanel();
}

function setDemoSpeed(speed) {
    demoSpeed = speed;
}

// 事件监听器
window.addEventListener('resize', resizeCanvas);

// 点击模态框外部关闭
document.getElementById('demo-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeDemo();
    }
});