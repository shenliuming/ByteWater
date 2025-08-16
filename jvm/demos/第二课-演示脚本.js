// 第二课：字节码加载与类生命周期 - 演示脚本

// 全局变量
let currentDemo = null;
let animationId = null;
let demoSpeed = 1;
let isPaused = false;
let currentStep = 0;
let demoSystem = {
    isRunning: false,
    currentPhase: '',
    loadedClasses: [],
    classLoaders: [],
    verificationSteps: [],
    initializationOrder: []
};

// 类加载触发时机演示类
class LoadingTriggersDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.scenarios = [
            { name: 'new 实例化', code: 'MyClass obj = new MyClass();', active: false },
            { name: '访问静态字段', code: 'int value = MyClass.staticField;', active: false },
            { name: '调用静态方法', code: 'MyClass.staticMethod();', active: false },
            { name: '反射调用', code: 'Class.forName("MyClass");', active: false },
            { name: '初始化子类', code: 'ChildClass child = new ChildClass();', active: false },
            { name: '数组引用(被动)', code: 'MyClass[] array = new MyClass[10];', passive: true },
            { name: '常量引用(被动)', code: 'String name = MyClass.CONSTANT;', passive: true },
            { name: '父类静态字段(被动)', code: 'int value = Child.parentField;', passive: true }
        ];
        this.classStates = {
            'MyClass': { loaded: false, initialized: false },
            'ChildClass': { loaded: false, initialized: false },
            'ParentClass': { loaded: false, initialized: false }
        };
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('类加载触发时机分析', 20, 40);
        
        // 绘制场景列表
        this.ctx.font = '16px Arial';
        let y = 80;
        this.scenarios.forEach((scenario, index) => {
            const isActive = index === this.step;
            const isPassive = scenario.passive;
            
            // 背景色
            if (isActive) {
                this.ctx.fillStyle = isPassive ? '#fed7d7' : '#c6f6d5';
                this.ctx.fillRect(20, y - 25, this.canvas.width - 40, 35);
            }
            
            // 文本颜色
            this.ctx.fillStyle = isActive ? '#2d3748' : '#718096';
            if (isPassive) {
                this.ctx.fillStyle = isActive ? '#c53030' : '#a0aec0';
            }
            
            // 场景名称
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(scenario.name, 30, y - 5);
            
            // 代码示例
            this.ctx.font = '12px Courier New';
            this.ctx.fillText(scenario.code, 200, y - 5);
            
            // 结果标识
            if (isActive) {
                const result = isPassive ? '不触发初始化' : '触发类加载和初始化';
                this.ctx.fillStyle = isPassive ? '#c53030' : '#38a169';
                this.ctx.font = 'bold 12px Arial';
                this.ctx.fillText(result, 500, y - 5);
            }
            
            y += 40;
        });
        
        // 绘制类状态图
        this.drawClassStates();
        
        // 绘制说明
        this.drawExplanation();
    }
    
    drawClassStates() {
        const startX = 50;
        const startY = 350;
        const boxWidth = 120;
        const boxHeight = 60;
        const gap = 20;
        
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = '#2d3748';
        this.ctx.fillText('类状态监控', startX, startY - 20);
        
        Object.keys(this.classStates).forEach((className, index) => {
            const x = startX + index * (boxWidth + gap);
            const y = startY;
            const state = this.classStates[className];
            
            // 绘制类框
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, boxWidth, boxHeight);
            
            // 背景色表示状态
            if (state.initialized) {
                this.ctx.fillStyle = '#c6f6d5';
            } else if (state.loaded) {
                this.ctx.fillStyle = '#faf089';
            } else {
                this.ctx.fillStyle = '#f7fafc';
            }
            this.ctx.fillRect(x + 1, y + 1, boxWidth - 2, boxHeight - 2);
            
            // 类名
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(className, x + 10, y + 20);
            
            // 状态文本
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`已加载: ${state.loaded ? '是' : '否'}`, x + 10, y + 35);
            this.ctx.fillText(`已初始化: ${state.initialized ? '是' : '否'}`, x + 10, y + 50);
        });
    }
    
    drawExplanation() {
        const currentScenario = this.scenarios[this.step];
        if (!currentScenario) return;
        
        const x = 450;
        const y = 350;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('当前场景分析:', x, y);
        
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = '#4a5568';
        
        if (currentScenario.passive) {
            this.ctx.fillText('这是被动引用场景:', x, y + 25);
            this.ctx.fillText('• 不会触发类的初始化', x, y + 45);
            this.ctx.fillText('• 可能触发类的加载', x, y + 65);
            this.ctx.fillText('• 静态代码块不会执行', x, y + 85);
        } else {
            this.ctx.fillText('这是主动引用场景:', x, y + 25);
            this.ctx.fillText('• 会触发类的加载', x, y + 45);
            this.ctx.fillText('• 会触发类的初始化', x, y + 65);
            this.ctx.fillText('• 静态代码块会执行', x, y + 85);
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            
            // 更新类状态
            const scenario = this.scenarios[this.step];
            if (!scenario.passive) {
                if (scenario.name.includes('MyClass') || scenario.name.includes('实例化')) {
                    this.classStates['MyClass'].loaded = true;
                    this.classStates['MyClass'].initialized = true;
                }
                if (scenario.name.includes('子类')) {
                    this.classStates['ParentClass'].loaded = true;
                    this.classStates['ParentClass'].initialized = true;
                    this.classStates['ChildClass'].loaded = true;
                    this.classStates['ChildClass'].initialized = true;
                }
            }
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        Object.keys(this.classStates).forEach(className => {
            this.classStates[className] = { loaded: false, initialized: false };
        });
    }
}

