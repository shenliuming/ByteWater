# MySQL专题

> # MySQLInnoDB事务与锁



## 学习完MySQL事务与锁你能得到什么

第一节课，通过一条SQL语句执行的流程，我们告诉了大家，因为我们MySQL客户端与服务端通讯方式：半双工，通讯类型是同步的，意味着我们执行一条SQL只能等待结果集的返回，如果一条SQL执行效率太慢，就会降低我们程序的性能和吞吐量。

第二节课如何去优化我们的SQL语句，如何去命中索引， 其实这个是由于我们索引树存储数据的方式去决定的，使用了某些系统函数，或者是在索引列上做计算，会导致表扫描，使得我们没办法命中我们的索引树，至于到 底是否失效，这个跟数据库版本，表内数据的具体情况由我们的优化器去决定的，我 们说了不算，要具体问题，具体分析。

今天这节课，我们来学习事务与锁，为什么要学习事务呢，最根本的问题是什么是事务和锁，当问题出现的时候我们要知道怎么去分析和解决，有一定的解决问题的思路和方法。



# 一、教学课题

# **MySQL课程总体**

- ## 第一天MySQL 架构

- ## 第二天MySQL 索引 

- ## 第三天MySQL 事务（今天的课程）

- ## 第四天MySQL 复习+面试题



# MySQL事务与锁机制分析



# 一、复习昨天内容 （15min）

回顾上一个课程MySQL的索引

从Page页的角度带大家推导B+树的形成。

​		Page存储、排序、增加、修改、删除、查询。

存储：

​		同一个Page页：page页内使用单向链表建立链接。

​		不同的Page页：多个Page使用双向链表建立链接。

排序：

​		表内有主键索引使用主键作为键值排序。

​		无主键索引使用非空的唯一索引作为键值排序。

​		两者都无使用隐藏列row_id进行排序。

页的分裂与合并：

​		无序增加、删除、修改主键都会导致页的分裂与合并。

查询：

​		我们存储数据的方式是双向链表存储Page，查询的时间复杂度的O(N)，为了解决这个问题我们参考了书本目录页的思想，为我们的Page建立目录索引页，提高查询速度，同时目录索引页过多也可以为建立目录索引，最后我们存储的数据结构形成了一棵B+树。B+树数据查找我们每次查询都由跟结点出发，经过非叶子结点，最终到达子叶结点拿到数据，每次获取数据的磁盘IO次数是跟B+树的深度是一样的，极大提高了我们的查询效率。当然还有B+树的其他的优点我们就不一个个去重复了。

然后我们聊到了，InnoDB的主键索引树和二级索引树的区别：

| 区别 | 主键索引                                 | 二级索引                                     |
| ---- | ---------------------------------------- | -------------------------------------------- |
| 数量 | 一张表只有一个主键索引树                 | 一张表可以有多个二级索引树                   |
| 存储 | 可以存储表里的所有列数据，提升查询效率。 | 存储表里的部分数据列、辅助查询，提升查询效率 |
| 创建 | 建表时候自动创建                         | 手动创建                                     |
| 排序 | 主键ID、非空唯一索引、rowid              | 根据用户创建二级索引时候的列名从左到右       |
| 场景 | 主键索引，排序                           | 回表、覆盖索引、索引下推                     |
|      |                                          |                                              |

然后我们聊到了一个真实的面试场景：

​		组合索引 A B C  where  B > 1 ADN A = 1 AND C = 1 的SQL语句是否命中了索引，怎么看，检查SQL语句是否命中索引。

​		使用EXPLAIN 语句输出，MySQL执行计划优化器的预执行信息，检查SQL语句是否命中索引，扫描行数，和一些额外信息：

**TYPE访问类型：**

​		cost：主键索引

​		ref：使用了二级索引

​		range：使用了索引检索范围行

​		index：全索引扫描

​		all：全表扫描

​		性能从高往下变低

**possible_keys**

可能用到的索引

**key**

实际上使用的索引

**ROWS**（扫描的行数）

数据量越大，扫描越多，性能越低

**Extra** [ˈekstrə] （附加信息）

1. Using where 使用where 过滤

   - 仅表示是否存在where子句限制对结果集进行筛选后返回，要不要优化根据type一起考虑

2. Using index 使用了覆盖索引，一般会出现在二级索引树里

   - 如果没有出现using where，仅表示是否使用了覆盖索引，即查询涉及字段均可以从一个索引中获得，单独的Using Index表示从索引中获取返回结果集即可直接作为最终结果返回。
   - Using where; Using index 表示sql使用了覆盖索引--所有字段均从一个索引中获取，同时在从索引中查询出初步结果后，还需要使用组成索引的部分字段进一步进行条件筛选，而不是说需要回表获取完整行数据--其实直觉上这种理解也更合理，因为Using index已经表示所有查询涉及字段都在索引里面包含了，压根没有什么额外字段需要再回表才能获取，那回表又有什么意义呢？

3. Using filesort 排序没有用到索引

   - 查询的时候用到了索引，但是排序的时候没有用到，导致sql用到文件排序

4. Using index condition 索引下推

   - 使用二级索引 ,查找使用了索引，但是需要回表查询数据

   - 因为我们这里select * 查找的是所有字段,而我们的字段d是没有创建索引的,我们无法直接从索引树取数据,需要回表.

     大家还记不记得索引下推：5.6以后完善的功能，只适用于二级索引。其实就是把过滤的动作在存储引擎做完，而不需要到Server层过滤。

讲了索引失效的场景

比如：类型转换、百分号前置、系统函数、索引桥断裂、列计算、范围查询、索引列的离散度等等

总结出：真正的是否走索引是由我们的优化器去决定的。



好了开始我们今天的学习内容。



# 二、今日教学目标

1. **重温事务概念、特性。**
2. **事务并发产生的问题，以及怎么解决？隔离级别有哪些。**
3. **事务并发产生的问题解决原理、锁机制。**



# 三、教学过程(80min)

## 什么是数据库事务？

**<font color='red'>提问：什么是事务？</font>**

