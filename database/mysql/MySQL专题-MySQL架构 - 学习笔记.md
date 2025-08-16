# MySQL专题

># MySQL架构与执行流程、InnDB内存结构



 



## 我的格言

只要你相信自己，没有什么是不可能的。

**互动看弹幕**



# 前言

## **为什么要学，学完MySQL专题，你能得到什么？**（3mins）

正所谓，一千个读者就有一千个哈姆雷特。一千个程序员有一千个问题，这些问题不可能都由别人去帮你解决，所以你需要具备什么能力：

**分析问题能力**

**解决问题能力**

怎么才能做到知己知彼，百战百胜呢？我们需要对一个事情非常了解，成竹在胸才能做到庖丁解牛，才能打仗，打胜仗！



## 学完这节课你能得到什么？

面试会问，那么学完，在P6这个级别的MySQL面试题，你能自己回答，提供理论基础。

为我们明天索引的数据结构的形成，索引的优化，索引失效的场景，打下坚实的基础。

为我们后天讲事务与锁打下坚实的基础。



你可以学习到，解决我们MySQL在生产环境遇到的常见问题，如果你想要解决我们生产环境遇到的问题，那么你就得了解一个SQL语句的执行流程，这样你才能具体问题具体分析。

你可以学习到，如何去优化我们的SQL语句，想要优化SQL语句那么你得知道优化什么，一般来说其实就是命中索引，提升查询效率。

你可以得到，比如我们在一条SQL语句，执行了是通过什么保证我们数据安全，比如你银行卡，转账、银行卡上扣除了10W，但是发现支付失败了，然后钱还不见，这种情况，怎么去避免？

你可以得到，比如说我数据库发生死锁，我们怎么去解决？



<font color='red'>**那么我们怎么去学？**</font>



# 一、课程安排

**第一天 ：mysql架构与执行流程、InnoDB内存结构**

**第二天：MySql索引结构以及由来、索引优化**

**第三天：Mysql的事务与锁**





# 二、今日教学目标

**一、掌握MySQL一条sql的执行流程**

**二、掌握InnoDB内存结构，以及InnoDB存储执行流程**

**三、掌握InnoDB 2大事务日志，以及binlog 日志**





# 三、MySQL架构与执行流程，教学过程（90min）



## **3.1MySQL 简史聊一聊（1min)**

<font color='cornflowerblue'>打开文件：</font>

MySQL 简史.png



![MySQL 简史](令狐老师-MySQL专题-MySQL架构 - 副本.assets/MySQL 简史.png)



## 3.2 <font color='red'>我们回顾一下在Java中使用MySQL需要怎么做</font>

比如使用JDBC需要几个步骤：

> 打开IDEA 展示JDBC中使用MySQL

1、加载jdbc驱动程序；

2、创建数据库的连接；

3、创建preparedStatement [prɪˈpeəd]   [ˈsteɪtmənt]；

4、执行SQL语句；

5、遍历结果集；

6、处理异常，关闭JDBC对象资源。



<font color='cornflowerblue'>好，我们画个图 打开 processOn：</font>

> jdbc 中使用MySQL的流程

https://www.processon.com/view/link/6267b3045653bb498e32c0b2



**也就是说，一条语句在执行之前是需要 <font color='red'>创建连接的</font>，那，在MySQL中，客户端与服务端如何建立连接呢？**

> MySQL通信协议TCP/IP连接，其实还有Unix Socket、Share Memory、Named Pipes
>
> MySQL通信方式是半双工的，因为我们通信方式是半双工的，所以我们的SQL执行之后只能等待服务端的返回，如果SQL执行效率过低，会延缓查询时间，降低系统的吞吐量。我们要对SQL进行优化也是这个原因。
>
> MySQL通信类型是同步的，我们执行完SQL是不是需要结果集等待返回。
>
> MySQL的连接方式，是长连接。
>
> 
>
> **半双工**
>
> 双端能互相通信，但是不能同时通信叫**<font color='red'>半双工</font>**（一个时间段内只有一个动作发生）。
>
> 举个简单例子，一条窄窄的马路，同时只能有一辆车通过，当目前有两辆车对开，这种情况下就只能一辆先过，等到头儿后另一辆再开，这个例子就形象的说明了半双工的原理。
>
> 因为我们通信方式是半双工的，所以我们的SQL执行之后只能等待服务端的返回，如果SQL执行效率过低，会延缓查询时间，降低系统的吞吐量。我们要对SQL进行优化也是这个原因。

<font color='red'>打开Navicat，MySQL第一课之一条SQL执行流程和InnoDB架构 查询</font>



一条语句在执行之前是需要 <font color='red'>**创建连接的**</font>，<font color='red'>需要建立连接，那么在MySQL中肯定是有一个地方能够帮我们管理连接，和创建连接的是吧?</font>

## 3.3MySQL客户端和服务器通讯，需要在连接层建立连接

​		MySQL单个客户端跟服务器的通讯在任何一个时刻，都是不能同时发生的，要么客户端向服务器发送数据，要么服务器向客户端发送数据！我们知道，当一个查询语句提交给服务器后，你是不能做其他事情的，只能等待结果，这也是为什么要进行sql语句优化，影响性能。