// 类加载五个阶段演示类
class LoadingPhasesDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 5;
        this.phases = [
            { name: '加载(Loading)', description: '查找并加载类的二进制数据', color: '#4299e1' },
            { name: '验证(Verification)', description: '确保被加载类的正确性', color: '#48bb78' },
            { name: '准备(Preparation)', description: '为类变量分配内存并设置默认值', color: '#ed8936' },
            { name: '解析(Resolution)', description: '将符号引用转换为直接引用', color: '#9f7aea' },
            { name: '初始化(Initialization)', description: '执行类构造器<clinit>()方法', color: '#f56565' }
        ];
        this.currentPhaseDetails = '';
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('类加载五个阶段', 20, 40);
        
        // 绘制阶段流程图
        this.drawPhaseFlow();
        
        // 绘制当前阶段详情
        this.drawPhaseDetails();
        
        // 绘制内存状态
        this.drawMemoryState();
    }
    
    drawPhaseFlow() {
        const startX = 50;
        const startY = 80;
        const phaseWidth = 140;
        const phaseHeight = 60;
        const gap = 10;
        
        this.phases.forEach((phase, index) => {
            const x = startX + index * (phaseWidth + gap);
            const y = startY;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            // 绘制阶段框
            this.ctx.fillStyle = isActive ? phase.color : (isCompleted ? '#a0aec0' : '#f7fafc');
            this.ctx.fillRect(x, y, phaseWidth, phaseHeight);
            
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.lineWidth = isActive ? 3 : 1;
            this.ctx.strokeRect(x, y, phaseWidth, phaseHeight);
            
            // 阶段名称
            this.ctx.fillStyle = isActive || isCompleted ? 'white' : '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(phase.name, x + 10, y + 25);
            
            // 状态指示器
            if (isCompleted) {
                this.ctx.fillStyle = '#38a169';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText('✓', x + phaseWidth - 25, y + 30);
            } else if (isActive) {
                this.ctx.fillStyle = '#ffd700';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText('●', x + phaseWidth - 25, y + 30);
            }
            
            // 绘制箭头
            if (index < this.phases.length - 1) {
                this.drawArrow(x + phaseWidth, y + phaseHeight / 2, x + phaseWidth + gap, y + phaseHeight / 2);
            }
        });
    }
    
    drawArrow(x1, y1, x2, y2) {
        this.ctx.strokeStyle = '#4a5568';
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
    
    drawPhaseDetails() {
        if (this.step >= this.phases.length) return;
        
        const phase = this.phases[this.step];
        const x = 50;
        const y = 180;
        
        // 当前阶段标题
        this.ctx.fillStyle = phase.color;
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`当前阶段: ${phase.name}`, x, y);
        
        // 阶段描述
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = '14px Arial';
        this.ctx.fillText(phase.description, x, y + 30);
        
        // 详细步骤
        this.ctx.font = '12px Arial';
        const details = this.getPhaseDetails(this.step);
        details.forEach((detail, index) => {
            this.ctx.fillText(`${index + 1}. ${detail}`, x + 20, y + 60 + index * 20);
        });
    }
    
    getPhaseDetails(phaseIndex) {
        const details = [
            [ // 加载阶段
                '通过类的全限定名获取二进制字节流',
                '将字节流代表的静态存储结构转化为方法区的运行时数据结构',
                '在内存中生成代表该类的Class对象'
            ],
            [ // 验证阶段
                '文件格式验证：验证字节流符合Class文件格式规范',
                '元数据验证：对字节码描述信息进行语义分析',
                '字节码验证：通过数据流和控制流分析确定程序语义合法',
                '符号引用验证：确保解析动作能正确执行'
            ],
            [ // 准备阶段
                '为类变量分配内存空间',
                '设置类变量的初始零值',
                '这些变量使用的内存都在方法区中分配'
            ],
            [ // 解析阶段
                '将常量池内的符号引用替换为直接引用',
                '解析类或接口、字段、类方法、接口方法',
                '符号引用验证确保引用的类、字段、方法存在'
            ],
            [ // 初始化阶段
                '执行类构造器<clinit>()方法',
                '为类变量赋予正确的初始值',
                '执行静态代码块'
            ]
        ];
        return details[phaseIndex] || [];
    }
    
    drawMemoryState() {
        const x = 450;
        const y = 180;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('内存状态变化', x, y);
        
        // 绘制内存区域
        const memoryAreas = [
            { name: '方法区', active: this.step >= 0, color: '#4299e1' },
            { name: '堆内存', active: this.step >= 0, color: '#48bb78' },
            { name: '程序计数器', active: this.step >= 4, color: '#ed8936' },
            { name: '虚拟机栈', active: this.step >= 4, color: '#9f7aea' }
        ];
        
        memoryAreas.forEach((area, index) => {
            const areaY = y + 30 + index * 30;
            
            // 内存区域框
            this.ctx.fillStyle = area.active ? area.color : '#f7fafc';
            this.ctx.fillRect(x, areaY, 100, 25);
            
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.strokeRect(x, areaY, 100, 25);
            
            // 区域名称
            this.ctx.fillStyle = area.active ? 'white' : '#a0aec0';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(area.name, x + 10, areaY + 17);
            
            // 状态描述
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '10px Arial';
            const status = area.active ? '已分配' : '未使用';
            this.ctx.fillText(status, x + 110, areaY + 17);
        });
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
    }
}

