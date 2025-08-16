// 第一课：代码执行的完整链路解析 - 演示脚本

class CodeExecutionDemo {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.currentDemo = null;
        this.isRunning = false;
        this.isPaused = false;
        this.currentStep = 0;
        this.speed = 1;
        this.animationId = null;
        
        this.demos = {
            compilation: new CompilationDemo(),
            bytecode: new BytecodeDemo(),
            constantpool: new ConstantPoolDemo(),
            jvmstartup: new JVMStartupDemo(),
            threading: new ThreadingDemo(),
            execution: new ExecutionEngineDemo()
        };
        
        this.initializePreviews();
    }
    
    initializePreviews() {
        // 为每个演示卡片初始化预览
        Object.keys(this.demos).forEach(demoType => {
            const previewElement = document.getElementById(`${demoType}-preview`);
            if (previewElement) {
                this.demos[demoType].initPreview(previewElement);
            }
        });
    }
}

// javac编译过程演示
class CompilationDemo {
    constructor() {
        this.steps = [
            { name: '源码解析', description: '词法分析和语法分析' },
            { name: '语义分析', description: '类型检查和符号表构建' },
            { name: '字节码生成', description: '生成.class文件' },
            { name: '常量池构建', description: '构建运行时常量池' }
        ];
        this.currentStep = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawCompilationPreview(ctx, canvas.width, canvas.height);
    }
    
    drawCompilationPreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制编译流程图
        const steps = ['源码', 'javac', '字节码'];
        const stepWidth = width / 4;
        const stepHeight = 40;
        const y = height / 2 - stepHeight / 2;
        
        steps.forEach((step, index) => {
            const x = stepWidth * (index + 0.5) - 30;
            
            // 绘制步骤框
            ctx.fillStyle = index === 1 ? '#4299e1' : '#e2e8f0';
            ctx.fillRect(x, y, 60, stepHeight);
            
            // 绘制文字
            ctx.fillStyle = index === 1 ? 'white' : '#4a5568';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(step, x + 30, y + 25);
            
            // 绘制箭头
            if (index < steps.length - 1) {
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 60, y + stepHeight / 2);
                ctx.lineTo(x + stepWidth - 60, y + stepHeight / 2);
                ctx.stroke();
                
                // 箭头头部
                ctx.beginPath();
                ctx.moveTo(x + stepWidth - 70, y + stepHeight / 2 - 5);
                ctx.lineTo(x + stepWidth - 60, y + stepHeight / 2);
                ctx.lineTo(x + stepWidth - 70, y + stepHeight / 2 + 5);
                ctx.stroke();
            }
        });
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentStep = 0;
        this.animate();
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制完整的编译过程
        this.drawCompilationProcess();
        
        if (this.currentStep < this.steps.length) {
            setTimeout(() => {
                this.currentStep++;
                this.animate();
            }, 2000);
        }
    }
    
    drawCompilationProcess() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // 绘制源代码区域
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(50, 50, 200, 150);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(50, 50, 200, 150);
        
        ctx.fillStyle = '#2d3748';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('public class Demo {', 60, 80);
        ctx.fillText('  public static void', 60, 100);
        ctx.fillText('  main(String[] args) {', 60, 120);
        ctx.fillText('    int a = 1;', 60, 140);
        ctx.fillText('    System.out.println(a);', 60, 160);
        ctx.fillText('  }', 60, 180);
        ctx.fillText('}', 60, 200);
        
        // 绘制编译器
        const compilerX = 350;
        const compilerY = 100;
        ctx.fillStyle = this.currentStep >= 1 ? '#4299e1' : '#e2e8f0';
        ctx.fillRect(compilerX, compilerY, 100, 80);
        
        ctx.fillStyle = this.currentStep >= 1 ? 'white' : '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('javac', compilerX + 50, compilerY + 45);
        
        // 绘制字节码区域
        if (this.currentStep >= 3) {
            ctx.fillStyle = '#f0fff4';
            ctx.fillRect(550, 50, 200, 150);
            ctx.strokeStyle = '#48bb78';
            ctx.strokeRect(550, 50, 200, 150);
            
            ctx.fillStyle = '#2d3748';
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('0: iconst_1', 560, 80);
            ctx.fillText('1: istore_1', 560, 100);
            ctx.fillText('2: getstatic #2', 560, 120);
            ctx.fillText('5: iload_1', 560, 140);
            ctx.fillText('6: invokevirtual #3', 560, 160);
            ctx.fillText('9: return', 560, 180);
        }
        
        // 绘制箭头和步骤说明
        if (this.currentStep >= 1) {
            this.drawArrow(ctx, 250, 125, 350, 125);
        }
        if (this.currentStep >= 3) {
            this.drawArrow(ctx, 450, 125, 550, 125);
        }
        
        // 绘制当前步骤说明
        if (this.currentStep > 0 && this.currentStep <= this.steps.length) {
            const step = this.steps[this.currentStep - 1];
            ctx.fillStyle = '#4299e1';
            ctx.fillRect(50, 250, width - 100, 60);
            
            ctx.fillStyle = 'white';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(step.name, width / 2, 275);
            
            ctx.font = '14px Arial';
            ctx.fillText(step.description, width / 2, 295);
        }
    }
    
    drawArrow(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = '#4299e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // 箭头头部
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = '#4299e1';
        ctx.fill();
    }
    
    reset() {
        this.currentStep = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        return {
            '当前步骤': this.currentStep > 0 ? this.steps[this.currentStep - 1].name : '未开始',
            '总步骤': this.steps.length,
            '进度': `${this.currentStep}/${this.steps.length}`
        };
    }
}