> ​	事务就是想要做的事情。
>
> ​		在关系型数据库中，事务其实就是【一组原子性的SQL】或者说一个独立不可分割的工作单元，如果数据库引擎能成功地对数据库引用该组查询的全部语句，那么就执行该组查询，如果其中有任何一条语句因为崩溃或者其他原因无法执行，那么所有的语句都不会执行，也就是说，事务内的语句，要么全部执行成功，要么全部执行失败。
>
> ​		举个例子，张三有两张银行卡，一张是招商银行的（CMBC)工资卡，一张是中国工商银行（ICBC）的私房钱卡。每月工资日张三就会从CMBC银行卡转10万块钱到ICBC私房钱账户上。
>
> 
>
> 这个转账的业务，我们简化抽成一个事务，包括一下的步骤：
>
> 1. 查询CMBC账户的余额是否大于10W块钱
> 2. 从CMBC账户余额中减去10W块钱
> 3. 在ICBC账户余额中增加10W块钱
>
> 
>
> ​        这时候如果在执行完第二步的时候，发生意外了系统宕机了，ICBC账户余额没有增加10W块钱，这个时候张三可能会哭死。这种情况你觉得如果你是张三你能接受吗？这肯定不行啊
>
> ​		所以，我们的技术都是为了服务于业务的。数据库事务就是为了解决这样业务场景的一门技术，就是为了保证多个SQL语句，要么全部执行成功，要么全部执行失败。

### 事务的简单的操作

### 事务的语法

```sql
# 先来看看我们今天演示的MySQL版本，接下来的操作都是基于这个版本进行。
select version();

# 还记得我们第一节课讲的存储引擎吗，MySQL里面InnoDB和NDB都支持事务，这节课我们都基于InnoDB存储引擎来展开：
# 会不会还有同学不知道，日常开发中用的存储引擎，可能实际开发中也并不关心。
# 你们在工作中呢，大部分人都是使用InnoDB存储引擎，因为是默认的，在第一节课MySQL简史就已经介绍过了，就不再赘述了。
# 我们可以通过下面的语句查看我们表用了什么引擎：
SELECT ENGINE from  information_schema.tables where table_name='BANK_ICBC';

```

**<font color='red'>怎么去开启一个事务呢？</font>**

BEGIN; COMMIT; BEGIN;ROLLBACK;  

 `@Transactional`  xml bean 配置扫描

这里多问一句，Spring事务传播行为NESTED [ˈnestɪd]  是基于什么实现的？（必须关闭自动提交）

NESTED 实现了嵌事务：主事务和嵌套事务属于同一个事务，嵌套事务出错回滚不会影响主事务，主事务回滚会将嵌套事务一起回滚。

是的，savepoint 设置回滚点。

```sql
#  -- 查询自动提交是否开启
show session VARIABLES like 'autocommit'; 
# 关闭自动提交
SET SESSION autocommit=0;
```

```sql
# 我们来模拟一下张三两个账户之间转账的事务
# 开启转账事务
BEGIN;
SELECT BALANCE FROM BANK_CMBC WHERE USER_NAME = '张三';
# 这里需要判断余额 是否大于等于 10W
UPDATE BANK_CMBC SET BALANCE = BALANCE - 100000 WHERE USER_NAME = '张三';
UPDATE BANK_ICBC SET BALANCE = BALANCE + 100000 WHERE USER_NAME = '张三';
# 这里当然还需要记录 记录表 日志表 转账记录表 等
SELECT * FROM BANK_CMBC;
SELECT * FROM BANK_ICBC;
# 提交
COMMIT;
# 回滚
ROLLBACK;

# 这个
# BANK_CMBC 里的余额会减去10W 然后 BANK_ICBC账户增加10W，
# 这个就是我们事务的具体使用场景了，要么全部成功要么全部失败！

# 问：我能不能只提交一部分事务，一部分事务不提交呢？
# 可以的，使用我们的SAVEPOINT，但是呢要记得提交，如果只是回滚了回滚点，没有把主事务提交。

# 使用回滚点 
BEGIN;
SELECT BALANCE FROM BANK_CMBC WHERE USER_NAME = '张三';
# 这里需要判断余额 是否大于等于 10W
UPDATE BANK_CMBC SET BALANCE = BALANCE - 100000 WHERE USER_NAME = '张三';
SAVEPOINT A;

UPDATE BANK_ICBC SET BALANCE = BALANCE + 100000 WHERE USER_NAME = '张三';

# 这里当然还需要记录 记录表 日志表 转账记录表 等
# 回滚到保存点
ROLLBACK TO A;
SELECT * FROM BANK_CMBC;
SELECT * FROM BANK_ICBC;
COMMIT;

# 这个时候我们的记录是多少？
# 我们看一下 在SAVEPOINT 之前的语句都能正确提交，SAVEPOINT之后的语句因为我们手动回滚了他们是没有被更改成的，这
# 就是SAVEPOINT的作用，他能够在一个事务里开启一个嵌套事务。主事务和嵌套事务属于同一个事务，嵌套事务出错回滚不会影响主事务，主事务回滚会将嵌套事务一起回滚。主事务提交嵌套事务也会跟着提交

# 问一个面试官可能会问到的问题，我们知道多条SQL语句开启的时候，能保证全部成功、或者全部失败。那么单条SQL语句有没有事务呢？
# 觉得有的同学刷个冲字，没有的刷个0
# 其实每个语句都是原子性的，他们被隐式的加入了 BEGIN; START TRANSACTION 开启事务，并COMMIT;
# 就好像：

BEGIN;
UPDATE BANK_CMBC SET BALANCE = BALANCE + 100000 WHERE USER_NAME = '张三';
COMMIT;
# 如果在语句执行期间发生错误，则会回滚该语句。

# 如果每个语句都这么写，挺麻烦的。在事务里有一个概念叫做自动提交设置！
# 我们每个单语句都会自动提交的，可以自行关闭自动提交！默认是开启的，这个也区别于全局global和会话session
show session  VARIABLES like 'autocommit';   查询自动开启提交
show global variables like 'autocommit'; 查询自动开启提交
set SESSION autocommit=0;  关闭自动提交

# 那么如果我们去把它关闭的话，我们再看下效果
UPDATE BANK_CMBC SET BALANCE = BALANCE + 100000 WHERE USER_NAME = '张三';  
#如果在另外的事务里面去查询的时候是看不到最新的结果的，我们必须要去提交

commit;  # 必须提交后才能查看到，或者回滚

# 以上就是简单的事务操作了 也是事务原子性 Atomicity[ˌætəˈmɪsəti]的提现了。

# 问大家一个常识性的问题，在大型互联网公司的ToC业务场景都会遇到的问题？是什么问题呢？是不是高并发啊
# 并发数、吞吐量、线程数     QPS 每秒查询、TPS 每秒事务、RT 响应时间
# 刚才我们讲了，一个事务里可能有多条SQL语句查询，在执行还未提交的状态，如果只要一个事务操作一张表或者一条数据，是没有问题的
# 但是如果有多个事务同时操作同一条数据，会引发一个并发的问题哦
# 假如A B 两个事务同时操作 id 为 1 的数据，那么事务A是否需要读取到事务B修改过ID为1的数据呢，如果读了，B事务回滚了怎么办？
# 如果不读，那么我是不是就拿不到最新的数据呢？
# 这也是面试官，经常会问到！事务并发会产生什么问题呢？
```