// 双亲委派模型演示类
class ParentDelegationDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 8;
        this.classLoaders = [
            { name: 'Bootstrap ClassLoader', level: 0, color: '#e53e3e', loaded: [] },
            { name: 'Extension ClassLoader', level: 1, color: '#38a169', loaded: [] },
            { name: 'Application ClassLoader', level: 2, color: '#805ad5', loaded: [] },
            { name: 'Custom ClassLoader', level: 3, color: '#4299e1', loaded: [] }
        ];
        this.currentRequest = '';
        this.delegationPath = [];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('双亲委派模型', 20, 40);
        
        // 绘制类加载器层次结构
        this.drawClassLoaderHierarchy();
        
        // 绘制委派过程
        this.drawDelegationProcess();
        
        // 绘制当前请求信息
        this.drawRequestInfo();
    }
    
    drawClassLoaderHierarchy() {
        const centerX = 200;
        const startY = 80;
        const levelHeight = 80;
        const boxWidth = 180;
        const boxHeight = 50;
        
        this.classLoaders.forEach((loader, index) => {
            const y = startY + index * levelHeight;
            const x = centerX - boxWidth / 2;
            
            // 绘制类加载器框
            this.ctx.fillStyle = loader.color;
            this.ctx.fillRect(x, y, boxWidth, boxHeight);
            
            this.ctx.strokeStyle = '#2d3748';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, boxWidth, boxHeight);
            
            // 类加载器名称
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(loader.name, x + 10, y + 20);
            
            // 已加载的类
            this.ctx.font = '10px Arial';
            const loadedText = loader.loaded.length > 0 ? `已加载: ${loader.loaded.join(', ')}` : '无已加载类';
            this.ctx.fillText(loadedText, x + 10, y + 35);
            
            // 绘制向上的箭头（除了顶层）
            if (index > 0) {
                this.drawUpArrow(centerX, y - 15, this.delegationPath.includes(index));
            }
        });
    }
    
    drawUpArrow(x, y, isActive) {
        this.ctx.strokeStyle = isActive ? '#f56565' : '#a0aec0';
        this.ctx.lineWidth = isActive ? 3 : 1;
        
        // 箭头线
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y - 15);
        this.ctx.stroke();
        
        // 箭头头部
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 15);
        this.ctx.lineTo(x - 5, y - 10);
        this.ctx.moveTo(x, y - 15);
        this.ctx.lineTo(x + 5, y - 10);
        this.ctx.stroke();
        
        if (isActive) {
            this.ctx.fillStyle = '#f56565';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.fillText('委派', x + 10, y - 5);
        }
    }
    
    drawDelegationProcess() {
        const x = 450;
        const y = 80;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('委派过程', x, y);
        
        const steps = [
            '1. 自定义类加载器接收加载请求',
            '2. 检查是否已经加载过该类',
            '3. 委派给父类加载器',
            '4. 父类加载器重复步骤2-3',
            '5. 到达顶层Bootstrap ClassLoader',
            '6. 尝试加载，失败则返回给子加载器',
            '7. 子加载器尝试自己加载',
            '8. 加载成功或抛出ClassNotFoundException'
        ];
        
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = '#4a5568';
        
        steps.forEach((step, index) => {
            const stepY = y + 30 + index * 25;
            const isActive = index === this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(x - 5, stepY - 15, 300, 20);
                this.ctx.fillStyle = 'white';
            } else {
                this.ctx.fillStyle = '#4a5568';
            }
            
            this.ctx.fillText(step, x, stepY);
        });
    }
    
    drawRequestInfo() {
        const x = 50;
        const y = 350;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('当前加载请求', x, y);
        
        if (this.currentRequest) {
            this.ctx.fillStyle = '#4299e1';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`类名: ${this.currentRequest}`, x, y + 25);
            
            this.ctx.fillStyle = '#4a5568';
            this.ctx.fillText(`委派路径: ${this.delegationPath.map(i => this.classLoaders[i].name).join(' → ')}`, x, y + 45);
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            
            // 模拟不同的加载场景
            switch (this.step) {
                case 0:
                    this.currentRequest = 'com.example.MyClass';
                    this.delegationPath = [3];
                    break;
                case 1:
                    this.delegationPath = [3];
                    break;
                case 2:
                    this.delegationPath = [3, 2];
                    break;
                case 3:
                    this.delegationPath = [3, 2, 1];
                    break;
                case 4:
                    this.delegationPath = [3, 2, 1, 0];
                    break;
                case 5:
                    // Bootstrap加载器尝试加载失败
                    break;
                case 6:
                    // Extension加载器尝试加载失败
                    break;
                case 7:
                    // Application加载器成功加载
                    this.classLoaders[2].loaded.push('MyClass');
                    break;
            }
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        this.currentRequest = '';
        this.delegationPath = [];
        this.classLoaders.forEach(loader => {
            loader.loaded = [];
        });
    }
}