// 字节码执行演示
class BytecodeDemo {
    constructor() {
        this.bytecodes = [
            { instruction: 'iconst_1', description: '将常量1推入操作数栈', stack: [1], locals: [] },
            { instruction: 'istore_1', description: '将栈顶值存储到局部变量1', stack: [], locals: [null, 1] },
            { instruction: 'iload_1', description: '将局部变量1加载到栈顶', stack: [1], locals: [null, 1] },
            { instruction: 'iconst_1', description: '将常量1推入操作数栈', stack: [1, 1], locals: [null, 1] },
            { instruction: 'iadd', description: '执行加法运算', stack: [2], locals: [null, 1] },
            { instruction: 'istore_2', description: '将结果存储到局部变量2', stack: [], locals: [null, 1, 2] }
        ];
        this.currentInstruction = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawBytecodePreview(ctx, canvas.width, canvas.height);
    }
    
    drawBytecodePreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制操作数栈预览
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(50, 50, 80, 100);
        ctx.strokeStyle = '#cbd5e0';
        ctx.strokeRect(50, 50, 80, 100);
        
        ctx.fillStyle = '#4a5568';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('操作数栈', 90, 40);
        
        // 绘制局部变量表预览
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(200, 50, 150, 50);
        ctx.strokeRect(200, 50, 150, 50);
        
        ctx.fillText('局部变量表', 275, 40);
        
        // 绘制字节码指令预览
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(50, 170, 300, 20);
        ctx.strokeRect(50, 170, 300, 20);
        