<font color='red'>接下去开始我们今天的课程了。</font>





## 事务的四大特性是什么？

**<font color='red'>我们都知道事务的四大特性</font>**

ACID。事务的四大特性的保证用户的数据，原子性、一致性、隔离性、持久性。

#### 原子性（atomicity [ˌætəˈmɪsəti]）

​		一个事务必须被视为一个不可分割的最小单元，整个事务中的操作要么全部提交成功，要么全部失败回滚，对于一个事务来说，不可能只执行其中的一部分操作。

窗口1：

```sql
-- 关闭自动提交
SET SESSION autocommit = 0; 
-- 查询自动提交是否开启
show session  VARIABLES like 'autocommit';  

SELECT * FROM BANK_CMBC;
SELECT * FROM BANK_ICBC;

BEGIN;
INSERT INTO BANK_CMBC(id,user_name,balance,remark) VALUES(2,'李四',0.00,'');
UPDATE BANK_CMBC SET balance = 999 WHERE USER_NAME = '张三';

COMMIT; # 提交事务，事务中的操作都会生效 
ROLLBACK; # 回滚事务，事务中的所有操作都不会生效
```

窗口2：

```sql
# 原子性  我们发现开启事务后，没有提交的话也就没有刷新到磁盘的，所以其他用户是查不到相关数据
SELECT * FROM BANK_CMBC;
SELECT * FROM BANK_ICBC;

# 还有1个，当链接断开会自动回滚事务 
# 这个挺简单的，当我们开启一个事务时我们可以将多个sql语句保证原子性，可以ROLLBACK回滚，也可以COMMIT;成功
```

#### 自动提交设置

我们可以通过以下SQL，来查询是否自动提交或者关闭自动提交

```sql
# 查询自动开启提交
show VARIABLES like 'autocommit';  
# 关闭自动提交
set SESSION autocommit=0;  
```

#### 隐式提交

但是也不是所有的语句加上begin就会开启事务，因为有很多语句是能导致隐式提交并且无法回滚

比如：ddl语句 ，具体见  https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html

DDL(Data Definition Language)   ALTER 、CREATE (**定义或修改数据库对象的数据定义语言** )

DML(Data Manipulation Language)   SELELCT、 INSERT

DCL（Data Control Languag） 数据控制语言 COMMIT (**是用来设置或更改数据库用户或角色权限的语句**)



​		肯定是有1个地方能够记录我的sql语句，然后出问题了我能恢复到之前的状态！所以，mysql有个概念叫undolog，翻译过来叫做回滚日志。



#### 一致性（consistency [kənˈsɪstənsi] )

​		数据库总是由一个一致性状态转换到另外一个一致性状态。在前面的例子中，一致性确保了，即使在执行第三条第四条预计之间系统崩溃了，CMBC账户中也不会损失10W，要不然张三要哭死，如果是系统崩溃最终事务没有提交，所有事务中所作的修改也不会保存到数据库中。

​		一致性就很好理解，就是要都能成功或者都失败。我们的原子性，持久性，隔离性都是为了保证我们事务的一致性！！！

​		比如一个银行他总额有1000W，那么在行内用户互相转账，无论怎么转账他的存储金额都是1000W 是不会变的。



#### 持久性（Durability  [dərəˈbɪlɪti）

持久性是为了保证断点等异常的情况，还能保证我们commit的数据不丢失！并且不会回滚！不会出现我commit，重启后又被回滚了！

我们刚才讲了有个undolog能保证原子性，同样的，也有1个redolog，重做日志去保证特殊情况的数据丢失！

redolog会记录每次事务的执行语句！当发生断电等比较不可控的因素后，能根据redolog进行数据恢复！！！





<font color='red'>**为什么会有隔离性，隔离性是因为我们在多线程环境下必然存在，资源竞争的场景，也就是我们常说的高并发？**</font>

> 在多线程的场景下，对于同一个资源的竞争导致的事务并发问题。

<font color='red'>**隔离性，先演示完脏读、不可重复读、幻读的问题，再回来演示**</font>

#### 隔离性（isolation [ˌaɪsəˈleɪʃn] ）

​		通常来说，一个事务所作的修改在最终提交之前，对其他事务是不可见的。在前面的例子中，当执行完第三条语句、第四条语句还未开始的时候，事务尚未提交。这个时候李四去看张三的CMBC账户还是有10W的，如果这个时候李四想要取钱也是不可以的，要等张三的事务提交了。

​		这个隔离性也是我们今天要讲的重点，怎么去实现隔离性！！等下我们再细讲！！！

我们简单回顾了  事务、事务的语法、事务的四大特性。







<font color='red'>这里有两个事务，一个是事务A，一个事务B 他们之间发生并发，会发生一些有意思的问题。</font>

## 事务并发会出现的问题

<font color='red'>打开一个XMIND场景演示脏读、不可重复读、幻读：</font>

脏读.xmind

#### 脏读

​		在事务A 修改了数据之后，提交数据之前，这时另一个事务B读取数据，事务B读取到A修改过数据，之后A又对数据修改再提交，则B读到的数据脏数据，此过程成为脏读Dirty Read。



 **<font color='red'>看XMIND</font>** ，读取到其他事务没有提交的数据，导致第一次和第二次数据不一致性。

不可重复读.xmind

#### 不可重复读（non-repeatable read）

​		一个事务内在读取某些数据后的某个时间，再次读取以前读过的数据，却发现其读出的数据已经发生了变更、或者某些记录已经被删除。

<font color='red'>**看XMID**</font>，在同一个事务中，二次读取的数据不一致。

在同一个事务中，我们的读取的数据应该保持一致，假如你发现去取钱，我第一次去查询的时候是100W然后，任盈盈买了一个包包，剩下50W，然后你想买个设备发现钱剩下50W。糟糕，钱不够了。



幻读.xmind

#### 幻读（phantom） /ˈfæntəm/

​		事务A在按查询条件读取某个范围的记录，事务B又在该范围插入了满足条件的新记录，当事务A再次按条件查询记录时，会产生新的满足条件的记录（幻行，Phantom Row)



<font color='red'> **看XMID**</font>，在事务中第一次读取后，又读取到其他事务增加的数据。



#### 不可重复读与幻读有什么区别？

- 不可重复读的重点是修改：在同一事务中，同样的条件，第一次读的数据和第二次读的「数据不一样」。（因为中间有其他事务提交了修改）
- 幻读的重点在于新增或者删除：在同一事务中，同样的条件，第一次和第二次读出来的「记录条数不一样」。（因为中间有其他事务提交了插入/删除）