// 字节码验证演示类
class BytecodeVerificationDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 4;
        this.verificationStages = [
            { name: '文件格式验证', color: '#4299e1', checks: [] },
            { name: '元数据验证', color: '#48bb78', checks: [] },
            { name: '字节码验证', color: '#ed8936', checks: [] },
            { name: '符号引用验证', color: '#9f7aea', checks: [] }
        ];
        this.currentChecks = [];
        this.passedChecks = 0;
        this.totalChecks = 0;
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('字节码验证机制', 20, 40);
        
        // 绘制验证阶段
        this.drawVerificationStages();
        
        // 绘制当前验证详情
        this.drawVerificationDetails();
        
        // 绘制验证进度
        this.drawVerificationProgress();
    }
    
    drawVerificationStages() {
        const startX = 50;
        const startY = 80;
        const stageWidth = 150;
        const stageHeight = 60;
        const gap = 20;
        
        this.verificationStages.forEach((stage, index) => {
            const x = startX + index * (stageWidth + gap);
            const y = startY;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            // 绘制阶段框
            this.ctx.fillStyle = isActive ? stage.color : (isCompleted ? '#a0aec0' : '#f7fafc');
            this.ctx.fillRect(x, y, stageWidth, stageHeight);
            
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.lineWidth = isActive ? 3 : 1;
            this.ctx.strokeRect(x, y, stageWidth, stageHeight);
            
            // 阶段名称
            this.ctx.fillStyle = isActive || isCompleted ? 'white' : '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(stage.name, x + 10, y + 30);
            
            // 状态指示器
            if (isCompleted) {
                this.ctx.fillStyle = '#38a169';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText('✓', x + stageWidth - 25, y + 35);
            } else if (isActive) {
                this.ctx.fillStyle = '#ffd700';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText('●', x + stageWidth - 25, y + 35);
            }
        });
    }
    
    drawVerificationDetails() {
        if (this.step >= this.verificationStages.length) return;
        
        const stage = this.verificationStages[this.step];
        const x = 50;
        const y = 180;
        
        // 当前阶段标题
        this.ctx.fillStyle = stage.color;
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`当前验证: ${stage.name}`, x, y);
        
        // 验证项目
        this.ctx.font = '12px Arial';
        const checks = this.getVerificationChecks(this.step);
        checks.forEach((check, index) => {
            const checkY = y + 40 + index * 25;
            const isPassed = index < this.passedChecks;
            
            // 检查项状态
            this.ctx.fillStyle = isPassed ? '#38a169' : '#4a5568';
            this.ctx.fillText(isPassed ? '✓' : '○', x, checkY);
            
            // 检查项描述
            this.ctx.fillStyle = isPassed ? '#2d3748' : '#718096';
            this.ctx.fillText(check, x + 20, checkY);
        });
    }
    
    getVerificationChecks(stageIndex) {
        const checks = [
            [ // 文件格式验证
                '检查魔数是否为0xCAFEBABE',
                '验证主次版本号是否在当前虚拟机处理范围内',
                '检查常量池的常量是否有不被支持的常量类型',
                '验证指向常量的各种索引值是否有指向不存在的常量',
                '检查CONSTANT_Utf8_info型的常量中是否有不符合UTF8编码的数据'
            ],
            [ // 元数据验证
                '验证这个类是否有父类（除了Object类之外）',
                '验证这个类的父类是否继承了不允许被继承的类（final修饰的类）',
                '如果这个类不是抽象类，是否实现了其父类或接口中要求实现的所有方法',
                '验证类中的字段、方法是否与父类产生矛盾'
            ],
            [ // 字节码验证
                '保证任意时刻操作数栈的数据类型与指令代码序列都能配合工作',
                '保证跳转指令不会跳转到方法体以外的字节码指令上',
                '保证方法体中的类型转换是有效的',
                '验证局部变量表中的数据类型与操作数栈中的数据类型匹配'
            ],
            [ // 符号引用验证
                '符号引用中通过字符串描述的全限定名是否能找到对应的类',
                '在指定类中是否存在符合方法的字段描述符以及简单名称所描述的方法和字段',
                '符号引用中的类、字段、方法的访问性是否可被当前类访问',
                '验证符号引用的正确性，确保解析动作能正常执行'
            ]
        ];
        return checks[stageIndex] || [];
    }
    
    drawVerificationProgress() {
        const x = 450;
        const y = 180;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('验证进度', x, y);
        
        // 进度条
        const progressWidth = 200;
        const progressHeight = 20;
        const progress = this.step / this.verificationStages.length;
        
        // 背景
        this.ctx.fillStyle = '#e2e8f0';
        this.ctx.fillRect(x, y + 20, progressWidth, progressHeight);
        
        // 进度
        this.ctx.fillStyle = '#4299e1';
        this.ctx.fillRect(x, y + 20, progressWidth * progress, progressHeight);
        
        // 进度文本
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(`${Math.round(progress * 100)}% 完成`, x, y + 60);
        
        // 验证结果
        if (this.step >= this.verificationStages.length) {
            this.ctx.fillStyle = '#38a169';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText('✓ 所有验证通过，类可以安全使用', x, y + 90);
        } else {
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`正在进行: ${this.verificationStages[this.step].name}`, x, y + 90);
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            this.passedChecks = 0; // 重置当前阶段的检查进度
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        this.passedChecks = 0;
        this.totalChecks = 0;
    }
}