```sql
# 我们可以通过下面语句了解我们的线程状态
# 官网有响应的状态：如果我们需要了解可以对照官网文档一起看。
# https://dev.mysql.com/doc/refman/5.6/en/general-thread-states.html
show full processlist;

# 关闭自动提交
SET SESSION autocommit = 0;

# 查看自动提交  -- 查询自动提交是否开启
show session  VARIABLES like 'autocommit'; # Transaction 1

# 我执行一条SQL语句是需要等待结果集返回的
SELECT * FROM INNODB_USER;

# 现在我查询慢怎么解决？
# 有的同学说加索引，
SELECT * FROM INNODB_USER;

# OK,假设 我们现在加了索引
SELECT * FROM INNODB_USER LIMIT 0 , 10;

# 我现在要更新一条SQL，一直运行，但是没有返回，
# 这种情况，怎么解决？
SELECT * FROM INNODB_USER WHERE ID = 1 for update;
```

我们创建完连接，那么我们是需要<font color='red'>执行一条SQL语句</font>嘛，那么SQL语句是一个语言，是一个语言意味着我必须要解析SQL，否则程序是无法明白你在说什么，要做什么，在MySQL有一个服务层来处理，他们怎么处理呢，我们去看...

## 3.4 MySQL服务层 

### 3.4.1查询缓存（mysql8已废除）

该步骤只有查询语句才会有，它是以查询语句，并且大小写敏感的的哈希值查找实现的，只要多一个字符，哪怕是空格，或者大小写不完全一致，就不会走到查询缓存！并且包含不确定的函数也不会缓存，比如now()

如果查询命中缓存，后续的流程都不会走，但是因为不好用，因为是根据sql语句完成相同才会有用，所以使用场景有局限性，mysql8已经废除此功能

### 3.4.2解析器

​		这一步主要就是对语句基于SQL语法进行 词法和语法分析   还有  语义分析。

#### 3.4.2.1词法分析

##### **<font color='cornflowerblue'>打开 Data Grid 、Navicat 执行下面的语句啊，增加互动和展示 </font>**

```sql
select * from `INNODB_USER` where user_name = '令狐冲';
```

  这段SQL会被打散为8个符号，每个符号的类型，起始的位置。



**打开Xmind 流程图**：**<font color='red'>SELECT 语句解析树</font>** 

SELECT 语句解析树.xmind



#### 3.4.2.2语法分析

​		进行语法解析，判断输入的这个 SQL 语句是否满足 MySQL 语法。然后生成下面这样一颗语法树：

![](令狐老师-MySQL专题-MySQL架构.assets/SELECT 语句 解析树.png)



检查红色的关键词语法，如果语法不对，会报错，但是不会去检查相关表名，列名是否正确！

#### 3.4.2.3 语义分析：

在语义分析阶段，MySQL的SQL解析器会对SQL语句的语义进行检查。这一阶段的任务包括对表和列名进行解析，检查SQL语句的语义正确性，并将SQL语句转换为适当的内部数据结构。

它会检查表和列名是否存在，检查名字和别名，保证没有歧义。







### 3.4.3 预处理器（非必要）

什么是预处理，以我们的工作场景为例，一个查询接口，sql语句都是一样的，但是每次查询的参数都不一样。所以我们想只需要变更参数部分就行。

那么，我们就是在拼接sql语句的时候，将用户的输入跟语句拼接成一个sql语句给到mysql执行。

但是会发生一个sql注入问题

**什么是sql注入**

因为参数是客户端传过来的，所以可以传任何值，那么就有可能传入任何值  就有了sql注入问题

##### **sql注入**

```mysql
select * from product where product_name='$name'  -- 假如在java程序里 product_name是通过用户传进来的值拼接的
```

传入参数

```mysql
' OR 1=1 -- 
```

那么最终解析的sql

```mysql
select * from product_new where product_name='' OR 1=1 -- '  -- 我们发现跟我想要的不一样   会查询出很多数据 如果是用户密码或者登陆，那么权限相当于没有
```

 

sql注入是因为客户端拼接用户传入的参数，然后拼接好语句给到mysql，这样会导致会安全问题。



那么能不能把这个参数化的事情交给Mysql自己做呢？当然可以，这个就是预处理。

如果你需要参数化，你只要告诉Mysql，传一个预处理语句就行，Mysql会将参数与语句编译分开。



##### **预处理操作解决sql注入**

官网地址：https://dev.mysql.com/doc/refman/8.0/en/sql-prepared-statements.html

预处理demo，防止sql注入

```mysql
prepare pre_product from 'select * from gp_teacher where id=? and teacher_age=?';  
set @id=10;
set @teacher_age=34;
execute pre_product using @id,@teacher_age;

set @id=10;
set @teacher_age=34;
execute pre_product using @id,@teacher_age;

set @id=10;
set @teacher_age=34;
execute pre_product using @id,@teacher_age;  -- 执行预便宜语句

drop prepare pre_product;
```



MySQL 8.0 提供了对服务器端准备语句的支持。这种支持利用了高效的客户端/服务器二进制协议。使用带有参数值占位符的预准备语句具有以下好处：

- 每次执行语句时解析语句的开销更少。通常，数据库应用程序处理大量几乎相同的语句，仅更改`WHERE`查询和删除、`SET`更新和 `VALUES`插入等子句中的文字或变量值。
- 防止 SQL 注入攻击。参数值可以包含未转义的 SQL 引号和定界符。



比如我们经常被问的Mybatis里面#跟$符号的区别，$符号就会去解析变成参数，然后进行预处理，能防止sql注入，并且必须传入参数