        ctx.fillStyle = '#2d3748';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('iconst_1 → istore_1 → iload_1 → iadd', 55, 185);
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentInstruction = 0;
        this.animate();
    }
    
    animate() {
        this.drawBytecodeExecution();
        
        if (this.currentInstruction < this.bytecodes.length) {
            setTimeout(() => {
                this.currentInstruction++;
                this.animate();
            }, 2000);
        }
    }
    
    drawBytecodeExecution() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制操作数栈
        this.drawStack(ctx, 100, 100, 100, 200);
        
        // 绘制局部变量表
        this.drawLocals(ctx, 300, 100, 200, 80);
        
        // 绘制当前指令
        this.drawCurrentInstruction(ctx, 100, 350, width - 200, 80);
        
        // 绘制字节码列表
        this.drawBytecodeList(ctx, 600, 100, 150, 300);
    }
    
    drawStack(ctx, x, y, width, height) {
        // 绘制栈框架
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#4299e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // 标题
        ctx.fillStyle = '#4299e1';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('操作数栈', x + width / 2, y - 10);
        
        // 绘制栈内容
        if (this.currentInstruction > 0) {
            const currentState = this.bytecodes[this.currentInstruction - 1];
            const stack = currentState.stack;
            
            stack.forEach((value, index) => {
                const itemY = y + height - 40 - (index * 30);
                ctx.fillStyle = '#48bb78';
                ctx.fillRect(x + 10, itemY, width - 20, 25);
                
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(value.toString(), x + width / 2, itemY + 18);
            });
        }
        
        // 栈顶指示器
        ctx.fillStyle = '#e53e3e';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('栈顶 →', x + width + 10, y + height - 20);
    }
    
    drawLocals(ctx, x, y, width, height) {
        // 绘制局部变量表框架
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#9f7aea';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // 标题
        ctx.fillStyle = '#9f7aea';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('局部变量表', x + width / 2, y - 10);
        
        // 绘制变量槽
        if (this.currentInstruction > 0) {
            const currentState = this.bytecodes[this.currentInstruction - 1];
            const locals = currentState.locals;
            
            for (let i = 0; i < Math.max(3, locals.length); i++) {
                const slotX = x + 10 + (i * 60);
                const slotY = y + 20;
                
                ctx.fillStyle = locals[i] !== undefined ? '#805ad5' : '#e2e8f0';
                ctx.fillRect(slotX, slotY, 50, 40);
                ctx.strokeStyle = '#9f7aea';
                ctx.strokeRect(slotX, slotY, 50, 40);
                
                // 索引标签
                ctx.fillStyle = '#4a5568';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`[${i}]`, slotX + 25, slotY - 5);
                
                // 值
                if (locals[i] !== undefined && locals[i] !== null) {
                    ctx.fillStyle = 'white';
                    ctx.font = '14px Arial';
                    ctx.fillText(locals[i].toString(), slotX + 25, slotY + 28);
                }
            }
        }
    }
    
    drawCurrentInstruction(ctx, x, y, width, height) {
        if (this.currentInstruction === 0) return;
        
        const instruction = this.bytecodes[this.currentInstruction - 1];
        
        // 绘制指令框
        ctx.fillStyle = '#4299e1';
        ctx.fillRect(x, y, width, height);
        
        // 指令名称
        ctx.fillStyle = 'white';
        ctx.font = '20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(instruction.instruction, x + width / 2, y + 30);
        
        // 指令描述
        ctx.font = '14px Arial';
        ctx.fillText(instruction.description, x + width / 2, y + 55);
    }
    
    drawBytecodeList(ctx, x, y, width, height) {
        // 绘制字节码列表框架
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(x, y, width, height);
        
        // 标题
        ctx.fillStyle = '#4a5568';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('字节码指令', x + width / 2, y - 10);
        
        // 绘制指令列表
        this.bytecodes.forEach((instruction, index) => {
            const itemY = y + 20 + (index * 25);
            
            // 高亮当前指令
            if (index === this.currentInstruction - 1) {
                ctx.fillStyle = '#4299e1';
                ctx.fillRect(x + 5, itemY - 15, width - 10, 20);
            }
            
            ctx.fillStyle = index === this.currentInstruction - 1 ? 'white' : '#2d3748';
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${index}: ${instruction.instruction}`, x + 10, itemY);
        });
    }
    
    reset() {
        this.currentInstruction = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        const current = this.currentInstruction > 0 ? this.bytecodes[this.currentInstruction - 1] : null;
        return {
            '当前指令': current ? current.instruction : '未开始',
            '栈大小': current ? current.stack.length : 0,
            '局部变量': current ? current.locals.filter(v => v !== null && v !== undefined).length : 0,
            '执行进度': `${this.currentInstruction}/${this.bytecodes.length}`
        };
    }
}

// 常量池演示
class ConstantPoolDemo {
    constructor() {
        this.constantPool = [
            { index: 1, type: 'Methodref', value: '#11.#20', description: 'java/lang/Object."<init>":()V' },
            { index: 2, type: 'Fieldref', value: '#21.#22', description: 'java/lang/System.out:Ljava/io/PrintStream;' },
            { index: 3, type: 'Class', value: '#23', description: 'java/lang/StringBuilder' },
            { index: 4, type: 'String', value: '#24', description: 'a=' },
            { index: 5, type: 'String', value: '#25', description: ', b=' },
            { index: 6, type: 'Utf8', value: 'a=', description: 'UTF-8字符串' },
            { index: 7, type: 'Utf8', value: ', b=', description: 'UTF-8字符串' }
        ];
        this.currentAccess = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawConstantPoolPreview(ctx, canvas.width, canvas.height);
    }
    
    drawConstantPoolPreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制常量池表格预览
        const rows = 4;
        const cols = 3;
        const cellWidth = (width - 40) / cols;
        const cellHeight = (height - 40) / rows;
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const x = 20 + j * cellWidth;
                const y = 20 + i * cellHeight;
                
                ctx.fillStyle = (i + j) % 2 === 0 ? '#f7fafc' : '#e2e8f0';
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.strokeStyle = '#cbd5e0';
                ctx.strokeRect(x, y, cellWidth, cellHeight);
                
                if (i === 0) {
                    const headers = ['索引', '类型', '值'];
                    ctx.fillStyle = '#4a5568';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(headers[j], x + cellWidth / 2, y + cellHeight / 2 + 4);
                } else if (i <= this.constantPool.length) {
                    const entry = this.constantPool[i - 1];
                    if (entry) {
                        const values = [entry.index, entry.type, entry.value];
                        ctx.fillStyle = '#2d3748';
                        ctx.font = '10px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(values[j].toString(), x + cellWidth / 2, y + cellHeight / 2 + 4);
                    }
                }
            }
        }
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentAccess = 0;
        this.animate();
    }
    
    animate() {
        this.drawConstantPoolAccess();
        
        if (this.currentAccess < this.constantPool.length) {
            setTimeout(() => {
                this.currentAccess++;
                this.animate();
            }, 1500);
        }
    }
    
    drawConstantPoolAccess() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制字节码指令
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(50, 50, 200, 100);
        
        ctx.fillStyle = 'white';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('字节码指令:', 60, 80);
        ctx.fillText('ldc #4', 60, 100);
        ctx.fillText('// 加载常量池#4', 60, 120);
        
        // 绘制常量池表
        this.drawConstantPoolTable(ctx, 350, 50, 350, 300);
        
        // 绘制访问箭头
        if (this.currentAccess > 0) {
            this.drawAccessArrow(ctx, 250, 100, 350, 100 + this.currentAccess * 30);
        }
        
        // 绘制当前访问的常量信息
        if (this.currentAccess > 0) {
            const constant = this.constantPool[this.currentAccess - 1];
            this.drawConstantDetail(ctx, 50, 400, width - 100, 80, constant);
        }
    }
    
    drawConstantPoolTable(ctx, x, y, width, height) {
        // 表格标题
        ctx.fillStyle = '#4299e1';
        ctx.fillRect(x, y, width, 30);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('运行时常量池', x + width / 2, y + 20);
        
        // 表格内容
        this.constantPool.forEach((constant, index) => {
            const rowY = y + 30 + (index * 30);
            
            // 高亮当前访问的常量
            ctx.fillStyle = index === this.currentAccess - 1 ? '#ffd700' : '#f7fafc';
            ctx.fillRect(x, rowY, width, 30);
            ctx.strokeStyle = '#e2e8f0';
            ctx.strokeRect(x, rowY, width, 30);
            
            // 索引
            ctx.fillStyle = '#4a5568';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`#${constant.index}`, x + 30, rowY + 20);
            
            // 类型
            ctx.fillText(constant.type, x + 120, rowY + 20);
            
            // 值
            ctx.font = '10px monospace';
            ctx.fillText(constant.value, x + 220, rowY + 20);
        });
    }
    
    drawAccessArrow(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = '#e53e3e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // 箭头头部
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = '#e53e3e';
        ctx.fill();
    }
    
    drawConstantDetail(ctx, x, y, width, height, constant) {
        ctx.fillStyle = '#48bb78';
        ctx.fillRect(x, y, width, height);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`常量池 #${constant.index}`, x + width / 2, y + 25);
        
        ctx.font = '14px Arial';
        ctx.fillText(`类型: ${constant.type}`, x + width / 2, y + 45);
        ctx.fillText(`描述: ${constant.description}`, x + width / 2, y + 65);
    }
    
    reset() {
        this.currentAccess = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        const current = this.currentAccess > 0 ? this.constantPool[this.currentAccess - 1] : null;
        return {
            '当前访问': current ? `#${current.index}` : '未开始',
            '常量类型': current ? current.type : '-',
            '常量池大小': this.constantPool.length,
            '访问进度': `${this.currentAccess}/${this.constantPool.length}`
        };
    }
}