// 类初始化过程演示类
class ClassInitializationDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 6;
        this.initializationSteps = [];
        this.staticVariables = [
            { name: 'staticInt', value: 0, finalValue: 100, initialized: false },
            { name: 'staticString', value: 'null', finalValue: '"Hello"', initialized: false },
            { name: 'staticObject', value: 'null', finalValue: 'new Object()', initialized: false }
        ];
        this.staticBlocks = [
            { id: 1, executed: false, code: 'System.out.println("Static block 1");' },
            { id: 2, executed: false, code: 'staticInt = 200;' },
            { id: 3, executed: false, code: 'System.out.println("Static block 2");' }
        ];
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('类初始化过程', 20, 40);
        
        // 绘制初始化步骤
        this.drawInitializationSteps();
        
        // 绘制静态变量状态
        this.drawStaticVariables();
        
        // 绘制静态代码块执行状态
        this.drawStaticBlocks();
        
        // 绘制<clinit>方法
        this.drawClinitMethod();
    }
    
    drawInitializationSteps() {
        const x = 50;
        const y = 80;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('初始化步骤', x, y);
        
        const steps = [
            '1. 检查类是否已经初始化',
            '2. 获取初始化锁（保证线程安全）',
            '3. 再次检查初始化状态',
            '4. 执行<clinit>()方法',
            '5. 标记类为已初始化状态',
            '6. 释放初始化锁'
        ];
        
        this.ctx.font = '12px Arial';
        steps.forEach((step, index) => {
            const stepY = y + 30 + index * 25;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(x - 5, stepY - 15, 300, 20);
                this.ctx.fillStyle = 'white';
            } else if (isCompleted) {
                this.ctx.fillStyle = '#38a169';
            } else {
                this.ctx.fillStyle = '#a0aec0';
            }
            
            this.ctx.fillText(step, x, stepY);
        });
    }
    
    drawStaticVariables() {
        const x = 400;
        const y = 80;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('静态变量状态', x, y);
        
        this.staticVariables.forEach((variable, index) => {
            const varY = y + 30 + index * 40;
            
            // 变量名
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(variable.name, x, varY);
            
            // 当前值
            this.ctx.fillStyle = variable.initialized ? '#38a169' : '#ed8936';
            this.ctx.font = '11px Courier New';
            const currentValue = variable.initialized ? variable.finalValue : variable.value;
            this.ctx.fillText(`当前值: ${currentValue}`, x, varY + 15);
            
            // 状态指示器
            this.ctx.fillStyle = variable.initialized ? '#38a169' : '#a0aec0';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(variable.initialized ? '已初始化' : '默认值', x + 150, varY + 15);
        });
    }
    
    drawStaticBlocks() {
        const x = 50;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('静态代码块执行', x, y);
        
        this.staticBlocks.forEach((block, index) => {
            const blockY = y + 30 + index * 30;
            
            // 执行状态
            this.ctx.fillStyle = block.executed ? '#38a169' : '#a0aec0';
            this.ctx.fillText(block.executed ? '✓' : '○', x, blockY);
            
            // 代码块内容
            this.ctx.fillStyle = block.executed ? '#2d3748' : '#718096';
            this.ctx.font = '11px Courier New';
            this.ctx.fillText(`static { ${block.code} }`, x + 20, blockY);
        });
    }
    
    drawClinitMethod() {
        const x = 400;
        const y = 250;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('<clinit>()方法构成', x, y);
        
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('该方法由编译器自动生成，包含：', x, y + 25);
        
        const components = [
            '• 所有静态变量的赋值动作',
            '• 所有静态代码块中的语句',
            '• 按照在源文件中出现的顺序执行'
        ];
        
        this.ctx.font = '11px Arial';
        components.forEach((component, index) => {
            this.ctx.fillText(component, x, y + 50 + index * 20);
        });
        
        // 执行顺序示例
        if (this.step >= 3) {
            this.ctx.fillStyle = '#ed8936';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('执行顺序:', x, y + 120);
            
            const executionOrder = [
                '1. staticInt = 100;',
                '2. staticString = "Hello";',
                '3. static { System.out.println("Static block 1"); }',
                '4. static { staticInt = 200; }',
                '5. staticObject = new Object();',
                '6. static { System.out.println("Static block 2"); }'
            ];
            
            this.ctx.font = '10px Courier New';
            this.ctx.fillStyle = '#4a5568';
            executionOrder.forEach((order, index) => {
                const orderY = y + 140 + index * 15;
                const isExecuted = this.step >= 4 && index < (this.step - 3) * 2;
                this.ctx.fillStyle = isExecuted ? '#38a169' : '#a0aec0';
                this.ctx.fillText(order, x, orderY);
            });
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            
            // 模拟初始化过程
            if (this.step === 4) { // 执行<clinit>方法
                this.staticVariables[0].initialized = true; // staticInt
                this.staticBlocks[0].executed = true;
            } else if (this.step === 5) {
                this.staticVariables[1].initialized = true; // staticString
                this.staticVariables[2].initialized = true; // staticObject
                this.staticBlocks[1].executed = true;
                this.staticBlocks[2].executed = true;
            }
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        this.staticVariables.forEach(variable => {
            variable.initialized = false;
        });
        this.staticBlocks.forEach(block => {
            block.executed = false;
        });
    }
}