不可重复读强调的是在不同事务之间，同一行数据在不同时间点被修改，导致读取的结果不一致；而幻读强调的是在同一个事务内，同一个查询在不同时间点执行，导致结果集合的行数不一致。



## 四个隔离级别知道吗？具体是什么解决了什么问题说说看

**<font color='red'>		我们现在已经知道，原来事务并发会出现，脏读，不可重复读，幻读的问题？那这些问题我们都是需要去解决的，怎么解决呢？</font>**

​		问：我看看了一下，除了脏读外，不可重复读和幻读的问题，在我某些场景我还能接受，我在我的事务里就是要拿到最新的数据，我不需要关注数据第一次查询和最新查询结果是否一致。

​		确实，在某些场景下，我们是不需要 关心和保证。我们可以选择性去解决某部分问题。当然了，脏读这个问题你肯定是要去解决的，这个完全就影响了我们业务，读取到无用的数据。

​		**那怎么解决呢？**

​		譬如新冠疫情隔离级别，居家隔离，方舱隔离，封城隔离。随着隔离级别越高，影响的范围越广，城市的经济也会瘫痪，希望新冠早日过去。

​		那么MySQL是怎么做的呢？它为大家提供了不同的解决方案，解决不同层度的问题。



<span style="color:red">那么，不同的隔离级别解决了什么问题呢？</span>

其实sql标准92版 官方都有定义出来

sql标准不是数据库厂商定义出来的，大家不要以为sql语言是什么mysql，sqlserver搞出来的，我们发现每个数据库语句的sql语句都是差不多的，所以，sql是独立于厂商的！！SQL是Structured Query
Language的缩写，本来就属于一种查询语言！！

http://www.contrib.andrew.cmu.edu/~shadow/sql/sql1992.txt  搜索<span style="color:red">_iso</span>



**那么这就是我们的隔离级别，<font color='red'>不同的隔离级别会解决不同程度的问题</font>。**

打开**<font color='red'>XMIND</font>**  事务的隔离级别

各个隔离级别可以不同程度的解决脏读、不可重复读、幻读.xmind

官网地址：https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html

MySQL的四个隔离级别，跟SQL语言官方定义的不一样：

​	MySQL实现了四个标准的隔离级别，每一种级别都规定了一个事务中所做的修改，哪些在事务内和事务间是可见的，哪些是不可见的。低级别的隔离级一般支持更高的并发处理，并拥有更低的系统开销。

​		各个隔离级别可以不同程度的解决脏读、不可重复读、幻读。隔离级别各有所长，没有完美的解决方案，脱离业务场景谈具体实施都是纸上谈兵。

 具体是什么呢？打开**<font color='red'>XMIND</font>**  隔离级别能解决的并发问题

 我们可以看下官网支持的四种隔离级别，我们也可以通过SQL去查询当前的隔离级别

```sql
SHOW GLOBAL VARIABLES LIKE '%isolation%';  //全局隔离级别
SHOW SESSION VARIABLES LIKE '%isolation%';   

set SESSION autocommit=0;   //关闭自动提交
```

对，InnoDB默认的隔离级别是RR! 

更改语句

```sql
# 修改当前会话的隔离级别为读未提交
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;   
#  读已提交级别
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;  
#  RR级别
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ; 
#  串行化级别 
SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE; 
```

#### 我们从Read UnCommited开始

窗口一：

```sql
# 关闭自动提交
set SESSION autocommit=0;   

SELECT * FROM BANK_CMBC;

BEGIN;
UPDATE SET BANK_CMBC SET BALANCE = 66.66
			 WHERE USER_NAME ='令狐冲';
			 
			 
			 
COMMIT;


ROLLBACK;
```



窗口二：

```sql
SELECT * FROM BANK_CMBC;
```

**<font color='red'>结论：RU没有解决任何问题</font>**



#### Read Commited

窗口一：

```sql
# 关闭自动提交
SET SESSION autocommit = 0;

# 查看自动提交  -- 查询自动提交是否开启
show session  VARIABLES like 'autocommit'; 

# 读已提交级别
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;  

SELECT * FROM BANK_CMBC;

# 开启第二个窗口
BEGIN;

UPDATE BANK_CMBC SET BALANCE = 999 WHERE USER_NAME = '令狐冲';

# 第二个窗口查询是否更改成功
SELECT *  FROM BANK_CMBC;
# 

# 当前窗口查询 查看结果
SELECT *  FROM BANK_CMBC;
```

窗口二：

```sql
# 开启第二个窗口
BEGIN;

UPDATE BANK_CMBC SET BALANCE = 999 WHERE USER_NAME = '令狐冲';

# 第二个窗口查询是否更改成功
SELECT *  FROM BANK_CMBC;
# 
```

<span style="color:red">结论： RC解决了脏读问题，但是没有解决不可重复读跟幻读问题</span>

#### Read Repeatable read

窗口一：

```sql
BEGIN;

SELECT * FROM BANK_CMBC;

# 打开新窗口对这个表数据进行修改和新增

UPDATE BANK_CMBC SET balance = 1 ;
INSERT INTO BANK_CMBC(id,user_name,balance,remark) VALUES(2,'幻读',0,'');


SELECT * FROM BANK_CMBC;


COMMIT;

```

窗口二：

```sql
UPDATE BANK_CMBC SET balance = 1 ;
INSERT INTO BANK_CMBC(id,user_name,balance,remark) VALUES(2,'幻读',0,'');


SELECT * FROM BANK_CMBC;
```

<span style="color:red">结论： RR解决了可重复读的问题，同时也解决了幻读问题</span>

看，问题来了，sql92标准不是定义的RR不会解决幻读问题么，那么我们演示的情况！！！！！innoDB是解决了幻读的问题的！！！老师是不是讲错了！！



<font color='red'>问：这个RR 级别应该是会读取到最新插入的数据？</font>这个问题究竟是怎么解决的呢？

总结：

​		事务并发的三大问题其实都是数据库读一致性问题，必须由数据库提供一定的事务隔离机制来解决。

​		大家还记得我们事务的四大特性里面有个隔离性吧，就是我的单个事务是不能被其他事务影响的，但是现在是明显影响的，但是要读取到最新数据好像也没啥问题，所以才有了不同的隔离级别自由选择。



## 怎么实现事务的隔离级别

Read UnCommited ，其实是没有任何操作的，直接读取最新数据即可。

Serializable 串行化，就是把每个操作加上排他锁，就没必要讲了，在实际的工作中开发是极少极少使用这个场景的。哪怕是强一致性。

I**<font color='red'>nnoDB下RC跟RR怎么去实现隔离级别，怎么解决脏读，不可重复读跟幻读的问题？</font>**