// JVM启动演示
class JVMStartupDemo {
    constructor() {
        this.startupSteps = [
            { name: '操作系统启动java进程', description: '执行java命令，创建JVM进程' },
            { name: 'JVM初始化', description: '初始化虚拟机参数和内存区域' },
            { name: '加载主类', description: '通过类加载器加载主类' },
            { name: '查找main方法', description: '获取main方法的方法ID' },
            { name: '创建main线程', description: '创建并启动main线程' },
            { name: '调用main方法', description: '执行用户代码' }
        ];
        this.currentStep = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawJVMStartupPreview(ctx, canvas.width, canvas.height);
    }
    
    drawJVMStartupPreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制启动流程预览
        const steps = ['OS', 'JVM', 'ClassLoader', 'main()'];
        const stepWidth = width / 5;
        const stepHeight = 30;
        const y = height / 2 - stepHeight / 2;
        
        steps.forEach((step, index) => {
            const x = stepWidth * (index + 0.5) - 25;
            
            ctx.fillStyle = '#4299e1';
            ctx.fillRect(x, y, 50, stepHeight);
            
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(step, x + 25, y + 20);
            
            if (index < steps.length - 1) {
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 50, y + stepHeight / 2);
                ctx.lineTo(x + stepWidth - 50, y + stepHeight / 2);
                ctx.stroke();
            }
        });
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentStep = 0;
        this.animate();
    }
    
    animate() {
        this.drawJVMStartupProcess();
        
        if (this.currentStep < this.startupSteps.length) {
            setTimeout(() => {
                this.currentStep++;
                this.animate();
            }, 2500);
        }
    }
    
    drawJVMStartupProcess() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制操作系统层
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(50, 50, width - 100, 80);
        ctx.strokeStyle = '#a0aec0';
        ctx.strokeRect(50, 50, width - 100, 80);
        
        ctx.fillStyle = '#4a5568';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('操作系统 (Windows/Linux/macOS)', width / 2, 100);
        
        // 绘制JVM进程
        if (this.currentStep >= 1) {
            ctx.fillStyle = '#4299e1';
            ctx.fillRect(100, 180, width - 200, 200);
            ctx.strokeStyle = '#3182ce';
            ctx.strokeRect(100, 180, width - 200, 200);
            
            ctx.fillStyle = 'white';
            ctx.font = '18px Arial';
            ctx.fillText('JVM 进程', width / 2, 210);
            
            // JVM内部组件
            if (this.currentStep >= 2) {
                // 类加载器
                ctx.fillStyle = '#48bb78';
                ctx.fillRect(120, 240, 150, 60);
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.fillText('类加载器', 195, 275);
                
                // 执行引擎
                ctx.fillStyle = '#ed8936';
                ctx.fillRect(width - 270, 240, 150, 60);
                ctx.fillStyle = 'white';
                ctx.fillText('执行引擎', width - 195, 275);
                
                // main线程
                if (this.currentStep >= 5) {
                    ctx.fillStyle = '#9f7aea';
                    ctx.fillRect(120, 320, width - 240, 40);
                    ctx.fillStyle = 'white';
                    ctx.font = '16px Arial';
                    ctx.fillText('main 线程', width / 2, 345);
                }
            }
        }
        
        // 绘制命令行
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(50, 420, width - 100, 40);
        
        ctx.fillStyle = '#00ff00';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('$ java MyClass', 60, 445);
        
        // 绘制当前步骤说明
        if (this.currentStep > 0 && this.currentStep <= this.startupSteps.length) {
            const step = this.startupSteps[this.currentStep - 1];
            ctx.fillStyle = 'rgba(66, 153, 225, 0.9)';
            ctx.fillRect(50, 480, width - 100, 60);
            
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(step.name, width / 2, 505);
            
            ctx.font = '12px Arial';
            ctx.fillText(step.description, width / 2, 525);
        }
    }
    
    reset() {
        this.currentStep = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        return {
            '当前阶段': this.currentStep > 0 ? this.startupSteps[this.currentStep - 1].name : '未开始',
            '总阶段': this.startupSteps.length,
            '启动进度': `${this.currentStep}/${this.startupSteps.length}`,
            'JVM状态': this.currentStep >= 2 ? '已初始化' : '未初始化'
        };
    }
}