// 自定义类加载器演示类
class CustomClassLoaderDemo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.step = 0;
        this.maxSteps = 7;
        this.customLoader = {
            name: 'MyCustomClassLoader',
            methods: [
                { name: 'findClass', implemented: false, description: '查找类的字节码' },
                { name: 'defineClass', implemented: false, description: '将字节码转换为Class对象' },
                { name: 'loadClass', implemented: false, description: '加载类的入口方法' },
                { name: 'resolveClass', implemented: false, description: '链接类' }
            ],
            loadingSources: [
                { name: '网络', active: false, description: '从远程服务器下载' },
                { name: '数据库', active: false, description: '从数据库读取字节码' },
                { name: '加密文件', active: false, description: '解密后加载' }
            ]
        };
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制标题
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText('自定义类加载器', 20, 40);
        
        // 绘制实现步骤
        this.drawImplementationSteps();
        
        // 绘制类加载器方法
        this.drawClassLoaderMethods();
        
        // 绘制加载源
        this.drawLoadingSources();
        
        // 绘制代码示例
        this.drawCodeExample();
    }
    
    drawImplementationSteps() {
        const x = 50;
        const y = 80;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('实现步骤', x, y);
        
        const steps = [
            '1. 继承ClassLoader类',
            '2. 重写findClass方法',
            '3. 实现字节码获取逻辑',
            '4. 调用defineClass方法',
            '5. 处理类的依赖关系',
            '6. 测试自定义加载器',
            '7. 部署到生产环境'
        ];
        
        this.ctx.font = '12px Arial';
        steps.forEach((step, index) => {
            const stepY = y + 30 + index * 25;
            const isActive = index === this.step;
            const isCompleted = index < this.step;
            
            if (isActive) {
                this.ctx.fillStyle = '#4299e1';
                this.ctx.fillRect(x - 5, stepY - 15, 250, 20);
                this.ctx.fillStyle = 'white';
            } else if (isCompleted) {
                this.ctx.fillStyle = '#38a169';
            } else {
                this.ctx.fillStyle = '#a0aec0';
            }
            
            this.ctx.fillText(step, x, stepY);
        });
    }
    
    drawClassLoaderMethods() {
        const x = 350;
        const y = 80;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('关键方法实现', x, y);
        
        this.customLoader.methods.forEach((method, index) => {
            const methodY = y + 30 + index * 40;
            const isImplemented = this.step > index + 1;
            
            // 方法框
            this.ctx.fillStyle = isImplemented ? '#c6f6d5' : '#f7fafc';
            this.ctx.fillRect(x, methodY, 200, 35);
            
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.strokeRect(x, methodY, 200, 35);
            
            // 方法名
            this.ctx.fillStyle = '#2d3748';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(method.name, x + 10, methodY + 15);
            
            // 描述
            this.ctx.fillStyle = '#4a5568';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(method.description, x + 10, methodY + 28);
            
            // 状态指示器
            if (isImplemented) {
                this.ctx.fillStyle = '#38a169';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.fillText('✓', x + 175, methodY + 20);
            }
        });
    }
    
    drawLoadingSources() {
        const x = 350;
        const y = 260;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('支持的加载源', x, y);
        
        this.customLoader.loadingSources.forEach((source, index) => {
            const sourceY = y + 30 + index * 30;
            const isActive = this.step > 3;
            
            // 状态指示器
            this.ctx.fillStyle = isActive ? '#4299e1' : '#a0aec0';
            this.ctx.fillText(isActive ? '●' : '○', x, sourceY);
            
            // 源名称
            this.ctx.fillStyle = isActive ? '#2d3748' : '#718096';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(source.name, x + 20, sourceY);
            
            // 描述
            this.ctx.fillStyle = isActive ? '#4a5568' : '#a0aec0';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(source.description, x + 80, sourceY);
        });
    }
    
    drawCodeExample() {
        const x = 50;
        const y = 280;
        
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('代码示例', x, y);
        
        if (this.step >= 2) {
            // 绘制代码框
            this.ctx.fillStyle = '#2d3748';
            this.ctx.fillRect(x, y + 20, 280, 100);
            
            // 代码内容
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.font = '10px Courier New';
            
            const codeLines = [
                'public class MyCustomClassLoader extends ClassLoader {',
                '    @Override',
                '    protected Class<?> findClass(String name) {',
                '        byte[] classData = getClassData(name);',
                '        return defineClass(name, classData, 0, classData.length);',
                '    }',
                '    private byte[] getClassData(String name) {',
                '        // 从自定义源获取字节码',
                '        return loadFromCustomSource(name);',
                '    }',
                '}'
            ];
            
            codeLines.forEach((line, index) => {
                const lineY = y + 35 + index * 12;
                const isHighlighted = this.step >= 3 && (index === 2 || index === 4);
                
                if (isHighlighted) {
                    this.ctx.fillStyle = '#ffd700';
                    this.ctx.fillRect(x + 5, lineY - 10, 270, 12);
                }
                
                this.ctx.fillStyle = isHighlighted ? '#2d3748' : '#e2e8f0';
                this.ctx.fillText(line, x + 10, lineY);
            });
        }
    }
    
    nextStep() {
        if (this.step < this.maxSteps - 1) {
            this.step++;
            
            // 更新方法实现状态
            if (this.step >= 2) {
                this.customLoader.methods[0].implemented = true; // findClass
            }
            if (this.step >= 3) {
                this.customLoader.methods[1].implemented = true; // defineClass
            }
            if (this.step >= 4) {
                this.customLoader.methods[2].implemented = true; // loadClass
                this.customLoader.loadingSources.forEach(source => {
                    source.active = true;
                });
            }
            if (this.step >= 5) {
                this.customLoader.methods[3].implemented = true; // resolveClass
            }
        }
        return this.step < this.maxSteps;
    }
    
    reset() {
        this.step = 0;
        this.customLoader.methods.forEach(method => {
            method.implemented = false;
        });
        this.customLoader.loadingSources.forEach(source => {
            source.active = false;
        });
    }
}

