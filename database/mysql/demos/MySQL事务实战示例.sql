-- =====================================================
-- MySQL事务实战示例 - 完整演示脚本
-- 作者：令狐老师
-- 说明：涵盖事务基础、并发问题、锁机制、死锁等核心场景
-- =====================================================

-- 1. 环境准备
-- =====================================================

-- 创建测试数据库
DROP DATABASE IF EXISTS transaction_demo;
CREATE DATABASE transaction_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE transaction_demo;

-- 查看当前隔离级别
SELECT @@transaction_isolation;

-- 查看自动提交状态
SHOW SESSION VARIABLES LIKE 'autocommit';

-- 2. 银行转账场景演示
-- =====================================================

-- 创建账户表
CREATE TABLE account (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_no VARCHAR(20) UNIQUE NOT NULL,
    account_name VARCHAR(50) NOT NULL,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_account_no (account_no)
) ENGINE=InnoDB;

-- 插入测试数据
INSERT INTO account (account_no, account_name, balance) VALUES 
('CMBC001', '令狐冲工资卡', 100000.00),
('ICBC001', '令狐冲私房钱', 50000.00),
('ABC001', '任盈盈储蓄卡', 80000.00);

-- 查看初始数据
SELECT * FROM account;

-- 2.1 正常转账事务
-- =====================================================
BEGIN;

-- 检查转出账户余额（加排他锁）
SELECT account_name, balance 
FROM account 
WHERE account_no = 'CMBC001' 
FOR UPDATE;

-- 执行转账操作
UPDATE account SET balance = balance - 10000 WHERE account_no = 'CMBC001';
UPDATE account SET balance = balance + 10000 WHERE account_no = 'ICBC001';

-- 验证转账结果
SELECT account_no, account_name, balance 
FROM account 
WHERE account_no IN ('CMBC001', 'ICBC001');

-- 提交事务
COMMIT;

-- 查看最终结果
SELECT * FROM account;

-- 2.2 转账失败回滚演示
-- =====================================================
BEGIN;

-- 模拟转账金额超过余额的情况
UPDATE account SET balance = balance - 200000 WHERE account_no = 'CMBC001';

-- 检查余额是否为负（业务逻辑检查）
SELECT account_no, balance FROM account WHERE account_no = 'CMBC001';

-- 发现余额不足，回滚事务
ROLLBACK;

-- 验证回滚后数据未变化
SELECT * FROM account;

-- 3. 电商库存扣减场景
-- =====================================================