// 线程模型演示
class ThreadingDemo {
    constructor() {
        this.threads = [
            { name: 'main', type: 'user', daemon: false, priority: 5, status: 'running' },
            { name: 'Reference Handler', type: 'system', daemon: true, priority: 10, status: 'waiting' },
            { name: 'Finalizer', type: 'system', daemon: true, priority: 8, status: 'waiting' },
            { name: 'Signal Dispatcher', type: 'system', daemon: true, priority: 9, status: 'running' }
        ];
        this.currentThread = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawThreadingPreview(ctx, canvas.width, canvas.height);
    }
    
    drawThreadingPreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制线程预览
        const threadHeight = 25;
        const startY = 50;
        
        this.threads.slice(0, 3).forEach((thread, index) => {
            const y = startY + index * (threadHeight + 10);
            
            ctx.fillStyle = thread.daemon ? '#fbb6ce' : '#9ae6b4';
            ctx.fillRect(20, y, width - 40, threadHeight);
            
            ctx.fillStyle = '#2d3748';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(thread.name, 30, y + 17);
            
            ctx.textAlign = 'right';
            ctx.fillText(thread.daemon ? '守护' : '用户', width - 30, y + 17);
        });
        
        // 标题
        ctx.fillStyle = '#4a5568';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('JVM 线程模型', width / 2, 30);
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentThread = 0;
        this.animate();
    }
    
    animate() {
        this.drawThreadModel();
        
        if (this.currentThread < this.threads.length) {
            setTimeout(() => {
                this.currentThread++;
                this.animate();
            }, 2000);
        }
    }
    
    drawThreadModel() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制JVM进程框架
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(50, 50, width - 100, height - 150);
        ctx.strokeStyle = '#4299e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(50, 50, width - 100, height - 150);
        
        // 标题
        ctx.fillStyle = '#4299e1';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('JVM 进程', width / 2, 80);
        
        // 绘制线程
        this.threads.forEach((thread, index) => {
            if (index < this.currentThread) {
                this.drawThread(ctx, thread, 100, 120 + index * 80, width - 200, 60);
            }
        });
        
        // 绘制线程统计
        this.drawThreadStats(ctx, 50, height - 80, width - 100, 60);
    }
    
    drawThread(ctx, thread, x, y, width, height) {
        // 线程背景色
        ctx.fillStyle = thread.daemon ? '#fed7d7' : '#c6f6d5';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = thread.daemon ? '#e53e3e' : '#48bb78';
        ctx.strokeRect(x, y, width, height);
        
        // 线程名称
        ctx.fillStyle = '#2d3748';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(thread.name, x + 10, y + 25);
        
        // 线程属性
        ctx.font = '12px Arial';
        ctx.fillText(`类型: ${thread.type}`, x + 10, y + 45);
        ctx.fillText(`优先级: ${thread.priority}`, x + 150, y + 25);
        ctx.fillText(`状态: ${thread.status}`, x + 150, y + 45);
        
        // 守护线程标识
        if (thread.daemon) {
            ctx.fillStyle = '#e53e3e';
            ctx.fillRect(x + width - 60, y + 5, 50, 20);
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('守护线程', x + width - 35, y + 17);
        } else {
            ctx.fillStyle = '#48bb78';
            ctx.fillRect(x + width - 60, y + 5, 50, 20);
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('用户线程', x + width - 35, y + 17);
        }
    }
    
    drawThreadStats(ctx, x, y, width, height) {
        ctx.fillStyle = '#4299e1';
        ctx.fillRect(x, y, width, height);
        
        const userThreads = this.threads.filter(t => !t.daemon).length;
        const daemonThreads = this.threads.filter(t => t.daemon).length;
        
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`线程统计 - 用户线程: ${userThreads}, 守护线程: ${daemonThreads}`, x + width / 2, y + 20);
        ctx.fillText('当所有用户线程结束时，JVM会自动退出', x + width / 2, y + 40);
    }
    
    reset() {
        this.currentThread = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        const userThreads = this.threads.slice(0, this.currentThread).filter(t => !t.daemon).length;
        const daemonThreads = this.threads.slice(0, this.currentThread).filter(t => t.daemon).length;
        
        return {
            '活跃线程': this.currentThread,
            '用户线程': userThreads,
            '守护线程': daemonThreads,
            'JVM状态': userThreads > 0 ? '运行中' : '准备退出'
        };
    }
}