源码：
SqlSourceBuilder的构造方法中会去解析

![image-20230404174009234](令狐老师-MySQL专题-MySQL架构 - 副本.assets/image-20230404174009234.png)



并且最后会解析成？号

![image-20230510175530053](令狐老师-MySQL专题-MySQL架构 - 副本.assets/image-20230510175530053.png)



### 3.4.4优化器

根据上面的流程，我们知道要去执行什么语句；但是具体怎么执行会有很多的方式，比如走哪个索引，你的语句是不是可以优化。

做哪些优化，哪种执行方式、路径更快，通过全局变量 `optimizer_switch`来决定，具体参数如下：

```mysql
SELECT  @@GLOBAL.optimizer_switch;
```

查询结果：

![image-20230403222422151](令狐老师-MySQL专题-MySQL架构 - 副本.assets/image-20230403222422151.png)

优化器说明：https://dev.mysql.com/doc/refman/8.0/en/optimizer-hints.html，里面包含了每个优化选项说明

优化方式官网地址：https://dev.mysql.com/doc/refman/8.0/en/optimization.html；这个里面就有很多优化器的实践，比如优化sql语句等等。

优化后会生成一个最终的执行计划，所以这个语句到底怎么走，优化器来决定。



​		查询优化器（Query Optimizer)与查询执行计划。 

​		当上述步骤完成，则sql语句认为是合法并且是可执行的，并且可以有很多的执行方式，并且返回相同的结果，优化器会把一条sql语句转化成执行计划，并且找到其中最好的执行计划！



MySQL的优化器能处理哪些优化类型呢？

举两个简单的例子：

1、当我们对多张表进行关联查询的时候，以哪个表的数据作为基准表。

2、有多个索引可以使用的时候，选择哪个索引。

3、子查询优化，SQL子句顺序。

实际上，对于每一种数据库来说，优化器的模块都是必不可少的，通过复杂的算法实现尽可能优化查询效率的目标。

到此我们就得到了一个执行计划，是不是要交给执行器



### 3.4.5执行器（Query Execution Engine）

  执行器利用存储引擎提供的相关API来完成操作，并且把数据返回给客户端。



## 3.5 存储引擎层

​		存储引擎就是我们的数据真正存放的地方。

**简单总结** MySQL Server层

打开 processOn 一条SQL执行流程三层架构-泳图

 https://www.processon.com/view/link/6267b8dfe0b34d4baedc27d0



**<span style="color:red">我们发现里面最重要的就是存储引擎，因为它是真正存储数据的地方，也是重点需要掌握的点</span>**

 什么是

### 3.5.1存储引擎的数据结构  (5min)

​		顾名思义，存储数据的引擎，存储引擎就是我们的数据真正存放的地方，存储引擎包含了**存储方式、存储结构、检索方式**等.....

​		这个大家都可以理解为我们文件的格式，虽然内容是一样的，但是存储的文件方式可以有很多，就像我们文本数据信息，我们可以存储.txt，也可以存储为.sql，也可以存储为.js，也可以是md! 只是存储方式不一样，在格式，大小，速度方面有不同！

​		那既然文件都有这么多种方式，我们存储引擎也会有多种啊，我们也需要了解一下我们的存储引擎的模块。



可以通过语句查询当前服务器支持哪些存储引擎：

```mysql
SHOW ENGINES;  -- 查询当前服务器支持的存储引擎
```



**而整个流程中，我们最需要知道的是存储引擎这块，也是面试官问得最多的！**

官方地址：https://dev.mysql.com/doc/refman/8.0/en/storage-engines.html 

讲了Mysql的各大引擎以及特征，其中最重要的就是MyISAM跟InnoDB。

<font color='red'>**面试题：MyISAM跟InnoDB存储引擎的区别？ **</font>