-- 创建商品表
CREATE TABLE product (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_name VARCHAR(100) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    price DECIMAL(10,2) NOT NULL,
    version INT NOT NULL DEFAULT 0,  -- 乐观锁版本号
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 插入测试商品
INSERT INTO product (product_name, stock, price) VALUES 
('iPhone 15 Pro', 100, 9999.00),
('MacBook Pro', 50, 19999.00),
('AirPods Pro', 200, 1999.00);

-- 3.1 悲观锁库存扣减
-- =====================================================
BEGIN;

-- 查询并锁定商品（悲观锁）
SELECT id, product_name, stock 
FROM product 
WHERE id = 1 
FOR UPDATE;

-- 检查库存是否充足
-- 假设要购买5件
SET @purchase_qty = 5;

-- 扣减库存
UPDATE product 
SET stock = stock - @purchase_qty 
WHERE id = 1 AND stock >= @purchase_qty;

-- 检查更新是否成功
SELECT ROW_COUNT() as affected_rows;

-- 查看更新后的库存
SELECT id, product_name, stock FROM product WHERE id = 1;

COMMIT;

-- 3.2 乐观锁库存扣减
-- =====================================================

-- 先查询当前版本号
SELECT id, product_name, stock, version FROM product WHERE id = 2;

-- 假设查询到的version为0，stock为50
SET @old_version = 0;
SET @purchase_qty = 3;

BEGIN;

-- 使用乐观锁更新
UPDATE product 
SET stock = stock - @purchase_qty, 
    version = version + 1 
WHERE id = 2 
  AND stock >= @purchase_qty 
  AND version = @old_version;

-- 检查是否更新成功
SELECT ROW_COUNT() as affected_rows;

-- 如果affected_rows = 0，说明版本冲突或库存不足
SELECT id, product_name, stock, version FROM product WHERE id = 2;

COMMIT;

-- 4. 事务隔离级别演示
-- =====================================================

-- 4.1 脏读演示（READ UNCOMMITTED）
-- =====================================================

-- 设置隔离级别为READ UNCOMMITTED
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- 会话1：开始事务并修改数据（不提交）
-- BEGIN;
-- UPDATE account SET balance = 999999 WHERE account_no = 'CMBC001';

-- 会话2：读取未提交的数据（脏读）
-- SELECT account_no, balance FROM account WHERE account_no = 'CMBC001';

-- 会话1：回滚事务
-- ROLLBACK;

-- 4.2 不可重复读演示（READ COMMITTED）
-- =====================================================

-- 设置隔离级别为READ COMMITTED
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- 会话1：开始事务并读取数据
-- BEGIN;
-- SELECT account_no, balance FROM account WHERE account_no = 'CMBC001';

-- 会话2：修改并提交数据
-- BEGIN;
-- UPDATE account SET balance = balance + 1000 WHERE account_no = 'CMBC001';
-- COMMIT;

-- 会话1：再次读取相同数据（不可重复读）
-- SELECT account_no, balance FROM account WHERE account_no = 'CMBC001';
-- COMMIT;

-- 4.3 幻读演示（REPEATABLE READ）
-- =====================================================

-- 设置隔离级别为REPEATABLE READ
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 会话1：开始事务并查询数据
-- BEGIN;
-- SELECT COUNT(*) FROM account WHERE balance > 50000;

-- 会话2：插入新数据
-- BEGIN;
-- INSERT INTO account (account_no, account_name, balance) VALUES ('BOC001', '测试账户', 60000);
-- COMMIT;

-- 会话1：再次查询（在RR级别下，InnoDB通过间隙锁解决了幻读）
-- SELECT COUNT(*) FROM account WHERE balance > 50000;
-- COMMIT;

-- 5. 死锁演示与解决
-- =====================================================

-- 5.1 经典死锁场景
-- =====================================================

-- 创建死锁演示表
CREATE TABLE deadlock_demo (
    id INT PRIMARY KEY,
    value VARCHAR(50)
) ENGINE=InnoDB;

INSERT INTO deadlock_demo VALUES (1, 'A'), (2, 'B');

-- 会话1执行：
-- BEGIN;
-- UPDATE deadlock_demo SET value = 'A1' WHERE id = 1;
-- -- 等待5秒
-- UPDATE deadlock_demo SET value = 'B1' WHERE id = 2;

-- 会话2同时执行：
-- BEGIN;
-- UPDATE deadlock_demo SET value = 'B2' WHERE id = 2;
-- -- 等待5秒
-- UPDATE deadlock_demo SET value = 'A2' WHERE id = 1;

-- 5.2 死锁检测与处理
-- =====================================================

-- 查看死锁信息
SHOW ENGINE INNODB STATUS;

-- 查看当前事务
SELECT * FROM information_schema.INNODB_TRX;

-- 查看锁等待
SELECT * FROM information_schema.INNODB_LOCK_WAITS;

-- 6. MVCC机制演示
-- =====================================================

-- 创建MVCC演示表
CREATE TABLE mvcc_demo (
    id INT PRIMARY KEY,
    name VARCHAR(50),
    value INT
) ENGINE=InnoDB;

INSERT INTO mvcc_demo VALUES (1, 'test', 100);

-- 6.1 REPEATABLE READ下的MVCC
-- =====================================================

-- 会话1：开始长事务
-- SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- BEGIN;
-- SELECT * FROM mvcc_demo WHERE id = 1;  -- 创建ReadView

-- 会话2：修改数据
-- BEGIN;
-- UPDATE mvcc_demo SET value = 200 WHERE id = 1;
-- COMMIT;

-- 会话1：再次读取（应该仍然看到旧值100）
-- SELECT * FROM mvcc_demo WHERE id = 1;
-- COMMIT;

-- 6.2 READ COMMITTED下的MVCC
-- =====================================================

-- 会话1：开始事务
-- SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- BEGIN;
-- SELECT * FROM mvcc_demo WHERE id = 1;  -- 第一次读取

-- 会话2：修改数据
-- BEGIN;
-- UPDATE mvcc_demo SET value = 300 WHERE id = 1;
-- COMMIT;

-- 会话1：再次读取（应该看到新值300）
-- SELECT * FROM mvcc_demo WHERE id = 1;  -- 创建新的ReadView
-- COMMIT;

-- 7. 锁机制详细演示
-- =====================================================

-- 7.1 记录锁演示
-- =====================================================
BEGIN;
-- 锁定特定记录
SELECT * FROM account WHERE id = 1 FOR UPDATE;
-- 其他会话无法修改id=1的记录
COMMIT;

-- 7.2 间隙锁演示
-- =====================================================
-- 创建有序数据用于演示间隙锁
CREATE TABLE gap_lock_demo (
    id INT PRIMARY KEY,
    value VARCHAR(10)
) ENGINE=InnoDB;

INSERT INTO gap_lock_demo VALUES (1, 'A'), (5, 'B'), (10, 'C'), (15, 'D');

BEGIN;
-- 范围查询会加间隙锁
SELECT * FROM gap_lock_demo WHERE id > 5 AND id < 10 FOR UPDATE;
-- 其他会话无法在(5,10)间隙插入数据
COMMIT;

-- 7.3 Next-Key Lock演示
-- =====================================================
BEGIN;
-- Next-Key Lock = Record Lock + Gap Lock
SELECT * FROM gap_lock_demo WHERE id <= 10 FOR UPDATE;
-- 锁定(-∞,1], (1,5], (5,10]
COMMIT;

-- 8. 性能监控与分析
-- =====================================================

-- 8.1 事务统计
-- =====================================================
SHOW STATUS LIKE 'Com_commit';
SHOW STATUS LIKE 'Com_rollback';
SHOW STATUS LIKE 'Com_begin';

-- 8.2 锁统计
-- =====================================================
SHOW STATUS LIKE 'Innodb_row_lock%';

-- 8.3 死锁统计
-- =====================================================
SHOW STATUS LIKE 'Innodb_deadlocks';

-- 8.4 当前活跃事务
-- =====================================================
SELECT 
    trx_id,
    trx_state,
    trx_started,
    trx_requested_lock_id,
    trx_wait_started,
    trx_weight,
    trx_mysql_thread_id,
    trx_query
FROM information_schema.INNODB_TRX;

-- 8.5 锁信息查询（MySQL 8.0+）
-- =====================================================
SELECT 
    OBJECT_SCHEMA,
    OBJECT_NAME,
    LOCK_TYPE,
    LOCK_MODE,
    LOCK_STATUS,
    LOCK_DATA
FROM performance_schema.data_locks;

-- 9. 清理测试数据
-- =====================================================

-- 恢复默认隔离级别
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 删除测试表
DROP TABLE IF EXISTS deadlock_demo;
DROP TABLE IF EXISTS mvcc_demo;
DROP TABLE IF EXISTS gap_lock_demo;

-- 清空测试数据
TRUNCATE TABLE account;
TRUNCATE TABLE product;

-- 重新插入初始数据
INSERT INTO account (account_no, account_name, balance) VALUES 
('CMBC001', '令狐冲工资卡', 100000.00),
('ICBC001', '令狐冲私房钱', 50000.00),
('ABC001', '任盈盈储蓄卡', 80000.00);

INSERT INTO product (product_name, stock, price) VALUES 
('iPhone 15 Pro', 100, 9999.00),
('MacBook Pro', 50, 19999.00),
('AirPods Pro', 200, 1999.00);

-- =====================================================
-- 脚本执行完成
-- 
-- 使用说明：
-- 1. 本脚本包含完整的MySQL事务演示场景
-- 2. 多会话演示需要开启多个MySQL客户端
-- 3. 注释中的"会话1"、"会话2"需要在不同连接中执行
-- 4. 建议按顺序执行，理解每个场景的原理
-- 5. 可以根据需要调整测试数据和参数
-- =====================================================