​		现在我们不去看什么mysql它是怎么实现的，就我们自己来想，如果让我们去实现第一个事务读不到第二个事务修改和新增的内容，我们会有哪些方案！！

**<font color='red'>事务A读取了一行数据后，不管你后面的事务对数据再进行更改，我们都不去读取最新的数据，这样可以吗？</font>**

​		假如我事务A和B同时操作ID = 1的数据，为了避免脏读，事务A不读取到事务B的数据，事务A第一次读取到ID=1的数据就不会在进行读取了，这样哪怕事务B对ID=1的数据进行修改我也不会出现脏读的情况。

这种解决方案在MySQL中被称为MVCC，也就是我们的多版本控制！



## MVCC（Multi-Version Concurrent Control ）多版本并发控制

​		多版本并发控制，是什么意思呢？关键字：版本控制，我们在进行查询的时候是有版本的，后续在同一个事务里查询的时候，我都是查询我们使用的版本。

<font color='red'>那么MVCC 是怎么实现的呢？</font>

​		首先，每个事务都有1个事务ID，并且是递增的，这个大家首先要知道的，因为后面的MVCC原理都是基于它来的！！

​		**<font color='red'>比如说嘛，快照，你10岁20岁30岁40岁去照相，你只能看到你之前照相的模样，但是不能看到你未来的模样。</font>**

<font color='red'>效果：建立一个快照，同一个事务无论查询多少次都相同的数据。</font>

一个事务能看到的数据版本：

1. 第一次查询之前已经提交的事务修改
2. 本事务的修改

一个事务不能看得见的版本

1. 在本事务第一次查询之后创建的事务（事务ID比我的事务ID大）
2. 活跃（未提交）事务的修改



<font color='red'>然后我们从每行数据的隐藏列讲起：InnoDB会在每行的后面都添加3个隐藏字段。</font>

#### 隐式字段：

**<font color='red'>打开XMID 数据库表中每行记录中的隐式字段</font>** ,

再打开 processOn https://www.processon.com/diagraming/62480e370e3e74078d635ebe



DB_TRX_ID：表示最近一次对本记录做修改/插入的事务ID。

DB_ROLL_PTR：回滚指针，指向当前记录行的undo log 信息

DB_ROW_ID：随着新行插入而单调递增的行ID。



<font color='red'>我们刚刚不是讲了快照吗，这个快照是怎么建立的呢？</font>

#### ReadView（读视图） 结构

####  		什么是ReadView，事务进行`快照读、当前读`操作的时候，产生一个读视图，在事务执行读的一刻，生成数据库系统当前的一个快照，记录并且维护系统当前活跃事务ID。

(当每个事务开启时，都会被分配一个ID, 这个ID是递增的，所以最新的事务，ID值越大)



这里解释一下，什么是快照读：

普通读的执行方式是生成 ReadView，直接利用 **MVCC** 机制来进行读取，并不会对记录进行加锁

当前读**对读取的记录加锁, 阻塞其他事务同时改动相同****记录****，避免出现安全问题**。

```sql
　　select...lock in share mode (共享读锁)
　　select...for update
　　update , delete , insert
　　#当前读的实现方式：next-key锁(行记录锁+Gap间隙锁) 这个后面会讲到
```



trx_ids：记录了当前正在活跃的事务ID数组，也就是没有提交的事务ID数组集合

min_trx_id：当前正在活跃的事务ID最小的那个事务ID

max_trx_id：下一个即将分配事务的ID，就是当前活跃的最大提交事务ID+1



**<font color='red'>打开XMIND MVCC Read View 读视图</font>**



**<font color='red'>打开Navicat</font>** 根据时间节点 演示 事务A B C 的过程 

总结：

 T1：

Transaction A-Time-1 在时间节点 T1 开启一个事务然后插入两条数据，尚未提交，这个时候Transaction A的事务ID是最小的活动事务ID，

T2:

在时间节点T2 Transaction B-Time-2 开启一个事务，查询Transaction A 事务提交的数据是没办法查询到 A事务插入的数据的，因为事务A虽然插入了数据但是没有提交，这个情况也就是，min_trx_id<trx_id<max_trx_id。但是不确定提没提交，判断有没有提交，直接可以根据活跃的事务列表 trx_ids判断，这种情况是不可见的。

T3:

Transaction A-Time-3 提交事务。

T4:

在时间节点T4 Transaction  C-Time-4 开启一个事务，这个时候 TransactionA已经提交了事务，那么就不在我们的活动事务的IDS数组里，这种情况表里行的TRX_ID被更改为 TransactionA的事务ID了，TRX_ID 不在我们的TRX_IDS中，所以Transaction  C是能够查询到的。

然后Transaction  C 修改数据以及插入新数据，为了模拟脏读和幻读。插入数据后，我们不提交，我们在Transaction  C中是可以查询到我们刚刚插入的数据的，也就是 trx_id = creator_trx_id ，这个能理解吗。OK

T5:

回到我们的 Transaction B 我们再去查，你会发现，仍然读取不到Transaction  C的数据，为什么？他是这种情况

trx_id >=max_trx_id所以也不可见。



#### RC与RR Read View的区别

RR中的ReadView是事务第一次查询的时候建立的，不管你读取多少次，trx_id min_id max_id都是不变的。

RC中的ReadView是事务每次查询的时候建立的。

所以，我们也可以来演示一下。



#### Read View 判断规则

从数据的最早版本开始判断（undo log）

数据版本的trx_id = creator_trx_id，本事务修改，可以访问。

数据版本的trx_id < min_trx_id （未提交事务的最小ID），说明这个版本在生成ReadView已经提交，可以访问

数据版本的trx_id >= max_trx_id（下一个事务ID），这个版本是生成ReadView之后才开启的事务建立的，无法访问。

数据版本的trx_id在min_trx_id和max_trx_id之间，看看是否在m_ids中。如果在，不可以。如果不在，可以。



如果当前版本不可见，就找undo log链中的上一个版本。

打开ProcessOn

https://www.processon.com/diagraming/62480e370e3e74078d635ebe

​		这个整个mvcc的逻辑就是我们经常说的快照读，但是，我们发现一个问题，快照读只发生在普通的select时候，但是当我们update的时候，如果用快照读是不是就有问题，可能导致我们其他事务修改的数据丢失！！！

所以，mysql得解决这个问题！！

来，我给大家举个例子！！！

**<font color='red'>打开Navicat 快照读会出现的问题</font>**



​		我们发现，如果只有mvcc的话是不行的，会导致添加修改数据的丢失，所以，mvcc适用于在查询的时候，能提供很高的性能，但是我们的事务肯定不是只用来读的！！为了保证数据不丢失！！我肯定得去拿最新的数据的！！