// 演示管理函数
function openDemo(demoType) {
    const modal = document.getElementById('demoModal');
    const modalTitle = document.getElementById('modalTitle');
    const canvas = document.getElementById('demoCanvas');
    
    // 设置模态框标题
    const titles = {
        'loading-triggers': '类加载触发时机演示',
        'loading-phases': '类加载五个阶段演示',
        'parent-delegation': '双亲委派模型演示',
        'bytecode-verification': '字节码验证机制演示',
        'class-initialization': '类初始化过程演示',
        'custom-classloader': '自定义类加载器演示'
    };
    
    modalTitle.textContent = titles[demoType] || '演示';
    
    // 创建对应的演示实例
    switch (demoType) {
        case 'loading-triggers':
            currentDemo = new LoadingTriggersDemo(canvas);
            break;
        case 'loading-phases':
            currentDemo = new LoadingPhasesDemo(canvas);
            break;
        case 'parent-delegation':
            currentDemo = new ParentDelegationDemo(canvas);
            break;
        case 'bytecode-verification':
            currentDemo = new BytecodeVerificationDemo(canvas);
            break;
        case 'class-initialization':
            currentDemo = new ClassInitializationDemo(canvas);
            break;
        case 'custom-classloader':
            currentDemo = new CustomClassLoaderDemo(canvas);
            break;
        default:
            return;
    }
    
    // 调整画布大小
    resizeCanvas();
    
    // 初始化步骤指示器
    initializeStepIndicator(currentDemo.maxSteps);
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 绘制初始状态
    currentDemo.draw();
    
    // 更新状态面板
    updateStatusPanel();
}

function closeModal() {
    const modal = document.getElementById('demoModal');
    modal.style.display = 'none';
    
    // 停止动画
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置状态
    demoSystem.isRunning = false;
    isPaused = false;
    currentStep = 0;
    
    // 重置按钮状态
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
}

function startDemo() {
    if (!currentDemo) return;
    
    demoSystem.isRunning = true;
    isPaused = false;
    
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    
    runAnimation();
}

function pauseDemo() {
    isPaused = !isPaused;
    
    if (isPaused) {
        document.getElementById('pauseBtn').textContent = '继续';
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    } else {
        document.getElementById('pauseBtn').textContent = '暂停';
        runAnimation();
    }
}

function resetDemo() {
    if (!currentDemo) return;
    
    // 停止动画
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置演示状态
    currentDemo.reset();
    currentStep = 0;
    demoSystem.isRunning = false;
    isPaused = false;
    
    // 重置按钮状态
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pauseBtn').textContent = '暂停';
    
    // 重绘
    currentDemo.draw();
    
    // 更新UI
    updateStepIndicator(0);
    updateStatusPanel();
}

function stepDemo() {
    if (!currentDemo) return;
    
    const hasNext = currentDemo.nextStep();
    currentStep++;
    
    currentDemo.draw();
    updateStepIndicator(currentStep);
    updateStatusPanel();
    
    if (!hasNext) {
        demoSystem.isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }
}

function runAnimation() {
    if (!demoSystem.isRunning || isPaused) return;
    
    const hasNext = currentDemo.nextStep();
    currentStep++;
    
    currentDemo.draw();
    updateStepIndicator(currentStep);
    updateStatusPanel();
    
    if (hasNext) {
        animationId = setTimeout(() => {
            requestAnimationFrame(runAnimation);
        }, 2000 / demoSpeed);
    } else {
        demoSystem.isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }
}

function setSpeed(speed) {
    demoSpeed = speed;
}

function triggerClassLoading() {
    if (currentDemo && currentDemo.constructor.name === 'LoadingTriggersDemo') {
        // 触发特定的类加载场景
        currentDemo.step = Math.min(currentDemo.step + 1, currentDemo.maxSteps - 1);
        currentDemo.draw();
        updateStatusPanel();
    }
}