// 执行引擎演示
class ExecutionEngineDemo {
    constructor() {
        this.executionModes = [
            { name: '解释执行', description: '逐条解释字节码指令', color: '#4299e1' },
            { name: 'JIT编译', description: '热点代码编译为机器码', color: '#48bb78' },
            { name: '混合执行', description: '解释执行 + JIT编译', color: '#9f7aea' }
        ];
        this.currentMode = 0;
        this.hotspotCounter = 0;
    }
    
    initPreview(element) {
        const canvas = document.createElement('canvas');
        canvas.width = element.clientWidth;
        canvas.height = element.clientHeight;
        element.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        this.drawExecutionPreview(ctx, canvas.width, canvas.height);
    }
    
    drawExecutionPreview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        // 绘制执行模式预览
        const modes = ['解释', 'JIT', '混合'];
        const modeWidth = width / 3;
        const modeHeight = height - 40;
        
        modes.forEach((mode, index) => {
            const x = index * modeWidth;
            const colors = ['#4299e1', '#48bb78', '#9f7aea'];
            
            ctx.fillStyle = colors[index];
            ctx.fillRect(x + 10, 20, modeWidth - 20, modeHeight);
            
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(mode, x + modeWidth / 2, modeHeight / 2 + 20);
        });
    }
    
    start(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentMode = 0;
        this.hotspotCounter = 0;
        this.animate();
    }
    
    animate() {
        this.drawExecutionEngine();
        
        if (this.currentMode < this.executionModes.length) {
            setTimeout(() => {
                this.currentMode++;
                this.animate();
            }, 3000);
        }
    }
    
    drawExecutionEngine() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制字节码
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(50, 50, 200, 150);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(50, 50, 200, 150);
        
        ctx.fillStyle = '#4a5568';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('字节码', 150, 40);
        
        ctx.fillStyle = '#2d3748';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        const bytecodes = ['iconst_1', 'istore_1', 'iload_1', 'iconst_1', 'iadd', 'istore_2'];
        bytecodes.forEach((code, index) => {
            ctx.fillText(code, 60, 80 + index * 20);
        });
        
        // 绘制执行引擎
        if (this.currentMode > 0) {
            const mode = this.executionModes[this.currentMode - 1];
            
            ctx.fillStyle = mode.color;
            ctx.fillRect(350, 100, 200, 100);
            
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('执行引擎', 450, 130);
            ctx.font = '14px Arial';
            ctx.fillText(mode.name, 450, 150);
            ctx.font = '12px Arial';
            ctx.fillText(mode.description, 450, 170);
            
            // 绘制箭头
            this.drawArrow(ctx, 250, 125, 350, 125);
        }
        
        // 绘制机器码输出
        if (this.currentMode >= 2) {
            ctx.fillStyle = '#f0fff4';
            ctx.fillRect(600, 50, 150, 150);
            ctx.strokeStyle = '#48bb78';
            ctx.strokeRect(600, 50, 150, 150);
            
            ctx.fillStyle = '#48bb78';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('机器码', 675, 40);
            
            ctx.fillStyle = '#2d3748';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            const machineCodes = ['mov eax, 1', 'mov [ebp-4], eax', 'mov eax, [ebp-4]', 'add eax, 1'];
            machineCodes.forEach((code, index) => {
                ctx.fillText(code, 610, 80 + index * 20);
            });
            
            // 绘制箭头
            this.drawArrow(ctx, 550, 125, 600, 125);
        }
        
        // 绘制热点检测
        if (this.currentMode >= 2) {
            this.drawHotspotDetection(ctx, 50, 250, width - 100, 100);
        }
        
        // 绘制性能对比
        this.drawPerformanceComparison(ctx, 50, 380, width - 100, 80);
    }
    
    drawHotspotDetection(ctx, x, y, width, height) {
        ctx.fillStyle = '#fff5f5';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#e53e3e';
        ctx.strokeRect(x, y, width, height);
        
        ctx.fillStyle = '#e53e3e';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('热点检测机制', x + width / 2, y + 25);
        
        // 热点计数器
        this.hotspotCounter = Math.min(this.hotspotCounter + 1, 10000);
        
        ctx.fillStyle = '#2d3748';
        ctx.font = '14px Arial';
        ctx.fillText(`方法调用次数: ${this.hotspotCounter}`, x + width / 2, y + 50);
        
        if (this.hotspotCounter >= 10000) {
            ctx.fillStyle = '#48bb78';
            ctx.fillText('触发JIT编译！', x + width / 2, y + 75);
        } else {
            ctx.fillStyle = '#4299e1';
            ctx.fillText(`距离JIT编译还需: ${10000 - this.hotspotCounter} 次调用`, x + width / 2, y + 75);
        }
    }
    
    drawPerformanceComparison(ctx, x, y, width, height) {
        ctx.fillStyle = '#4299e1';
        ctx.fillRect(x, y, width, height);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('性能对比', x + width / 2, y + 25);
        
        ctx.font = '12px Arial';
        ctx.fillText('解释执行: 1x | JIT编译: 10-100x | 启动时间: 解释 < JIT', x + width / 2, y + 50);
    }
    
    drawArrow(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // 箭头头部
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = '#4a5568';
        ctx.fill();
    }
    
    reset() {
        this.currentMode = 0;
        this.hotspotCounter = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    getStatus() {
        const mode = this.currentMode > 0 ? this.executionModes[this.currentMode - 1] : null;
        return {
            '执行模式': mode ? mode.name : '未开始',
            '热点计数': this.hotspotCounter,
            'JIT状态': this.hotspotCounter >= 10000 ? '已编译' : '未触发',
            '性能提升': mode && mode.name === 'JIT编译' ? '10-100倍' : '1倍'
        };
    }
}