就像我刚才给大家举的例子！！这个又叫当前读的概念，要读到最新的数据！！！

那么在修改数据的时候怎么保证多个事务不一起更改数据呢！！！那么这个方式大家应该都猜到了，就是锁并发控制！！！！

就是我在事务A里面操作数据1，那么在事务A提交之前，这条数据是锁死的！！其他的事务都不能更改这条数据！！！



## MVCC解决了什么问题：

 

数据库并发场景有三种，分别为:
1、读读: 不存在任何问题,也不需要并发控制
2、读写: 有线程安全问题，可能会造成事务隔离性问题，可能遇到脏读、幻读、不可重复读。

3、写写: 有线程安全问题,可能存在更新丢失问题。



MVCC是一种用来解决读写冲突的无锁并发控制，也就是为事务分配单项增长的时间戳，为每个修改保存一个版本，版本与事务时间戳关联．读操作只读该事务开始前的数据库的快照，所以MVCC可以为数据库解决一下问题:
1、在并发读写数据库时，可以做到在读操作时不用阻塞写操作，写操作也不用阻塞读操作，提高了数据库并发读写的性能

2、解决脏读、幻读、不可重复读等事务隔离问题，但是不能解决更新丢失问题。



<font color='red'>那么更新丢失的问题是通过什么解决的呢？</font>



#### 当前事务修改，还是会读到最新数据（一致读取）

https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html

## LBCC（Lock-Based Concurrent Control） 锁并发控制



https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html

https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html#innodb-shared-exclusive-locks





数据库的锁大家应该也都听过，<span style="color:red">大家知道哪些mysql锁！</span>

我们不一个一个讲，但是可以给大家整理下，给大家复习下，mysql锁我们要分几个不同的维度去分析

粒度：表锁 行锁 页锁

类型：共享 排它 意向共享、意向排它

用户：乐观锁 悲观锁

算法：记录锁 临键锁 间隙锁



那么我们简单给大家分析下各种锁，首先，最简单的锁类型，共享与排他!!这个平时也是大家用得最多的行级锁！加锁防止并发！

接下来共享与排他锁，我就给大家举2个例子！！

#### 共享锁（Shared Locks）

我们发现加上共享锁后，其他事务时不能写跟操作的，但是能加共享锁，所以共享锁也叫读锁！！

**<font color='red'>打开Navicat，演示共享锁</font>** 



#### 排它锁 Exclusive Locks

另外一个行级锁就是排他锁（Exclusive Locks,它锁的加锁方式有两种，第一种是自动加排他锁，可能是同学们没有注意到的：

我们在操作数据的时候，包括增删改，都会默认加上一个排它锁。这个也是为什么说我们数据库修改本来就自带锁，你们update数据的时候不用去担心并发的原因！！

还有一种是手工加锁，我们用一个FOR UPDATE给一行数据加上一个排它锁！

所以，排他锁，我们在开发的时候是肯定会用到的！！我们也简单演示下

**<font color='red'>打开Navicat，演示排它锁</font>** 



<span style="color:red">我们也可以通过show STATUS LIKE 'innodb_row_lock%' 查看行锁被锁的情况</span>



所以，我们发现，共享锁加了后就不能排他加锁，与排他锁是互斥的！！





那么行级锁的原理我简单给大家说下！！<span style="color:red">大家知道行锁锁住的是什么么！！！</span>

我们看似共享和排他锁住的都是行，但是其实不是锁住行，锁住的是索引！！！<span style="color:red">举例，用student_name查询，锁住的是整个表</span>



我们发现，如果根据非索引字段查询加锁后，会把整个表给锁掉！！



<font color='red'>1、为什么表里面没有索引的时候，锁住一行数据会导致锁表？</font>

或者说，如果锁住的是索引，一张表没有索引怎么办？

所以，一张表有没有可能没有索引？

1）如果我们定义了主键(PRIMARY KEY)，那么 InnoDB 会选择主键作为聚集索引。

2）如果没有显式定义主键，则 InnoDB 会选择第一个不包含有 NULL 值的唯一索引作为主键索引。

3）如果也没有这样的唯一索引，则 InnoDB 会选择内置 6 字节长的 ROWID 作为隐藏的聚集索引，它会随着行记录的写入而主键递增。

所以，为什么锁表，是因为查询没有使用索引，会进行全表扫描，然后把每一个隐藏的聚集索引都锁住了。



<font color='red'>2、为什么通过唯一索引给数据行加锁，主键索引也会被锁住？</font>

大家还记得在InnoDB里面，当我们使用辅助索引的时候有一个回表动作，它是怎么检索数据的吗？辅助索引的叶子节点存储的是什么内容？

在辅助索引里面，索引存储的是二级索引和主键的值。比如name=4，存储的是name的索引和主键id的值4。

而主键索引里面除了索引之外，还存储了完整的数据。所以我们通过辅助索引锁定一行数据的时候，它跟我们检索数据的步骤是一样的，会通过主键值找到主键索引，然后也锁定。



#### 记录锁（Record lock ）

如果我们用我们的索引去查的时候，我们会发现锁定的只是我们查询出来的那条数据！！！！

会话1

```sql
# show STATUS LIKE 'innodb_row_lock%'   可以查看行锁的状态
# 关闭自动提交
SET SESSION autocommit = 0;
# Transaction 3
# 查看自动提交  -- 查询自动提交是否开启
show session  VARIABLES like 'autocommit'; 

#记录锁（Record lock ）
BEGIN;
SELECT * FROM BANK_CMBC WHERE ID = 1 FOR UPDATE;

# 打开窗口2
END;

```

会话2

```sql
# show STATUS LIKE 'innodb_row_lock%'   可以查看行锁的状态
# 关闭自动提交
SET SESSION autocommit = 0;
# Transaction 3
# 查看自动提交  -- 查询自动提交是否开启
show session  VARIABLES like 'autocommit'; 

# 记录锁（Record lock)
# 当我们用索引去查的时候，我们会发现锁定的只是我们查询出来的数据
BEGIN;
# 会锁住ID=1的数据，但是不会锁住其他数据
UPDATE BANK_CMBC SET BALANCE = BALANCE - 100000 WHERE ID = 1;

# UPDATE BANK_CMBC SET BALANCE = BALANCE - 100000 WHERE ID = 2;
COMMIT;
```

我们发现，当我查询出来的数据，加锁后，是都会锁住的，那么这个就是我们的记录锁算法！！！锁住单条数据！！！！那么这个锁算法在RC跟RR的情况下都有！！！



#### 间隙锁（Gap lock）

但是我们来看一个情况！！！