- [`MyISAM`](https://dev.mysql.com/doc/refman/8.0/en/myisam-storage-engine.html)：这些表占用空间小。 [表级锁定](https://dev.mysql.com/doc/refman/8.0/en/glossary.html#glos_table_lock) 限制了读/写工作负载的性能，因此它通常用于 Web 和数据仓库配置中的只读或以读取为主的工作负载。
- `InnoDB`：是用于 MySQL 的事务安全（符合 ACID）存储引擎，具有提交、回滚和崩溃恢复功能以保护用户数据。 `InnoDB`行级锁定（不升级到更粗粒度的锁定）和 Oracle 风格的一致非锁定读取提高了多用户并发性和性能。`InnoDB`将用户数据存储在聚集索引中，以减少基于主键的常见查询的 I/O。

|              |                                                              |                                                              |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 磁盘文件     | .frm文件存储表定义<br />数据文件的扩展名为.MYD (MYData)<br />索引文件的扩展名是.MYI (MYIndex)<br />占用空间小 | .frm文件存储表定义<br />数据和索引文件.ibd<br /><br />占用磁盘空间一般取决于表内的数据和操作系统单文件大小限制。 |
| 事务         | MyISAM类型的表强调的是性能，其执行数度比InnoDB类型，不支持事务 | InnoDB提供事务，具有提交、回滚和崩溃恢复功能                 |
| 增删改查性能 | 查询性能最高，MyISAM是更好的选择                             | **1.**如果你的数据执行大量的**INSERT或UPDATE**，出于性能方面的考虑，应该使用InnoDB表<br /> **2.DELETE  FROM table**时，InnoDB不会重新建立表，而是一行一行的删除。<br />MVCC提高了多用户并发性读取的性能 |
| 锁粒度       | 表锁                                                         | 表锁、行锁                                                   |

**<font color='red'>INNODB 的重要性</font>**

​		存储引擎MySQL中也有很多种，比如：MyISAM、Memory、NDB等等，我们主要讲的就是`InnoDB`存储引擎。

​		为什么要讲InnoDB是因为InnoDB支持事务，这是关系型数据库最重要的一点，还有支持行锁，表锁，一致非锁定读取，提高了多用户并发读取的性能，还有`InnoDB`将用户数据存储在聚集索引中。



InnoDB的好处：https://dev.mysql.com/doc/refman/8.0/en/innodb-benefits.html

1.当意外断电或者重启，InnoDB能够做到奔溃恢复，撤销没有提交的数据

2.InnoDB存储引擎维护自己的缓冲池，在访问数据时将表和索引数据缓存到主存中。经常使用的数据直接从内存中处理。这种缓存适用于许多类型的信息，并加快了处理速度。在专用数据库服务器上，高达80%的物理内存通常分配给缓冲池

3.where、groupby 、orderBy的自动优化、基于索引。

4.插入、更新和删除是通过一种称为更改缓冲的自动机制进行优化的



​		<font color='cornflowerblue'>**而MySQL是InnoDB的磁盘文件是什么样子的**，我打开一个 xshell   cd /var/lib/mysql/USER_INNODB</font>

```
cd /var/lib/mysql/USER_INNODB
```

我们也可以在创建表的时候指定表使用什么ENGINE ，不指定就用默认的InnoDB

```mysql
CREATE TABLE `student` (
  `student_no` int(16) NOT NULL COMMENT '学号',
  `student_name` varchar(64) DEFAULT NULL COMMENT '姓名',
  `student_age` int(4) DEFAULT NULL COMMENT '年龄',
  `student_addr` varchar(128) DEFAULT NULL COMMENT '地址',
  PRIMARY KEY (`student_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;  

SELECT ENGINE from  information_schema.tables where table_name='student' 
# 查询某个表的存储引擎
```



### 3.5.2InnoDB引擎结构 （50min）

<font color='red'>**我们都知道，MySQL的数据是要存放在磁盘上的，如果每次都去磁盘读取，是不是性能提不上去？**</font>

磁盘的读写速度和内存的读写速度不是一个级别的？

所以，我们期望每次读写数据库时，都能直接使用内存，这样就能够提升我数据的性能。



#### 查看Mysql配置文件、持久化地址

1.查看mysql的安装路径

```java
[root@localhost mysql]# which mysql   //找到mysql的安装路径，不需要登录shell客户端
/usr/bin/mysql
```



2.查看mysql的config配置地址

```mysql
[root@localhost mysql]# /usr/bin/mysql --verbose --help | grep -A 1 'Default options'  //查看加载顺序
Default options are read from the following files in the given order:
/etc/my.cnf /etc/mysql/my.cnf /usr/etc/my.cnf ~/.my.cnf
```



3.查看数据的存储地址

sql语句查询

```mysql
SHOW VARIABLES LIKE '%datadir%';
```





打开官网：https://dev.mysql.com/doc/refman/5.7/en/innodb-architecture.html

我们可以看到 

InnoDB的引擎结构分两块 内存结构和磁盘结构:

![](令狐老师-MySQL专题-MySQL架构.assets/InnoDB架构图.png)

### 3.5.2.1MySQL内存架构

- buffer pool （缓冲区)
  - change buffer（更改缓冲区） 
- 自适应哈希索引
- 日志缓冲区



​		我们都知道，Mysql 数据最终是要放到磁盘的，但是，如果我们每次增删改都直接从磁盘操作，将会很慢很慢，所以mysql也会有一个机制，会把磁盘的数据读到内存中进行操作，然后回写到磁盘！



<font color='red'>那么这个内存区域就是我们讲的**buffer pool**，Buffer Pool **就是为了降低读写磁盘的IO次数的**。</font>



> Buffer Pool默认大小是128M（134217728字节），可以调整。



我们可以通过语句

```mysql
SHOW STATUS LIKE '%innodb_buffer_pool%'; 
```

进行查询，相关参数参考  https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html



**<font color='red'>Buffer Pool 怎么做到降低读写磁盘的IO次数的？</font>**

众所周知，数据库只有两个操作，**不是读就是写**

我们要做读写分离也是想提升数据库读写的性能嘛....



##### 3.5.2.1.1 读

​		有一个比较重要的概念叫 Page （页）<font color='red'>页：**Buffer Pool 操作数据的最小单元**</font>

​		在操作系统、存储引擎，都有一个预读概念。当磁盘上的一块数据被读取时候，其他附近位置的数据也会马上被读到，这个就叫局部性原理。

​		INNODB设定了一个存储引擎从磁盘读取数据到内存的最小单位是页，在操作系统中页的大小为4kb，在INNODB里面这个最小的默认单位为16KB。



**示例：**

比如我现在一条select的语句 select * from table where id=5;

**它的步骤总结为：**

1.通过语法词法解析，优化器、执行器。调用innoDB的存储引擎

2.从buffer里面去拿。。。没有，去读取磁盘数据。

3.磁盘就不是读一条数据，而是根据page去读，读16KB的数据，所以可能会把1.2.3.4.5.6.7的在一页里面的数据全部放到buffer

4.下次我去查询id=6的数据，就可以不与磁盘交互



##### 3.5.2.1.2写

**<font color='cornflowerblue'>打开文件：</font>**

​		有一个比较重要的概念刷脏，如果我们修改内存已有的数据，我们发现在buffer里面已经有这条数据了。只需要更改内存的数据页即可，而这个被更改的页也就叫做脏页（因为跟我磁盘的数据不一致了）。

​		既然不一致了，那我们还需要把内存更改过的数据同步到磁盘，那么这个动作就叫做刷脏。



#### <span style="color:red">3.5.2.2 那么刷脏的时候怎么找到我的脏页？</span>

​		这些脏页会在我们bufferpool里面有一个专门的脏页链表，叫做flush链表。这样我去找我的脏页只要去这个链表找就行，不需要在我内存的所有的页面里面去找了。



#### <span style="color:red">3.5.2.3 那么刷脏什么时候进行？</span>

最简单的办法，我每次更改，更改内存的同时，我立即同步到磁盘！！但是磁盘慢得跟乌龟一样，会严重影响程序的性能，所以我们不立即同步给磁盘；我们有自己的一些刷脏模式

我们有专门的线程每隔一段时间就把脏页刷新到磁盘，不影响用户线程正常的请求操作。这些线程叫做Page Cleaner，可以配置线程数量。innodb-page-cleaners



#### 3.5.2.4 刷脏的模式也有很多，比如：



**脏页自适应**  根据Redo的产生速度和脏页的使用比例共同来决定刷脏速度。通过innodb_max_dirty_pages_pct_lwm和innodb_max_dirty_pages_pct来控制  脏页太多的场景

**Redo自适应模式** 根据Redo的产生速度和Redo的使用比例共同来决定刷脏速度。通过innodb_adaptive_flushing和innodb_adaptive_flushing_lwm参数控制  redo太大，快写满了，写不进去了

**空闲模式**  系统空闲的时候提前刷脏 等等

**Mysql服务正常关闭**



**<font color='red'>刷脏的时候存在数据不一致的问题怎么办? 就是当我刷脏刷到一半突然宕机了</font>**

#### 3.5.2.5Double Write Buffer

**<font color='cornflowerblue'>打开文件：</font>**

Double Buffer Write Error.png 

![Double Buffer Write Error](令狐老师-MySQL专题-MySQL架构 - 副本.assets/Double Buffer Write Error.png)

**发现问题：**

​		我们发现，操作数据都是一页一页的操作的，InnoDB里面的页为16KB，但是操作系统一页的大小是4K，所以一页会分4次给到操作系统去操作。那么假如，我的4次，有些成功，有些失败，那怎么办！！

所以，为了保证页的数据一致性，又有了 Double Write的机制：

**解决问题：**

**<font color='cornflowerblue'>打开文件：</font>**

Double Buffer Worker.png



![Double Buffer Worker](令狐老师-MySQL专题-MySQL架构 - 副本.assets/Double Buffer Worker.png)



**第1步：页数据先**mem copy**到DWB的内存里；**

**第2步：DWB的内存里的数据页，会先刷到DWB的磁盘上；**

**第3步：DWB的内存里的数据页，再刷到数据磁盘存储.ibd文件上；**

**备注：DWB内存结构由128个页（Page）构成，所以容量只有：16KB × 128 = 2MB。**



1.在刷盘覆盖磁盘的时候，我们会将page内容写入到磁盘的另外一个地方，叫做doublewrite buffer。

2.然后再把内存里面的数据同步到磁盘



如果同步一部分，原来的数据不完整，但是doublewrite buffer是完整的，可以用doublewrite buffer里面的覆盖。



**Q-1：DWB为什么能解决“页数据损坏”问题呢？**

A-1：假设步骤2掉电，磁盘里依然是Page 1、Page 2、Page 3、Page 4的完整数据。只要有页数据完整，就能通过Redo Log还原数据；假如步骤3掉电，DWB磁盘结构里存储着完整的数据。所以，一定不会出现“页数据损坏”问题。同时写了DWB磁盘和Data File，总有一个地方的数据是OK的。



**Q-2：为什么叫Doublewrite？**

A-2：步骤2和步骤3要写2次磁盘，这就是“Doublewrite”的由来。



**Q-3：能够通过DWB保证页数据的完整性，但毕竟DWB要写两次磁盘，会不会导致数据库性能急剧降低呢？**

**A-3：分析DWB执行的三个步骤：**

**第1步：页数据memcopy到DWB的内存，速度很快；**

**第2步：DWB的内存fsync刷到DWB的磁盘，属于顺序追加写，速度也很快；**

**第3步，刷磁盘，随机写，本来就需要进行，不属于额外操作；**

**另外，128页（每页16K）2M的DWB，会分两次刷入磁盘，每次最多64页，即1M的数据（所以图中我们的DWB磁盘结构分为了两部分），执行也是非常之快的。综上，性能会有所影响，但影响并不大。**



```
##Doublewrite Buffer相关参数和变量

SHOW VARIABLES LIKE 'innodb_doublewrite';
SHOW GLOBAL STATUS LIKE '%dblwr%';

#参数：innodb_doublewrite
#介绍：Doublewrite Buffer是否启用开关，默认是开启状态，InnoDB将所有数据存储两次，首先到双写缓冲区，然后到实际数据文件。
#变量：Innodb_dblwr_pages_written
#介绍：记录写入到DWB中的页数量。
#变量：Innodb_dblwr_writes
#介绍：记录DWB写操作的次数。
```



#### 3.5.2.6 changeBuffer（默认关闭）

打开ProcessOn画图软件，画流程  https://www.processon.com/diagraming/6268faece401fd1b2456fbc0



**~~以上是我们去修改一条在bufferpool中有的数据，但是如果我改一条bufferpool里面没有的数据咋办？是不是需要从磁盘读出来？**~~

~~其实我们也不需要从磁盘里面读取出来，而是在bufferpool的内存空间里面又分了一块出来，叫做change buffer，可以通过参数innodb_change_buffer_max_size来动态设置，这个参数为50的时候，标识change buffer 的大小最多只能占用 buffer pool 的50%。~~



~~我们也将更新的操作记录到change_buffer，降低跟磁盘的随机IO~~

~~**那么change_buffer里的数据怎么更新到磁盘？**~~

~~1.系统有后台线程定期执行合并操作，数据库正常关闭也会进行合并。~~

~~2.当下次查询命中这个数据页的时候。会先从磁盘读取到数据页到内存，执行合并操作，然后再返回结果给用户，保证结果的正确。~~



~~**是不是所有的数据都会用到changeBuffer？**~~

~~因为唯一索引每个插入或者更新都要判断是否违反唯一约束，所以每次更新都要从内存中找到这个记录对应的数据页，没有的话需要从磁盘中读出，反正都要从磁盘读数据页了，还不如直接更新内存/磁盘，那么也就意味着change buffer失去意义，所以唯一索引使用change buffer 的话反倒会降低效率，所以只有普通索引能使用到change buffer。~~



~~**那么什么场景下是否使用changeBuffer？**~~

~~当写少读多的情况下：change buffer的利用率不高，因为可能刚一更新完可能就需要查询、就触发merge操作，change buffer没有起到减少随机IO，还多了一个维护change buffer的成本。~~

~~当写多读少的情况下：change buffer的提升效果较明显，可能很多条更新后，也没有一个查询线程来触发merge操作，可以大幅减少磁盘的随机IO。~~



#### 3.5.2.7Buffer Pool总结：

​		Buffer Pool 目的是为了提升<font color='red'>吞吐量</font> ，<font color='red'>减少IO操作</font>的。



**<font color='red'>但是Buffer Pool 存在数据丢失的场景，就是我刷脏还没有开始就宕机了，内存的数据会丢失，这个怎么解决呢？</font>**



### 3.5.3MySQL 磁盘架构之InnoDB事务日志  (20min)



#### 3.5.3.1.1 RedoLog

<font color='cornflowerblue'>**Buffer Pool**</font>  **存在数据丢失场景**

​		既然讲到了bufferpool，我们都知道bufferPool是一个内存空间，还有修改的数据都是先经过bufferpool的，那么假如数据在bufferPool，但是没有同步到磁盘，没有触发刷盘，数据是不是就会丢失？ 



**<font color='red'>那么既然没有BufferPool数据没有实时的同步到磁盘，那么假如我刷脏之前，mysql奔溃了，怎么办？</font>**

​		所以我们InnoDB中又有了redolog，作用就一个，就是我事务数据提交了就要保存，保证持久性，即使系统崩溃，我也能在重启后能把数据进行恢复。

​		**崩溃恢复**，保证事务持久性。



**<font color='red'>既然我已经有了Buffer Pool 为什么不用Buffer Pool 来做崩溃恢复呢？</font>**

​		我能不能在数据事务提交返回成功之前我就把修改的页面都刷新到磁盘行不行？肯定可以,但是也会有问题，有哪些问题呢，比如说：



1.我只修改了page 页的一条数据，你就把整个Page 更新了。

2.随机IO比较慢(改的数据在不同的磁盘位置)，频繁更新 Page 只会降低我们的数据库性能。



总结：

不用Buffer Pool做崩溃恢复的原因就是，因为每次刷脏都是随机IO，这个没办法避免的，我们如果一次性更新16K的数据，这样数据库的读写性能是没办法提升的，所以我们使用了Redo Log，我们都知道文件的读写是属于顺序IO这个



#### 3.5.3.1.2redolog 怎么做到保证崩溃恢复的呢？

​		Redo Log是**物理日志**，记录的是“**在某个数据页上做了什么修改（做了什么改动）**”，比如我对page1的哪条数据做了哪些更改，是属于顺序IO，所以性能非常高。如果我们系统崩溃了，重启后，找到我们的redolog 的记录把里面的操作重新做一次就行了。

<font color='cornflowerblue'>**打开官网**</font>      https://dev.mysql.com/doc/refman/5.7/en/innodb-architecture.html    



#### 3.5.3.1.3 **redo log 有哪几个部分**

**Redo Log 物理结构**		

​		mysql会在磁盘上建一个或多个物理文件，如果对数据页做修改操作都会记录到文件中，随着mysql的生产数据积累当redolog文件写完时会重新再覆盖写入。下图就是redolog物理结构。这部分日志是持久性。

https://www.processon.com/view/link/62763a1d0791290711fe5b0d  

![Redo Log 文件大小是固定的，是属于顺序循环覆盖写的结构](令狐老师-MySQL专题-MySQL架构 - 副本.assets/Redo Log 文件大小是固定的，是属于顺序循环覆盖写的结构.jpg)

**Redo Log 内存结构**

​		现在我们知道了磁盘上肯定有个这样的redolog，记录我们的每次操作，但是当初设计者为了解决磁盘太慢，所以有了bufferpool的概念，那么我们redolog也在磁盘，也很慢，那么能不能在bufferpool里面开辟一个区间来放redolog，不用每次都往磁盘去操作！！！

​		我们可以通过启动参数innodb_log_buffer_size来指定log buffer的大小，在MySQL 5.7.21这个版本中，该启动参数的默认值为16MB。 

​		**<font color='red'>这部分的日志是会丢失的。</font>**



> <font color='cornflowerblue'>**我们来看用户程序读写文件时必须经过**OS和硬件交互的内存模型</font> ：

> https://www.processon.com/view/link/6268f929e401fd1b2456ef69





#### 3.5.3.1.4那么redo log Buffer什么时候同步到磁盘？

1.redo log buffer 使用量达到了参数`innndb_log_buffer_size`的一半时，会触发落盘。

2.后台线程，每隔一段时间（1s）就会将redo log block刷新到磁盘文件中去。

3.Mysql正常关闭

4.事务提交时，可配<font color='red'> innodb_flush_log_at_trx_commit</font>参数

在聊这个参数的时候，我们还需要知道一点，落盘不是原子性，有三个步骤，打开一张图看下。



<font color='cornflowerblue'>**打开**</font>   redo log 三层架构.png

![redo log 刷盘](令狐老师-MySQL专题-MySQL架构 - 副本.assets/redo log 刷盘-16519148853841.png)

- **粉色部分**：**是InnoDB一项很重要的内存结构（In-Memory Structure），即我们的Log Buffer（日志缓冲区），这一层，是MySQL应用程序用户态控制。**
- **黄色部分：操作系统文件系统的缓冲区（FS Page Cache），这一层，是操作系统OS内核态控制。**
- **绿色部分：就是落盘的物理日志文件。**

**1、首先，事务提交的时候，会写入Log Buffer，这里调用的是MySQL自己的函数WriteRedoLog；**

**2、接着，只有当MySQL发起系统调用写文件write时，Log Buffer里的数据，才会写到FS Page Cache。注意，MySQL系统调用完write之后，就认为文件已经写完，如果不flush，什么时候落盘，是操作系统决定的；**

**3、最后，由操作系统（当然，MySQL也可以主动flush）将FS Page Cache里的数据，最终fsync到磁盘上；**、



#### RedoLog 一些简单的思考

- #### **Q-1**：操作系统为什么要缓冲数据到FS Page Cache里，而不直接刷盘呢？

​	A-1：这里就是将“每次写”优化为“批量写”，以提高操作系统性能。

- **Q-2：数据库为什么要缓冲数据到Log Buffer里，而不是直接write呢？**

A-2：这也是“每次写”优化为“批量写”思路的体现，以提高数据库性能。

- **Q-3**：Redo Log三层架构，MySQL做了一次批量写优化，OS做了一次批量写优化，确实能极大提升性能，但有什么副作用吗？**

A-3：有优点，必有缺点。这个副作用，就是可能丢失数据：

**①事务提交时，将Redo Log写入Log Buffer，就会认为事务提交成功；**

**②如果写入Log Buffer的数据，write入FS Page Cache之前，数据库崩溃，就会出现数据丢失；**

**③如果写入FS Page Cache的数据，fsync入磁盘之前，操作系统奔溃，也可能出现数据丢失；**

**（如上文所说，应用程序系统调用完write之后（不可能每次write后都立刻flush，这样写日志很蠢），就认为写成功了，操作系统何时fsync，应用程序并不知道，如果操作系统崩溃，数据可能丢失**



**<font color='red'>这里是不是也有原子性的问题？如果在写的过程中发生丢失。</font>**



该参数有几个选项：0、1、2

- 想要保证ACID四大特性推荐设置为1：表示当你commit时，MySQL必须将rodolog-buffer中的数据刷新进磁盘中。确保只要commit是成功的，磁盘上就得有对应的rodolog日志。这也是最安全的情况。

- 设置为0：每秒写一次日志并将其刷新到磁盘。

- 设置为2：表示当你commit时，将redolog-buffer中的数据刷新进OS Cache中，然后依托于操作系统每秒刷新一次的机制将数据同步到磁盘中，也存在丢失的风险。

  

  **<font color='cornflowerblue'>打开文件</font>**   redo log 刷盘.png

  

  ![redo log 刷盘](令狐老师-MySQL专题-MySQL架构 - 副本.assets/redo log 刷盘.png)

**Redo Log 总结：**Redo Log 文件大小是固定的，是属于顺序循环覆盖写的结构，空间用完会覆盖，不能用于数据备份（归档），数据恢复。



那除了Redo Log，我们还有Undo Log，Undo Log 能做什么呢？为什么要讲呢？

#### 3.5.3.2 undoLog（回滚日志）

打开 https://www.processon.com/diagraming/62480e370e3e74078d635ebe

**作用：提供回滚和MVCC**



undo log（撤销日志或回滚日志）记录了事务发生之前的数据状态，分为insert undo log和update undo log。如果修改数据时出现异常，可以用undo log来实现回滚操作（保持原子性）。



写undo log 也会产生redo log

可以理解为undo log记录的是反向的操作，比如insert会记录delete，update会记录update原来的值，跟redolog记录在哪个物理页面做了什么操作不同，所以叫做逻辑格式的日志。

show global variables like '%undo%';



| 值                       | 含义                                                         |
| ------------------------ | ------------------------------------------------------------ |
| innodb_undo_directory    | undo 文件的路径                                              |
| innodb_undo_log_truncate | 设置为1，即开启在线回收（收缩）undo log日志文件              |
| innodb_max_undo_log_size | 如果innodb_undo_log_truncate设置为1，超过这个大小的时候会触发truncate回收（收缩）动作，如果page大小是16KB，truncate后空间缩小到10M。默认1073741824字节=1G。 |
| innodb_undo_logs         | 回滚段的数量， 默认128，这个参数已经过时。                   |
| innodb_undo_tablespaces  | 设置undo独立表空间个数，范围为0-95， 默认为0，0表示表示不开启独立undo表空间 且 undo日志存储在ibdata文件中。这个参数已经过时。 |

redo Log和undo Log与事务密切相关，统称为事务日志。





#### 3.5.3.3服务层BinLog  (10min)

#### **<font color='red'>3.5.3.3.1为什么讲Binlog</font>**

​		刚才我们讲的redoLog属于InnoDB独有的，因为redolog的目的是为了事务里面的持久性，说到就要做到，所以它的实现是在InnoDB存储引擎去实现。

<font color='cornflowerblue'>		为什么要讲，因为Redo Log有局限性是物理日志，它能保证我们数据崩溃恢复，但是它不能做**数据恢复、增量备份、主从复制**。</font>

比如说，我现在执行一条SQL

```sql
DELETE FROM TABLE  
# WHERE 条件忘记了，那会出现什么问题，整张表的数据都没了啊，然后redo log 是没办法恢复的啊,因为他只记录了在那些Page做了更改只能做崩溃恢复，
# 那怎么办？这个时候我们就引出Bin Log 
```

​		BinLog是MySQL **<font color='red'>Server</font>**层维护的一种二进制日志，与InnoDB引擎中的Redo/Undo Log是完全不同的日志；其主要是用来记录对MySQL数据更新或者潜在发生更新的SQL语句，并以“事务”的形式保存在磁盘中。

作用主要有：

1. 主从复制：MySQL 主从复制（Replication），在Master端开启BinLog，Master把它的二进制日志传递给slaves并回放来达到master-slave数据一致的目的。
2. 数据备份：通过mysqlbinlog工具恢复数据
3. 增量备份：某个时间节点后的数据，都成为增量备份



#### **3.5.3.3.2Bin log 和 Redo Log 的区别**

Redo Log是InnoDB引擎独有的；Bin Log是MySQL的Server层实现的，所有引擎可以使用。

Redo Log是物理日志，记录的是“在某个数据页上做了什么修改”；Bin Log是逻辑日志，记录的是这个语句的原始逻辑，比如法外狂徒张三的现金账户 balance （字段）增加了100W。

Redo Log是顺序循环覆盖写的，空间是固定的，当写完之后会覆盖以前的记录的；Bin Log顺序追加写的，每个文件大小是固定的，这个文件写完会新建一个文件继续追加写，不会覆盖之前的日志；

Redo Log作为数据库异常宕机或者崩溃后的数据恢复使用的；Bin Log可以作为恢复数据、主从复制搭建、增加备份使用。

​		DDL：建表删表的语句

​		DML：增删改查SQL语句

​		**bin log 默认是不开启的**



**Bin Log 和Redo Log 是在不同的位置，为了保证原子性，我们应该怎么做。**

​		**为了保证redolog和binlog数据的安全一致性。只有在这两个日志文件逻辑上高度一致了。你才能放心的使用redolog帮你将数据库中的状态恢复成crash之前的状态，使用binlog实现数据备份、恢复、以及主从复制。而两阶段提交的机制可以保证这两个日志文件的逻辑是高度一致的。没有错误、没有冲突。**



 

#### 3.5.3.3.3为什么需要RedoLog的二阶段提交

​		我们讲了2个log了，一个redo，一个binlog,一个是InnoDB存储引擎的，一个是server端的日志文件；这2个日志不是1个地方操作的，那么就不是原子性的；就会产生数据一致性问题；要么恢复的数据有问题，要么复制备份的数据会有问题。



假如我修改一条数据那么整体流程为：



那么整体流程为：

 ![image-20210914155438513](令狐老师-MySQL专题-MySQL架构 - 副本.assets/image-20210914155438513-1648827876576.png)

 

简单地来说，这里有两个写日志的操作，类似于分布式事务，不用两阶段提交，就不能保证都成功或者都失败。

在崩溃恢复时，判断事务是否需要提交： 

1、binlog无记录，redolog无记录： 在redolog写之前crash，恢复操作：回滚事务

 2、binlog无记录，redolog状态prepare：在binlog写完之前的crash，恢复操作：回滚事务

3、binlog有记录，redolog状态prepare： 在binlog写完提交事务之前的crash，恢复操作：提交事务 

4、binlog有记录，redolog状态commit： 正常完成的事务，不需要恢复



# 四、课后总结（10min）

打开图片：https://www.processon.com/view/link/6274c0e70e3e7413eeb8fd6d



![一条SQL的执行流程](令狐老师-MySQL专题-MySQL架构 - 副本.assets/一条SQL的执行流程.jpg)



# 五、下节课预告（5min）

MySQL索引结构、概念

MySQL索引优化、分析





过渡，点精，坚持自己的方式。



表述，过渡~ ~ ~