// 全局变量和函数
let demoSystem = null;

// 初始化演示系统
window.addEventListener('DOMContentLoaded', function() {
    demoSystem = new CodeExecutionDemo();
});

// 打开演示模态框
function openDemo(demoType) {
    const modal = document.getElementById('demoModal');
    const modalTitle = document.getElementById('modalTitle');
    const canvas = document.getElementById('demoCanvas');
    const stepIndicator = document.getElementById('stepIndicator');
    
    const titles = {
        compilation: 'javac编译过程演示',
        bytecode: '字节码执行演示',
        constantpool: '常量池机制演示',
        jvmstartup: 'JVM启动机制演示',
        threading: 'JVM线程模型演示',
        execution: '字节码执行引擎演示'
    };
    
    modalTitle.textContent = titles[demoType] || '演示';
    
    // 设置步骤指示器
    const demo = demoSystem.demos[demoType];
    if (demo.steps) {
        stepIndicator.innerHTML = '';
        demo.steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'step';
            stepElement.textContent = step.name;
            stepIndicator.appendChild(stepElement);
        });
    } else {
        stepIndicator.innerHTML = '';
    }
    
    demoSystem.currentDemo = demoType;
    modal.style.display = 'block';
    
    // 调整canvas大小
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = 400;
    
    // 重置演示状态
    resetDemo();
}