假如，我查询的不是单条数据！！！我查询了不存在的范围或者数据

```mysql
BEGIN;
# 锁定 （10,30] 一个左开右闭的空间
SELECT * FROM BANK_CMBC WHERE ID > 11 AND ID < 15 FOR UPDATE;
# 锁定 (-无穷大,1]
SELECT * FROM BANK_CMBC WHERE ID < 1 FOR UPDATE;
COMMIT;
```

那么这个时候会怎么加锁呢！！！！给大家举几个例子

```mysql
# 间隙锁
BEGIN;
# 不是范围查询时候，左开右开
SELECT * FROM BANK_CMBC WHERE ID = -1 FOR UPDATE;

# 添加都加锁
INSERT INTO BANK_CMBC(id,user_name,balance,remark) 
VALUES(16,'令狐冲啊',100000.00,''); 
 
SELECT * FROM BANK_CMBC WHERE ID = 11 FOR UPDATE;
SELECT * FROM BANK_CMBC WHERE ID = 12 FOR UPDATE;
SELECT * FROM BANK_CMBC WHERE ID = 13 FOR UPDATE;
SELECT * FROM BANK_CMBC WHERE ID = 14 FOR UPDATE;
SELECT * FROM BANK_CMBC WHERE ID = 15 FOR UPDATE;

INSERT INTO BANK_CMBC(id,user_name,balance,remark) 
VALUES(11,'令狐冲啊',100000.00,''); 
INSERT INTO BANK_CMBC(id,user_name,balance,remark) 
VALUES(15,'令狐冲啊',100000.00,''); 
INSERT INTO BANK_CMBC(id,user_name,balance,remark) 
VALUES(19,'令狐冲啊',100000.00,''); 

COMMIT;
 

```

那么我们是不是可以整理下！！！当我们查询的记录不存在，并且索引查询的这个范围在我们的2个索引数据中间，就会把这个整个区间的insert锁住！！！Update 是不受影响的 ,这个怎么理解?

2个索引数据中间，那么我们还是以刚刚那个例子为例，我们是不是把已有的数据都分成区间，我们的查询是基于student_no！！那么我们可以分成这样的区间

https://www.processon.com/view/link/5fd330905653bb06f336f4f1

只要我的查询条件落在了这个区间，那么就会锁住整个区间！！！

比如

```mysq
SELECT * FROM BANK_CMBC where ID < 12 and ID >3 FOR UPDATE;   //来告诉我，会锁住哪个区间！！(3,14)
```

但是记住，它只会在锁不存在的insert,修改删除不存在的数据是不会锁的！！！

对，那么这种锁住区间间隙的，就叫做间隙锁，那么整个锁，只有在RR的隔离级别才会存在！！！欸，我们的RR刚才讲了，innoDB它会解决幻读的问题！！那么在锁并发控制下面，就是基于间隙锁算法实现的!!!

#### 临键锁（Next-Key Lock）

那么，老师老师，刚才讲的一个是只查询到了我表里面已有的数据，一个是我只查询我不存在的区间数据加锁，那么如果我查询的语句里，不仅仅命中了Record记录，还包含了间隙，那么它到底是怎么加锁的呢！！！！

其实，当出现这样的情况，那么简单嘛，既然你又查询到数据，又包含了区间，那么就记录锁跟间隙锁一起用呗！！！！

来，大家看例子！！

```mysql
BEGIN;

select * FROM student  WHERE student_no>15 AND  student_no<=23 FOR UPDATE ;  锁定  （14，23]和 （23,35]  中间内的数据，锁定左开右闭的区间，范围包含临界点23，所以，锁定下一个区间

select * FROM student  WHERE student_no>37 FOR UPDATE ;   锁定  （35,55] 和（55，+∞）；因为范围包含了临界点55，所以，锁定下一区间（55，+∞）

select * FROM student  WHERE student_no>15 AND  student_no<35 FOR UPDATE ;  锁定   （14，23] 和（23,35]  范围没有包含临界点35，不会锁下一个左开右闭区间

select * FROM student  WHERE  student_no>=35 AND student_no<55 FOR UPDATE;  记录锁锁定35，间隙锁锁定(35,55]，不会锁定55之后的数据，没有包含临界点55
COMMIT;
```

那么，这种情况mysql里面有个专门的名词，叫做临键锁（Next-Key Lock），它是MySQL里面默认的行锁算法，相当于记录锁加上间隙锁。

唯一性索引，等值查询匹配到一条记录的时候，退化成记录锁。

没有匹配到任何记录的时候，退化成间隙锁。但是有1个点不一样！！！但是跟间隙锁有点不一样！！

当范围包含临界点的时候，则会锁定下一个左开右闭区间！！不然不会锁定下一个区间,那么这个可能也是临键锁的一个由来！！！

#### 为什么要锁定下一个区间

​		因为索引是可能有重复的数据的，假如我这个是23，那么我前面跟后面都可能是23，所以才锁定前面跟后面的区间





### 怎么查看锁信息

#### 查看已加锁信息

```mysql
SELECT * from  performance_schema.data_locks   -- 查看数据锁信息
```

在Mysql8.0.1之前 INFORMATION_SCHEMA.INNODB_LOCKS 但是后面已经被移除

官网说明：https://dev.mysql.com/doc/refman/8.0/en/performance-schema-data-locks-table.html

```sql
SELECT * FROM INFORMATION_SCHEMA.INNODB_LOCKS 
```





#### 查看事务锁等待

##### 查看innodb_lock_waits

8.1之后查看锁的信息 与 之前的版本有所变更，在之前的版本主要在INFORMATION_SCHEMA.INNODB_LOCKS和INNODB_LOCK_WAITS2个表中，老版本的查看：https://dev.mysql.com/doc/refman/5.7/en/innodb-information-schema-examples.html

例如：

session1：

```mysql
BEGIN;
SELECT * FROM gp_teacher where id>4 and id<6 FOR UPDATE;   -- 给数据加上4到10的间隙锁

COMMIT;

```



session2 :

```mysql
INSERT INTO gp_teacher(id,teacher_name,teacher_age,teacher_addr) VALUES(5,'景天',30,'湖南');  -- id=5在加锁区间，会进行阻塞
  
```



官网地址：https://dev.mysql.com/doc/refman/8.0/en/innodb-information-schema-examples.html?spm=a2c4g.11186623.0.0.1f013e3a7QfUoL

查看哪些事务在阻塞、哪些在等待：

###### 8.0 版本