function showDelegation() {
    if (currentDemo && currentDemo.constructor.name === 'ParentDelegationDemo') {
        // 显示委派过程
        currentDemo.delegationPath = [3, 2, 1, 0];
        currentDemo.draw();
    }
}

function startVerification() {
    if (currentDemo && currentDemo.constructor.name === 'BytecodeVerificationDemo') {
        // 开始验证过程
        currentDemo.passedChecks = Math.min(currentDemo.passedChecks + 1, 5);
        currentDemo.draw();
        updateStatusPanel();
    }
}

function resizeCanvas() {
    const canvas = document.getElementById('demoCanvas');
    const container = canvas.parentElement;
    
    canvas.width = container.clientWidth - 40;
    canvas.height = 400;
}

function initializeStepIndicator(maxSteps) {
    const indicator = document.getElementById('stepIndicator');
    indicator.innerHTML = '';
    
    for (let i = 0; i < maxSteps; i++) {
        const step = document.createElement('div');
        step.className = 'step';
        step.textContent = `步骤 ${i + 1}`;
        indicator.appendChild(step);
    }
}

function updateStepIndicator(currentStep) {
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
    const statusContent = document.getElementById('statusContent');
    if (!currentDemo) return;
    
    let statusHTML = '';
    
    // 通用状态信息
    statusHTML += `<div class="status-item">`;
    statusHTML += `<span class="status-label">当前步骤:</span>`;
    statusHTML += `<span class="status-value">${currentStep + 1}/${currentDemo.maxSteps}</span>`;
    statusHTML += `</div>`;
    
    statusHTML += `<div class="status-item">`;
    statusHTML += `<span class="status-label">演示状态:</span>`;
    statusHTML += `<span class="status-value">${demoSystem.isRunning ? '运行中' : '已停止'}</span>`;
    statusHTML += `</div>`;
    
    // 根据不同演示类型显示特定状态
    if (currentDemo.constructor.name === 'LoadingTriggersDemo') {
        const loadedCount = Object.values(currentDemo.classStates).filter(state => state.loaded).length;
        const initializedCount = Object.values(currentDemo.classStates).filter(state => state.initialized).length;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">已加载类:</span>`;
        statusHTML += `<span class="status-value">${loadedCount}/3</span>`;
        statusHTML += `</div>`;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">已初始化类:</span>`;
        statusHTML += `<span class="status-value">${initializedCount}/3</span>`;
        statusHTML += `</div>`;
    } else if (currentDemo.constructor.name === 'ParentDelegationDemo') {
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">当前请求:</span>`;
        statusHTML += `<span class="status-value">${currentDemo.currentRequest || '无'}</span>`;
        statusHTML += `</div>`;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">委派层级:</span>`;
        statusHTML += `<span class="status-value">${currentDemo.delegationPath.length}</span>`;
        statusHTML += `</div>`;
    } else if (currentDemo.constructor.name === 'BytecodeVerificationDemo') {
        const progress = Math.round((currentDemo.step / currentDemo.maxSteps) * 100);
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">验证进度:</span>`;
        statusHTML += `<span class="status-value">${progress}%</span>`;
        statusHTML += `</div>`;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">当前阶段:</span>`;
        statusHTML += `<span class="status-value">${currentDemo.step < currentDemo.verificationStages.length ? currentDemo.verificationStages[currentDemo.step].name : '完成'}</span>`;
        statusHTML += `</div>`;
    } else if (currentDemo.constructor.name === 'ClassInitializationDemo') {
        const initializedVars = currentDemo.staticVariables.filter(v => v.initialized).length;
        const executedBlocks = currentDemo.staticBlocks.filter(b => b.executed).length;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">已初始化变量:</span>`;
        statusHTML += `<span class="status-value">${initializedVars}/${currentDemo.staticVariables.length}</span>`;
        statusHTML += `</div>`;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">已执行代码块:</span>`;
        statusHTML += `<span class="status-value">${executedBlocks}/${currentDemo.staticBlocks.length}</span>`;
        statusHTML += `</div>`;
    } else if (currentDemo.constructor.name === 'CustomClassLoaderDemo') {
        const implementedMethods = currentDemo.customLoader.methods.filter(m => m.implemented).length;
        const activeSources = currentDemo.customLoader.loadingSources.filter(s => s.active).length;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">已实现方法:</span>`;
        statusHTML += `<span class="status-value">${implementedMethods}/${currentDemo.customLoader.methods.length}</span>`;
        statusHTML += `</div>`;
        
        statusHTML += `<div class="status-item">`;
        statusHTML += `<span class="status-label">支持加载源:</span>`;
        statusHTML += `<span class="status-value">${activeSources}/${currentDemo.customLoader.loadingSources.length}</span>`;
        statusHTML += `</div>`;
    }
    
    statusContent.innerHTML = statusHTML;
}

// 窗口大小改变时调整画布
window.addEventListener('resize', () => {
    if (currentDemo) {
        resizeCanvas();
        currentDemo.draw();
    }
});

// 点击模态框外部关闭
window.addEventListener('click', (event) => {
    const modal = document.getElementById('demoModal');
    if (event.target === modal) {
        closeModal();
    }
});