// 关闭演示模态框
function closeModal() {
    const modal = document.getElementById('demoModal');
    modal.style.display = 'none';
    
    // 停止当前演示
    if (demoSystem.animationId) {
        cancelAnimationFrame(demoSystem.animationId);
        demoSystem.animationId = null;
    }
    demoSystem.isRunning = false;
    demoSystem.isPaused = false;
}

// 开始演示
function startDemo() {
    if (demoSystem.isRunning && !demoSystem.isPaused) return;
    
    const canvas = document.getElementById('demoCanvas');
    const ctx = canvas.getContext('2d');
    
    if (demoSystem.isPaused) {
        demoSystem.isPaused = false;
    } else {
        demoSystem.isRunning = true;
        demoSystem.demos[demoSystem.currentDemo].start(canvas, ctx);
    }
    
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    
    updateStatus();
}

// 暂停演示
function pauseDemo() {
    if (!demoSystem.isRunning || demoSystem.isPaused) return;
    
    demoSystem.isPaused = true;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
}

// 重置演示
function resetDemo() {
    demoSystem.isRunning = false;
    demoSystem.isPaused = false;
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    
    const canvas = document.getElementById('demoCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    demoSystem.demos[demoSystem.currentDemo].reset();
    
    // 重置步骤指示器
    const stepIndicator = document.getElementById('stepIndicator');
    const steps = stepIndicator.querySelectorAll('.step');
    steps.forEach(step => {
        step.className = 'step';
    });
    
    updateStatus();
}

// 单步执行
function stepDemo() {
    const canvas = document.getElementById('demoCanvas');
    const ctx = canvas.getContext('2d');
    
    const demo = demoSystem.demos[demoSystem.currentDemo];
    
    // 如果演示未开始，则初始化
    if (!demoSystem.isRunning) {
        demoSystem.isRunning = true;
        demo.currentStep = 0;
    }
    
    // 执行下一步
    if (demo.currentStep < (demo.steps ? demo.steps.length : (demo.bytecodes ? demo.bytecodes.length : 0))) {
        demo.currentStep++;
        demo.drawCompilationProcess ? demo.drawCompilationProcess() : 
        demo.drawBytecodeExecution ? demo.drawBytecodeExecution() : 
        demo.drawConstantPoolAccess ? demo.drawConstantPoolAccess() : 
        demo.drawJVMStartupProcess ? demo.drawJVMStartupProcess() : 
        demo.drawThreadModel ? demo.drawThreadModel() : 
        demo.drawExecutionEngine();
        
        // 更新步骤指示器
        if (demo.steps) {
            const stepIndicator = document.getElementById('stepIndicator');
            const steps = stepIndicator.querySelectorAll('.step');
            if (steps.length > 0 && demo.currentStep > 0) {
                steps[demo.currentStep - 1].className = 'step active';
                for (let i = 0; i < demo.currentStep - 1; i++) {
                    steps[i].className = 'step completed';
                }
            }
        }
    }
    
    updateStatus();
}

// 设置演示速度
function setSpeed(speed) {
    demoSystem.speed = speed;
}

// 更新状态面板
function updateStatus() {
    const statusContent = document.getElementById('statusContent');
    const demo = demoSystem.demos[demoSystem.currentDemo];
    
    if (!demo) return;
    
    const status = demo.getStatus();
    let statusHTML = '';
    
    for (const [key, value] of Object.entries(status)) {
        statusHTML += `<div class="status-item">
            <span class="status-label">${key}:</span>
            <span class="status-value">${value}</span>
        </div>`;
    }
    
    statusContent.innerHTML = statusHTML;
}