```mysql
SELECT
  r.trx_id waiting_trx_id,
  r.trx_mysql_thread_id waiting_thread,
  r.trx_query waiting_query,
  b.trx_id blocking_trx_id,
  b.trx_mysql_thread_id blocking_thread,
  b.trx_query blocking_query
FROM       performance_schema.data_lock_waits w
INNER JOIN information_schema.innodb_trx b
  ON b.trx_id = w.blocking_engine_transaction_id
INNER JOIN information_schema.innodb_trx r
  ON r.trx_id = w.requesting_engine_transaction_id;
```



或者简单的使用

```mysql
SELECT
  waiting_trx_id,
  waiting_pid,
  waiting_query,
  blocking_trx_id,
  blocking_pid,
  blocking_query
FROM sys.innodb_lock_waits;
```



得到结果：

![image-20230131151404672](令狐老师-MySQL专题-MySQL事务 - 副本.assets/image-20230131151404672.png)



###### 5.7 版本

```sql
SELECT
  r.trx_id waiting_trx_id,
  r.trx_mysql_thread_id waiting_thread,
  r.trx_query waiting_query,
  b.trx_id blocking_trx_id,
  b.trx_mysql_thread_id blocking_thread,
  b.trx_query blocking_query
FROM       information_schema.innodb_lock_waits w
INNER JOIN information_schema.innodb_trx b
  ON b.trx_id = w.blocking_trx_id
INNER JOIN information_schema.innodb_trx r
  ON r.trx_id = w.requesting_trx_id;
```



找不到blocking的语句？去官网：https://dev.mysql.com/doc/refman/8.0/en/innodb-information-schema-examples.html#innodb-information-schema-examples-null-blocking-query

1.根据blocking_pid 查询threads

```mysql
SELECT THREAD_ID FROM performance_schema.threads WHERE PROCESSLIST_ID =105;
```



2.根据THREAD_ID查询历史事件events_statements_history

```mysql
SELECT THREAD_ID, SQL_TEXT  FROM performance_schema.events_statements_history
WHERE THREAD_ID = 163 ORDER BY EVENT_ID;
```



##### 通过事务状态来查看

1.查看事务信息

```mysql
SELECT * FROM information_schema.INNODB_TRX;
```

![image-20230412165606547](令狐老师-MySQL专题-MySQL事务 - 副本.assets/image-20230412165606547.png)

2.可以得到在等到的lock_id，然后去

```mysql
SELECT * FROM performance_schema.data_lock_waits WHERE  REQUESTING_ENGINE_LOCK_ID='139747822368336:4:4:11:139747834005856'
```



3.会得到BLOCKING_THREAD_ID，比如2879



4.查询events_statements_history

 ```mysql
SELECT THREAD_ID, SQL_TEXT FROM performance_schema.events_statements_history
WHERE THREAD_ID = 2879 ORDER BY EVENT_ID DESC;
 ```

![image-20230412171857094](令狐老师-MySQL专题-MySQL事务 - 副本.assets/image-20230412171857094.png)

大概能找到导致锁的语句。

#### 行锁等待时间

```mysql
SELECT @@innodb_lock_wait_timeout;
```

官网地址：https://dev.mysql.com/doc/refman/8.0/en/innodb-parameters.html#sysvar_innodb_lock_wait_timeout

单位s，默认50s。最小1s

举例：

会话一：

```mysql
BEGIN;
UPDATE gp_teacher  SET  teacher_age=teacher_age+1 where id=1;  -- 开启事务不提交  占有行锁id=1
```





会话二：

```mysql
set innodb_lock_wait_timeout=10;  -- 修改会话等待行锁的时间为10s


BEGIN;
UPDATE gp_teacher  SET  teacher_age=teacher_age+1 where id=1;  --  修改行锁数据，超过10s会报错
```

![image-20230412150044117](令狐老师-MySQL专题-MySQL事务 - 副本.assets/image-20230412150044117.png)













## 死锁

**死锁产生的原因**

打开文件：https://www.processon.com/mindmap/62655ae0f346fb516ee09a98

![MySQL 死锁产生的原因](令狐老师-MySQL专题-MySQL事务.assets/MySQL 死锁产生的原因.png)

- 互斥条件
  - 某个资源被一个线程占用，此时如果其他线程请求该资源，那么需要等待。
- 不可剥夺
  - 某个线程获得一个资源，在使用完毕之前，不能被其他线程强行夺走，只能由获得资源的线程主动释放。
- 请求与保持
  - 线程A1已经获取了一个资源R1，又请求了其他资源R2，但是请求的资源被其他线程持A2持有，
    此时请求的进程A1就会阻塞，并且不会释放已经获得的资源。
- 循环等待
  - 线程之间相互等待，同时各自占有下一个线程所需要的资源。
    假如有A、B、C三个线程，A请求的资源被B占用，B请求的资源被C占用，
    C请求的资源被A占用



**<font color='cornflowerblue'>打开Navicat </font>**

演示---- MySQL 死锁场景



官方处理死锁的：https://dev.mysql.com/doc/refman/5.6/en/innodb-deadlocks-handling.html

打开文件：https://www.processon.com/mindmap/62655d7b0e3e745194e1655b

![处理死锁的方法](令狐老师-MySQL专题-MySQL事务.assets/处理死锁的方法.png)

**处理死锁的方法**

- 预防死锁
  - 提前破坏死锁的必要条件中的一个或者多个
- 避免死锁
  - 使用某种策略，避免死锁出现
    - 尽可能使用低的事务隔离级别
    - 尽量让数据表中的数据检索或者更新通过索引完成，
      避免锁失效导致行锁升级为表锁。
    - 合理设计索引，尽量保持锁的粒度不要过大
    - 减少查询条件的范围，尽量避免间隙锁和范围
    - 控制一次事务大小，减少所需的资源数量，缩短锁定的时间
    - 如果一个SQL语句涉及加锁操作，尽量把他放在整个事务之后执行
    - 实际开发中，通常采用有序资源分配法和银行家算法这两种方式来避免死锁
- 检测死锁
  - 利用命令 SHOW ENGINE INNODB STATUS \G;查看死锁原因
  - 开启死锁监测日志 show variables like 'innodb_print_all_deadlocks';
    收集所有死锁日志。set global innodb_print_all_deadlocks = ON;
  - MySQL 5.7之后是默认有死锁监测，会把死锁的事务直接回滚掉
- 解除死锁
  - 采用适当的策略和方法将进程从死锁状态解脱出来
    - 补偿机制
    - 等待超时
    - 手动解除（禁用）

​					





# 五、课后总结（5分钟）

事务是什么，事务的语法

事务的四大特性

事务并发带了的问题

如何实现MySQL的隔离级别

MVCC 读 快照读

LBCC 写 当前读

死锁怎么解决



# 六、下次预告（5分钟）

下周MySQL专题结课