# MySQL专题

># MySQL索引，索引优化



## 我的格言

只要你相信自己，没有什么是不可能的。

**互动看弹幕**



## 学习完MySQL索引你能得到什么

**分析问题能力**

**解决问题能力**

怎么才能做到知己知彼，百战百胜呢？我们需要对一个事情非常了解，成竹在胸才能做到庖丁解牛，才能打仗，打胜仗！

上一节课，通过一条SQL语句执行的流程，我们告诉了大家，因为我们MySQL客户端与服务端通讯方式：半双工，通讯类型是同步的，意味着我们执行一条SQL只能等待结果集的返回，如果一条SQL执行效率太慢，就会降低我们程序的性能和吞吐量，对于互联网行业这个是灾难级别的。

这节课我就带大家去学习....

如何去优化我们的SQL语句，想要优化SQL语句那么你得知道优化什么，一般来说其实就是命中索引，提升查询效率，但是索引你真的了解吗，它是什么，为什么会出现，出现解决什么问题？



# 一、复习昨天内容 （15min）

## 温故而知新

​		回顾上一堂课的内容：我们讲了从一条SQL语句执行流程带大家了解了MySQL的三层架构，连接层、服务层、存储引擎层。

打开文件：     https://www.processon.com/view/link/6274c0e70e3e7413eeb8fd6d



![一条SQL的执行流程](令狐老师-MySQL专题-MySQL索引 - 副本.assets/一条SQL的执行流程.jpg)





### 连接层

**MySQL 客户端与服务端通讯**

​		使用MySQL执行SQL语句必须先要使用TCP/IP通信协议通过MySQL的连接层校验账号密码和权限建立数据库连接。

### 服务层

​		一条SQL 在服务层一条SQL会经历查询缓存（8.0移除）、解析器、预处理器、优化器、执行器，这里我们就不展开了。

然后执行器调用存储过程的API获取数据。

### 存储引擎层

存储引擎MySQL中也有很多种，比如：MyISAM、Memory、NDB等等，我们主要讲的就是`InnoDB`存储引擎。

为什么要讲InnoDB是因为InnoDB支持事务，这是关系型数据库最重要的一点，还有支持行锁，表锁，一致非锁定读取，提高了多用户并发读取的性能，还有`InnoDB`将用户数据存储在聚集索引中，这个也是我们今天会讲的。

InnoDB 存储引擎：

​		在存储引擎里也有执行流程，我们也不会展开讲了。InnoDB又分为两个部分的内存架构、磁盘架构。

​		内存架构里有几大模块，其中Buffer Pool 是为了降低我们磁盘在IO读写次数诞生的。

​		在Buffer Pool中<font color='red'>`读` </font>有一个重要的概念是：**<font color='red'>`PAGE`</font>**，还记得默认大小是多少吗？

​		**16K**，这个称之为预读，MySQL的InnoDB认为一条数据被读取时，其附近的数据很快也会被读取到。所以一次性读取是一个Page，也就是16K。

​		在Buffer Pool中<font color='red'>`写` </font>有一个重要的概念是：**<font color='red'>`刷脏`</font>**，还记得概念吗？

​		刷脏，其实是Buffer Pool 中读到一个Page页，这时候执行了一条更新SQL内存中的Page里某一条数据被修改了，就导致一个问题？什么问题数据一致性的问题，也就是Buffer Pool 内存里的数据与磁盘数据不一致，这种情况我们吧Buffer Pool 里的数据称之为脏数据页，那么为了解决数据一致性的问题，我们需要把内存中的Page页数据刷写到磁盘上，这个动作我们称之为刷脏。

**刷脏存在哪里？**

flush 链表 ，LRU 冷热数据区 等等

**刷脏什么时候进行**?

**刷脏模式**：

​		空闲、MySQL正常关闭、Redo Log自适应、脏页自适应

​		当然了内存架构里，还有ChangeBuffer、Log Buffer，ChangeBuffer是为了解决Buffer Pool 写的情况没有命中缓存需要访问磁盘的情况进行优化而诞生的，且只能够在修改非唯一索引的数据才能生效。Log Buffer，区别于Buffer Pool是写到数据库文件中的缓冲区，而Log Buffer 是写到日志文件中的缓冲区，其目的都是一致的，都是为了减少磁盘IO读写次数。

​	

<font color='red'>**Buffer** **Pool**</font>

**刷脏存在数据一致性的问题**

MySQL提供了Double Write Buffer

<font color='red'>**Buffer** **Pool**</font>

**存在数据丢失场景**

然后出现了保证我们数据丢失，崩溃恢复的日志RedoLog。



参数：innodb_flush_log_at_trx_commit = 1



RedoLog是事务日志，讲到redo log 是如何保证我们数据的持久性的，是通过用户提交事务时，先写入LogBuffer然后从Log Buffer写到我们的操作系统文件Page页的缓存中，然后MySQL会手动调用Flush方法实现实时写入磁盘。，我们InnoDB里面还有一个事务日志是UndoLog，它是用来保存数据行的历史版本的，我们可以通过隐藏的数据列指针找到上一个版本的数据实现回滚操作，其中MVCC也是依赖于UndoLog来实现的。

然后，又聊到了Redo Log的局限性，他不能做数据备份，增量备份，主从复制，然后我们聊到了服务层的BinLog，也讲到了我们的两阶段提交，两阶段提交是为了保证redo log 和 bin log 日志的逻辑性是高度一致的，这样能保证我们的数据能够被备份恢复，实现主从同步。



好了，我们简单地回顾了上一节课的内容。



# 二、课程安排

**第一天：MySQL架构与执行流程、InnoDB内存结构** 

**第二天：MySQL索引结构以及由来、索引优化** 

**第三天：MySQL的事务与锁** 

**第四天：MySQL 的面试题**  



# 三、教学目标

1. **索引的相关概念**
2. **索引的数据结构B+树的演进过程**
3. **掌握Explain分析性能瓶颈、优化SQL语句**



# 四、教学过程

## 4.1索引的相关概念

### 索引的概念

> ​		索引在关系型数据库中，是一种单独的、物理的对数据库表中的一列或者多列值进行<font color='red'>排序</font>的一种存储结构，它是某个表中一列或者若干列值的集合，还有指向表中物理标识这些值的数据页的逻辑指针清单。
>
> ​		索引的作用相当于图书的目录，可以根据目录重点页码快速找到所需要的内容，数据库使用索引以找到特定值，然后顺着指针找到包含该值的行，这样可以是对应于表的SQL语句执行得更快，可快速访问数据库表中的特<font color='red'></font>定信息。

​	

### 索引有那类型呢？

> 在InnoDB里面，索引类型有三种，普通索引、唯一索引（主键索引是特殊的非空的唯一索引）、全文索引。
>
> - 普通（Normal）：也叫非唯一索引，是普通索引，没有任何限制
> - 唯一（Unique）：唯一索引要求键值不能重复（可以为空），主键索引其实是一种特殊的唯一索引，不过他还多了一个限制条件，要求键值不能为空。主键索引用  primary key 创建。
> - 全文（Fulltext）：针对比较大的数据，比如我们存放是文章，课文，邮件，等等，有可能一个字段就需要几kb，如果要解决like查询在全文匹配的时候效率低下的问题，可以创建全文索引。只有文本类型的字段才可以创建全文索引，比如char、varchar、text。MyISAM和InnoDB都支持全文索引。

### 索引的作用

> <font color='red'>索引能够提高数据检索的效率，降低数据库的IO成本。</font>

这里打开我们的Navicat ，演示一下以下的代码：

```sql
# 第一条SQL 语句查询很慢怎么解决
SELECT * FROM `INNODB_USER`;


# 一次只拿一点
SELECT * FROM `INNODB_USER`
LIMIT 0 , 10;
# 第二次查询 变快了，但是第一次查询还是慢,SHOW variables like '%cache%';


# 那我们拿少一点数据，
SELECT * FROM `INNODB_USER`
LIMIT 0 , 1000;

# 还是不行，那么我们用索引试试
alter table `INNODB_USER` add index USERNAME_INDEX(`age`,`user_name`,`phone`);

# 最后 我们使用索引去查
SELECT user_name from `INNODB_USER`
where user_name like '令狐%'; 

# 我们可以说，索引能够提高数据检索的效率,降低数据库的IO成本。
```



我会好奇索引它到底有啥能力，你会魔法吗？索引你的<font color='red'>数据结构</font>是怎么样呢，你怎么降低数据库<font color='red'>查询的IO</font>成本呢，以及怎么能<font color='red'>存储</font>这么多<font color='red'>数据</font>的，帮我们提高这么多的<font color='red'>查询效率</font>的？

有的同学说，我们用<font color='red'>**空间换时间**</font>，你看你这就提醒我了，他是用空间换时间，索引你来说说....



## 4.2 MySQL 索引

> [MySQL ：： MySQL 5.7 参考手册 ：： 13.1.14 创建索引语句](https://dev.mysql.com/doc/refman/5.7/en/create-index.html)

### 4.2.1 语法

```sql
# 创建索引 什么类型的索引 唯一、全文、空间、默认是普通索引，
CREATE [UNIQUE | FULLTEXT | SPATIAL] INDEX index_name
    [index_type] # 索引的数据结构、InnoDB 默认是 USING BTREE 
    ON tbl_name (key_part,...) # 为那些查询列简历索引，而且可选索引长度！正序和倒序等等
    [index_option] # 指定索引的选项，比如 索引键值的大小、索引的类型
    [algorithm_option | lock_option] ...

key_part:
    col_name [(length)] [ASC | DESC]

index_option: {
    KEY_BLOCK_SIZE [=] value # INNODB 不支持执行索引键值的大小，MyISAM支持，因为它们是用HASH算法得到的索引键值都是 固定的长度！
  | index_type # 索引的类型 CREATE TABLE lookup (id INT) ENGINE = MEMORY; 
  			   # CREATE INDEX id_index ON lookup (id) USING BTREE;
  | WITH PARSER parser_name # 与全文索引结合使用，用于指定全文索引的的插件
  | COMMENT 'string' # 注释，一个索引能提供1024个字符的可选注释！
}

index_type:
    USING {BTREE | HASH}

algorithm_option:
    ALGORITHM [=] {DEFAULT | INPLACE | COPY}

lock_option:
    LOCK [=] {DEFAULT | NONE | SHARED | EXCLUSIVE}
```



创建索引时，需要注意不同的存储引擎支持的 索引数据结构、还有创建索引的类型都会有所不同。





### 4.2.2 实例

#### 4.2.2.1 创建索引

```sql
CREATE INDEX idx_username_idcard_age USING BTREE ON INNODB_USER (user_name ASC,idcard(6),age ASC) COMMENT '用户名称'; 
```

当然还有一种增加索引的方式

```sql
ALTER TABLE 
```



#### 4.2.2.2 查询索引

```sql
SHOW INDEX FROM INNODB_USER;
```



#### 4.2.2.3 删除索引

```sql
DROP INDEX index_name ON tbl_name
    [algorithm_option | lock_option] ...

algorithm_option:
    ALGORITHM [=] {DEFAULT | INPLACE | COPY}

lock_option:
    LOCK [=] {DEFAULT | NONE | SHARED | EXCLUSIVE}
```

```sql
DROP INDEX username_idcard_age ON INNODB_USER;
```



### 4.2.3 术语

#### 4.2.3.1 术语 Index(索引)/Key(键值)/DataPage数据页

index，就是索引 这里对应上我们的汉语拼音词典就是目录里面的 "汉语拼音音节索引"页咯，

key/索引键，就是"汉语拼音音节索引"，这些排序的 ABCDEFGHTIJK的 拼音了

DataPage/数据页，其实就是根据 索引键，找到对应的数据页码，然后找到对应数据页，数据页其实就是真正存储数据的地方

![image-20230404170148268](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230404170148268-168059890908648.png)

#### 4.2.3.2 术语 – 索引扫描/表扫描

全索引扫描的意思，就是看书先看目录，看看从目录第一条到最后一条搜寻内容，如果有就拿到相应的数据页码，去对应的数据页码拿数据返回。

表扫描的意思，就是看书就从第一页翻到最后一页直到拿到你想要的数据进行返回。

![image-20230628152656170](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230628152656170-16879372171501.png)



#### 4.2.3.3 术语 – index Prefix 索引前缀

> 组合索引，最左匹配原则，索引桥，索引前缀

当我们创建索引的时候，是一个组合索引，其实等于是创建了多个索引，比如creataIndex(A,B,C)其实是创建了A AB ABC 3 个索引



#### 4.2.3.4 术语 – 时间复杂度

Big O Notation /noʊˈteɪʃn/

> 时间复杂度，表示一个查询需要多少时间
>
> x 轴代表的是数据量
>
> y 轴代表的是所花费的时间
>
> 这里有一条绿色的线，如果是全表扫描时间的复杂度是O(N)，随着数据量增长数据量的线性增长的
>
> 蓝色的线代表的是IndexScan 索引扫描，他的时间复杂度是 log2N
>
> 如果没有用到索引，那么你的时间复杂度就是 红色和橙色的线 

• Big O Notation - 时间复杂度

![image-20230404170405753](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230404170405753-168059904660551.png)



#### 4.2.3.4 术语 – 覆盖索引

![image-20230404170248718-168059896958149](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230404170248718-168059896958149.png)



#### 4.2.3.6 术语 – 回表

#### 4.2.3.7 术语 – 索引下推

#### 4.2.3.8 术语 – 过滤性

> 过滤性，一个搜索条件能够过滤越多的数据，那么它的过滤性就越好，这样能帮助我们快速定位数据，同理如果我们要选择一个字段去建立索引，我们会选谁呢，肯定是选择一个过滤性最强的创建索引。

在一个有10000条记录的集合中：

- 满足 gender = F 的记录有4000条
- 满足 city = LA 的记录有100条
- 满足 ln = 'parker' 的记录有10条

条件 ln 能过滤的最多的数据，city 其次，gender 最弱。所以ln 的过滤性是最好的 city 其次，gender 最差。

如果查询要同时满足：

gender == F && city == SZ && ln == 'parker'的记录，但只允许为 gender/city/ln 中一个建立索引，应该把索引放在那？

#### 4.2.3.9 术语 – 离散度



#### 4.2.3.10 术语 - 索引字段顺序的影响

1.精准匹配 E

2.范围查询 R

3.排序查询 S 



## 4.3 完全地理解B树和B+树所需要的东西

### 4.3.1 磁盘结构

https://www.processon.com/view/link/649d1bc9bcce5b4619f1f18d

![怎么把数据存储到磁盘上 (2)](令狐老师-MySQL专题-MySQL索引 - 副本.assets/怎么把数据存储到磁盘上 (2)-16880201168072.png)

我们一起来看一下磁盘的结构，右边这个像一个盘子，上面有一些同心圆，这些逻辑圆圈，不是物理的，这些圆圈被称为轨道（track)，然后垂直于轨道的按512字节为单位划分为等分，就得到很多扇区（Sector）。

这样我们就可以得到，扇区0 扇区1 扇区2 扇区3 ，轨道0 轨道1 轨道2。 

​		因此磁盘分为许多磁道和扇区，**<font color='red'>磁道与扇区的交叉部分</font>**，所有这些交叉的位置称为块。因此磁盘上的任何位置都可以用磁道号和扇区号来寻址。

​		现在我们拿一块block 出来，他的大小是512字节，第一个字节的开始地址为0，最后一个字节的地址为512 <font color='red'>**每个字节都有了自己的地址，该地址被称为偏移量**</font>。

​		磁盘块大小为512Bytes，每一个Byte的访问，可以通过block再加上起始地址和Offset来实现，这是从物理磁盘的角度考虑的Byte的读写，任何的字节都可以被取址，通过3个信息，轨道号+扇区号+block 里的 offset 我就读写磁盘上任意一个字节的数据。

​		我们进行扩展一下，模拟一下磁盘读写数据，这个图我没有画，大家跟我做一个动作，把你的左手举起来，竖起左手食指当成磁盘的主轴，想象一下指尖上有一个光盘，磁盘工作时，主轴会带动磁盘盘片旋转起来，这个时候再把你的右手模拟成磁头（用于读写数据的），主轴带动盘片的旋转，就能移动到不同的扇区，然后通过你右手的磁头手臂的移动，就能够从磁盘读取或者写数据了。

​		程序是通过RAM（主内存）访问数据，假设程序正在访问硬盘上的数据，那么硬盘的数据就必须要先进入主内存，然后才能被访问到，如果有任何的数据需要返回或者写入，那么再把数据从内存写入硬盘。因此硬盘的数据无法直接被访问，数据必须进入主存，然后才能被访问。这是一个重要点。

​		在内存中以什么方式组织主内存中的数据，对于程序非常有帮助，程序很方便直接使用主内存的数据，这种方式被称为**数据结构**。 有效地组织硬盘上的数据，让数据更容易被利用，这是DBMS或者说这才是数据库，因此，研究如何在硬盘上的有效存储数据的方式，它就是DBMS，包括如何去设计，如何去组织等等。



总结：有效地组织磁盘上的数据，使其易于使用，即 DBMS（Database Management System），因此请研究用于将数据有效地存储在磁盘上的所有有关 DBMS 的方法或手段，设计组织一切。



今天这节课，我们只研究数据结构。

### 4.3.2 怎么把数据存储到磁盘上

​		首先，让我们明白数据库以什么形式组织硬盘数据的，我们这里有一个示例数据库表，这是一个二维表格，他包含了一些列和行。

![image-20230629161315378](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230629161315378-16880263967052.png)

​		我们假设它们有100行，数据如何以块状的形式存储在硬盘上呢？假设block 大小为512字节。这个是表结构。

| 字段      | 占用字节 |
| --------- | -------- |
| id        | 8        |
| user_name | 50       |
| age       | 10       |
| phone     | ...      |
| idcard    | ...      |
| address   | 50       |
| 假设合计  | 128      |

这意味着，每行的大小都是128字节， 现在数据库要存储该表，那么在每个快中可以存储多少行？或者说可以存储多少条记录？

也就是每块存储的数量是 block（512 bytes）/ 记录大小（128 bytes） = 4 ,一块可以存储这个表里4行记录。

https://www.processon.com/view/link/649d4127b227c70f8e84b578

![把数据存储到磁盘上](令狐老师-MySQL专题-MySQL索引 - 副本.assets/把数据存储到磁盘上-16880274496863.png)

每四行存储在一个block 中， 如果我们有100行，那么就是100条记录，意味着我们需要多少个block ，100除以4答案是25个block，因此在硬盘上存储 此数据库表需要 总结是 25个block。



现在想象一样，我们的数据都存储在磁盘里，如果你想要搜索任何指定的记录，我们会写一条SQL语句查询用户表。

比如：

```sql
SELECT * FROM INNODB_USER WHERE age = 16  AND  USER_NAME= "岳灵珊";
```

那么搜索会花多少时间呢? 其实时间取决于你访问块的数量（1个块就是一次IO），因此，要访问整个表，我们必须访问25个block，所以最多访问 25个块，我就能够确定，我们的数据在哪里，因为我们不知道记录在哪，所以我们必须要搜索整张表，这样就会访问全部25个快。我们遍历一个一个的快来查找我们想要的数据，需要25次IO,这意味着需要很长的时间，我们可以减少这个时间吗？ yes ，现在我们将为这个数据库表准备索引。



如果对表的行数据没有合理的组织，假设它们相对散落在磁盘的各个Block，那么查询一行数据，将遍历远多于25个块，但我们可以通过 添加额外的 索引来减少查询次数

### 4.3.3 什么是索引

那索引是什么呢？我们存放了什么东西在索引 (Index) 里，id 、数据页地址(指向记录指针)

我们会存储一个 键值、还有指向记录的指针。

https://www.processon.com/view/link/649d45a9e7745d6a21a1a6b0

我们创建的指向记录的指针，称为记录指针，我们就用指针访同硬盘上块中存储的记录。如果索引创建了指向每个记录的指针，这个就是（聚集索引，密集索引，主键索引）

![索引（目录）](令狐老师-MySQL专题-MySQL索引 - 副本.assets/索引（目录）-16880286267994.png)

工作方式是怎么样的呢？我们通过搜索条件，id（键值）=1 得到指向记录的指针，然后我们用指针访问硬盘或者block中表，我们创建的指向记录的指针，成为记录指针。我们就用指针访问硬盘上块中存储的记录。如果索引创建了指向每个记录的指针，那么就称之为密集索引。



在哪里存储索引呢？索引也将存储在硬盘中，假设我们使用一个块去存储索引，现在的问题是，我们为索引付出了多少存储成本，让我们来分析一下，id 这个字段是10个字节，pointer 指针我们假设它存储的是 6个字节，所以每个索引条目是 多少字节？每条占用16个字节，总共是100条记录，现在需要多少个块去存储这100条索引呢？block / 16 = 32 ，这意味着一个块中能存储32个索引条目， 总共是100条 100 / 32 = 3.2 它大于3意味着我们需要4个block 去存这些索引条目。

在引入索引之后，我们需要遍历4个block 确定数据是否存在这个数据中，然后再根据block 得到的索引指针，再额外访问一个block 就可以访问到指定数据表的block了。

总结：所以访问这个数据库任意的记录需要 4个 + 1 个block，而不是 需要访问整整25个block，这是索引的好处。



接下来我们会讲一讲多级索引，随着时代的发展，用户量的增长，数据增长，也会导致索引增长，索引数据大小的增长，这个时候该怎么办？

### 4.3.4 什么是多级索引(Multi-Level Index)  复合索引

现在不再是 100条而是1000条，全表访问的块就不是25个而是250个，而索引也由4个加个零，变成40个了，这只是假设，索引本身也变大了，那我们可以为索引再建立一层索引，这就是多级索引的由来了。

那我们怎么去准备这个索引呢，对于这个索引来说， 下一级的索引或者说更高级的索引，我们可以创建访问这个块的索引，之前我们计算过 一个block 能存储32条记录，这样我们就可以通过创建1个索引用于访问这32条索引。

这个时候 最上层的索引第一条记录为键值1 下一个键值为33 ，然后这个就我们常常讲的 稀疏索引（复合索引），这里不会给每个索引都创建索引只是给每个block 的最少的block 建立索引。

现在1000条数据，要用40个block 存储索引，40个索引，意味40个指针，我们一个block 16k 能存储32个索引，现在是40个所以我们需要 2 个block，因此这个高级索引 可以存储在2个 块中 。

|      | id   | 索引block 的地址 |
| ---- | ---- | ---------------- |
|      | 1    |                  |
|      | 33   |                  |
|      |      |                  |
|      |      |                  |

总结：1000条数据，数据库表占用了 250 个block，第一级索引40个block，然后是下一个高级索引 只有2个block，所以我们先搜索最上级 2个 block，一旦你在这2个block里面找到下一级的block，那么直接访问这个索引block，就可以拿到记录的block 最终拿到数据返回了。



然后我们通过再增加一层索引之后，访问一条数据的io变成了，多少次，第一层1次，第二层一次，第三层一次，总共是三次，相比全表扫描，或者是全索引扫描我们降低 block 访问的数量，所以这是B 和 B+树的基本思想。

我们最终形成了一个多级索引，然后你看看它像什么?

https://www.processon.com/view/link/649d5354221d15232cb80091

![多级索引](令狐老师-MySQL专题-MySQL索引 - 副本.assets/多级索引-16880320781355.png)

然后当把这个数据结构 旋转过来 再看一下。



https://www.processon.com/view/link/626a44081e08535fe536f47c

那如果，我们添加一条数据就需要添加条索引或者删除一条数据就删除一条索引吗，并不，b+树希望索引是可以自行组织的，什么意思？

这个就是b树和b+树的基本思想，



### 4.3.5 M-way Search Trees （m阶查找树）

![v2-73cdb7cc9b73fce64b4483534f7e1a7b_r](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-73cdb7cc9b73fce64b4483534f7e1a7b_r-16880397746437.jpg)

上一段落的复合索引变化一下，那么多阶树结构不难获得。

#### 4.3.5.1 二叉查找树 （binary search tree）

![v2-691694000ca61e6a9dc32fd59730e2dd_r](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-691694000ca61e6a9dc32fd59730e2dd_r.jpg)

BST每个节点只有一个Key，并且子节点只有两个，我们设想增加key数据量，同时扩充子节点个数。

朝这个设计思路，改造BST

#### 4.3.5.2 M 节点查找树（M-way Search Tree）

所以毫无疑问，搜索所花费的时间比 BST 多一点，但是搜索的方法是相同的，所以这些树被称为 M-way Search Tree。 它有多少个键，在这个例子中它有两个键，然后它有多少个Children Node，所以每个节点最多可以有 3 个Children Node。所以这是三节点搜索树。每个节点有 M (3) 个Children Node，所以有多少个键 M-1 (2) 。

所以 M-way ST 是BST的扩展，可以把 BST当做 2-Way ST来看待。那么M可以很大，比如100-way ST，单个节点就可以扩展到持有100个子节点。

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-129fe6c25e6007b22e544fe778749369_r-16880399074269.jpg)



如果简单地使用 M-way 搜索树，会出现什么问题以及我们如何克服它，在解决这些问题的同时，我们自然知道了引入 B-trees和B+-trees的原因。

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-3ed88dfc9e9ac088d9ac1960990db62d_720w-168803993009311.webp)



左边的ST树高比较均衡，插入过程也可以如右图所示，那么它就等同于单项链表的查询时间复杂度O(N)

我可以插入第一个10，之前什么都没有，所以我将创建一个节点并插入 10，这里Node还有 8 个空余key。 但是对于插入 20，我可以再创建一个新节点作为子节点，并插入 20，然后再创建一个新子节点插入 30，大于 20的 30，在此处插入 30。 所以你也可以这样插入，但这是错误的，我应该先填满先创建的节点，然后才想到创建下一个节点，但M-way搜索树没有限制，你可以随意插入数据。 所以这意味着，如果我有 N 个键，那么 N 的高度可以就是树高，所以这将是太多的耗时，数据结构变得类似于线性搜索。这就是m-way search tree的问题，所以问题是创建过程不受任何控制，创建过程没有指导方案。 创建 m-way 搜索树必须有一些规则或指南，是的，这些指南就构成了 B 树。 **所以 B 树是具有一些规则的 M 路搜索树。**



### 4.3.6 B-Tree

#### 4.3.6.1 B-Tree的约束规则（Properties of a B-Tree ）

- 除根节点之外的每个节点最多可以有 m 个子节点，和至少 m/2 个子节点。
- 每个节点最多可以包含 m - 1 个键，和最少 ⌈m/2⌉ - 1 个键。
- 根节点可以有至少两个子节点
- 所有叶子节点都处于同一水平
- 自下而上的创建过程



当节点是一个填充时，没有空闲空间，然后为了插入一个Key，我们拆分一个节点，一个Key，我们将拆出那个Key向上放置。 树是向上生长的，所以Key所放置的Node是自下而上创建的。 这和 B 树对于实现数据库的多级索引很有用，如果你在此处自动添加键，则二级索引会自动创建。



#### 插入数据（Insertion Data）

更规范的B-Tree可以把 Pointer to Children Node 画出来，

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-b3bf10a5da0aa1f45e437b78caae4c61_720w-168804008382713.webp)

对于4节点的B-Trees，我们从头插入 10,20,40,50 等数值，

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-2eca1c61c521077d1edfafdcca4ef922_720w-168804009481115.webp)

接下来追加插入 60,70,80

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-faccd8b771b889eaf3b171ad3f758b92_720w-168804011149117.webp)

插入30，正好有剩余空间，不需要额外操作

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-45deb0c90eb5eced047f1a9da610fdcd_720w-168804012283319.webp)

如果节点被填满，我们都在拆分它，并且我们正在发送父节点中的一个键，现在我们将尝试在这里再填充几个键。

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-f29d147cf40bab75ab9934b8c8bbd4c4_720w-168804014292721.webp)



![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-f29d147cf40bab75ab9934b8c8bbd4c4_720w-168804014829822-168804014931424.webp)

最后一组，插入 5 和 15

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-0390f855c4bcbed8983530feae337202_720w-168804016062026.webp)

最后生成了三层Index的B-Tree。



#### 数据库和B-Tree结合（B-Tree in Database）

B-tree node 具有 children pointer 和 record pointer，图中体现一下，就更接近 Database的Index结构了

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-f057ff0ff210260053ed4bb32fb7ccdc_720w-168804025774828.webp)

#### Deletion in B-Tree



### 4.3.7 B+-Trees

① B+树的一个和B树的区别特性，only leaf nodes have record pointer. 只有叶节点有记录指针。

② 每个内部Key （比如 15 30 40 70）都会在叶子节点中有它的副本，所以意味着这里缺少谁，这里缺少 15，所以这里（叶子节点）有 15，还有 20，15和20 组合在一个叶子节点。等等

③ 叶子节点有指针指向下一个叶子节点，便于scan 查询数据



### 4.3.8 MySQL的B+-tree

Root 节点的键值对中的value是PageID，internal节点的键值对中的value也是PageID

![img](令狐老师-MySQL专题-MySQL索引 - 副本.assets/v2-ca7716f276c8237a7454e24157d0d49f_r-168804034035730.jpg)











## 索引的数据结构B+树的演进过程

### 主键索引树

#### **<font color='red'>我们以一个 Page 的视角去看我们的B+树演进过程。</font>**

​		我们上节课讲到了MySQL内存结构与磁盘结构交互的最小单元是Page页，默认大小是16K ，**那一个Page在磁盘中的数据是怎么样的呢**？

​		来，我们执行一下这条SQL：

```sql
SELECT * FROM `INNODB_USER` LIMIT 0 , 10;
```

​		通过这个SQL我们可以得到10条记录对吧，假如一条记录的数据大小是4K，那么我们一个Page页能存多少条数据呢？

​		16K 除以 4K 得到 4条记录对吧。 

OK，我们打开画图工具，看看实际中Page页是怎么存储数据的，Page页里面的每一条数据都有一个关键的属性叫 `record_type `

- 0   普通用户记录
- 1   目录索引记录
- 2   最小 
- 3   最大

#### <font color='red'>**Page页是怎么存储数据、查找数据**</font>

​		使用ProcessOn画图，模拟从数据库里拿到10条记录，然后放到我们的Page页面，我们看看他究竟是什么样子的。

打开文件：	https://www.processon.com/diagraming/625016375653bb0743c9cb60![Page 页面反推B+树](令狐老师-MySQL专题-MySQL索引.assets/Page 页面反推B+树.jpg)

​		**这个是我们的Page页，每个Page页都会存放数据，按照主键有序存放数据，我们假如要查一条数据要怎么查?**  怎么才能快速查到数据！！！如果我们Page页中的数据是有连接方式的，就能够解决啊！



<font color='cornflowerblue'>单个查询、范围查询、更改删除</font> <font color='cornflowerblue'>链表采用动态存储分配，不会造成内存浪费和溢出；另外，链表执行插入和删除操作十分方便，修改指针即可，不需要移动大量元素。</font>



**<font color='red'>Page页中的数据是怎么连接的(数据在同一个页中)</font>**

​		MySQL把页中的数据通过单向链表连接起来，如果是根据主键去查询，使用二分法定位会非常快，如果是根据非主键索引去查，只能从最小的一个个开始遍历单向链表。

**<font color='red'>多个Page页是怎么建立连接（数据在不同的页中）</font>**

​		MySQL把不同的页通过双向向链表建立链接，这样我们就可以通过上一页找到下一页，通过下一页找到一页，由于我们不能快速定位的到记录的所在页，我们只能从第一个页沿着双向链表一直往下找，在每个页中再按照在同一页的方式去查找指定的记录，这个也是全表扫描嘛。

**<font color='red'>当Page页越来越多查询会出现什么问题、怎么解决怎么优化</font>**

​		当我们的数据页越来越多的时候会出现什么问题？我们的一个个链表和记录遍历查询是不是越来越慢，是吧，虽然链表的插入和删除的时间非常快，可是它查询的时间复杂度是O(n)啊？这个问题怎么优化呢？

​		所以面试经常问到的索引也是这个原因，我们接下来看看索引树的形成吧。

现在的问题：

1. **查询时间复杂度是 O(N)**
2. **读写磁盘的IO次数过多**

#### 索引树的形成

​		现在的情况是，我们的内容和数据页已经有了，它们通过双向链表Page存储，可是它的查询速度很慢啊，那么我们能不能参考图书的目录呢，如果我要看那个章节，我们直接看目录就可以直接找到页码进行查看。

![](令狐老师-MySQL专题-MySQL索引.assets/image-20220412174053010.png)

我们发现，这个目录里面有两个很重要的信息

- **内容简介（章节标题）**
- **所在的页码**

我们这个我们参考一个图书的目录思想来达到我们快速查询数据的目的：



​		可是随着目录页也出现多个，我们一个个目录也去遍历查询性能也会下降，那么我们也可以通过为目录页也建立一次目录，向上抽取一层根结点，这样就更加便于我们进行查询了。

​		这里用画图工具把整棵B+树画出来.......

​		好了，这个时候我们就得到了一个棵完整的树了，这棵树就是我们的主键索引树了，树的数据结构叫B+树。所以从Page页到形成索引B+树的形成的过程就是这样的。

​		**这棵树，因为是根据主键存储的，所以我们把它称之为主键索引树，因为主键索引树里存储了我们的表里的所有数据，那么在MySQL中 索引即数据，数据即索引也是这个原因了。**

​		我们刚刚聊到的是主键索引树的形成，以及它是怎么存储数据的，我们数据库当中，不是只有存储数据这一种行为。



#### 索引树、页的分裂与合并

**<font color='red'>当Page页出现增加、修改、删除，都会遇到什么问题</font>**

假如现在我们表里的数据为例子，假如我们一个Page能存放三条数据，那么页中的数据是这样的

<font color='red'>打开图片</font>

![Page 页面反推B+树](令狐老师-MySQL专题-MySQL索引.assets/Page 页面反推B+树.jpg)



​		有序增加，新增一条数据怎么办？ 那么是不是得开启一个新页！并且页的数据必须满足一个条件：

<span style="color:red">下一个数据页中用户记录的主键值必须大于上一个页中用户记录的主键值</span>，有序增加我们直接在双向链表末端增加一个页即可。

​		无序增加，新增一条数据怎么办？

1. 开启一个新页，并且找到数据的位置。
2. 把旧数据移动到新页，把新的数据放到有序的位置上。
3. 叶子结点数据一直平移。
4. 触发叶子结点数据Page页的分裂与合并
5. 触发上层叶结点和根结点的再次分裂与合并。
6. 这叫什么，"牵一发而动全身",也叫做页分裂！！

总结：Page页出现增加、修改、删除遇到的问题：

​		**<font color='red'>我们可以说，当无序增加、更新主键ID、删除索引页的更新操作时候，会有大量的树结点调整，触发子叶结点Page页和上层叶结点和根节点页的分页与合并，造成大量磁盘碎片，损耗数据库的性能，也就是解释了我们为什么不要在频繁更新修改的列上建索引，或者是不要去更新主键。</font>**



#### 面试题

##### 为什么主键ID最好是能趋势递增？

刚刚讲完....

​		有序递增，下一个数据页中用户记录的主键值必须大于上一个页中用户记录的主键值，假如我是趋势递增的，那么我的数据，存入肯定是在最末尾的链表或者是新开一个链表，就不会触发页的分裂与合并，导致添加的速度变慢。

##### 三层B+树能存多少数据呢？

考察点：Page 页大小，B+树定义。

> 1GB=1024MB，1MB=1024KB，1KB=1024Bytes

答：

​		已知：索引逻辑单元16bytes [baɪts] 字节，16kb = 16 * 1024 bytes， 设Page = 16k ，树的深度为 3 。

16k除以16bytes 那么一个Page可存放1024条逻辑单元，16k 除以1k可得一个Page页可存放16条数据。



​		第一层有一个Page，一个Page就可以存放1024个索引的逻辑单元，意味这颗B+树的度就是1024，度的意思就是**树的度（结点中的最大的度）**也可以理解为最大存放的数据条数。那么第一层一个Page页就能存放1024个指针。

​		第二层有1024个Page，是因为树的度是1024，那么意味着第二层能存放指针的数量是1024*1024=1,048,576。

​		第三层有1,048,576个Page，每个Page 能存放16条数据，那么意味着三层B+树能存放1,048,576*16=16777216数据。

​		在MySQLInnoDB中，一次页的查找就代表一次IO，一张千万级别的表，查询数据只需要访问3次磁盘IO，但是检索次数还是需要的。

​		需要注意的是：键值类型和数据量会影响树的深度进而影响磁盘IO的次数。字段值越大、数据量越大、深度也高，成正比。



总结：**在InnoDB中B+树的深度为3层就能满足千万级别的数据存储。**



##### mysql 大字段为什么要拆分？

考察点：Page 页大小，B+树定义。

​		你真的的，一个Page的大小是16K，表里的一条数据大小是1K那么我就可以存16条，如果是2K我只可以存8条，如此类推，你会发现一条数据占用内存越多，一个Page可存的数据条数就会越少，那么同样是1W条数据，表里的一条数据占用的存储空间越大，就意味着需要更多的Page页，这是成正比的。需要更多的Page页那么意味着树的深度变高，意味着IO次数多了，性能下降，查询更慢。

​		一个Page页可存放16K的数据，大字段占用大量的存储空间，意味着一个Page页可存储的数据条数变少，那么就需要更多的页来存储，需要更多的Page，意味着树的深度会变高。那么磁盘IO的次数会增加，性能下降，查询更慢。大字段不管是否被使用都会存放在索引上，占据大量内存空间压缩Page数据条数。

​		所以，我们建议大字段拆分也是因为这个原因。



##### 我们为什么用B+ 树？

1. B+树底层实现是多路平衡查找树.对于每一次的查询都是从根节点出发，B +树是子叶结点才存放数据，根结点和非叶子结点都存放的是叶子结点的索引指针，查找到叶子结点后，可获得所查键值数据，查询更加稳定。
2. 扫库、扫表能力能力更强（如果我们要对表进行全表扫描，只需要遍历叶子结点的链表即可，不需要遍历整个B Tree。）
3. 排序能力更强，叶子结点会存放下一个Page的指针，下一个Page 指针存放了指向上一个Page页的指针，形成了双向链表。
4. 查询效率和查询性能更加稳定（B+Tree 磁盘IO的次数是和整棵树的深度是一致的）
5. 存储能力更强，三层B+树能存千万级别的数据。



##### 为什么不用UUID 做主键？

打开网站：https://www.cs.usfca.edu/~galles/visualization/BTree.html

注意，我这里为了模拟真实的环境，选择 Max. Degree = 7，并且输入1 2 3 4 5 6 ，你可以看到我们这串数字是有序，并且是按顺序追加的是没有页的分裂与合并的。然后我们现在重新来一遍，随便输入6个无序数字，你可以看到，我们这个数据是不知道要放在哪里的位置的，我们要先找到它的位置。

看图：

有序列表： 

​					如果索引键值有序，写满一页接着开辟一个新的页：

无序列表：

​					如果索引键值无序，存储过程造成大量磁盘碎片，带来频繁的page分裂和合并。



### 主键索引树的总结：

<font color='red'>**聚集索引（聚簇索引）**</font>: 

​		主键索引树也叫聚集索引或者是聚簇索引，在InnoDB中一张表只有一个聚集索引树，如果一张表创建了主键索引，那么这个主键索引就是聚集索引，我们是根据聚集索引树的**键值**，决定数据行的物理存储顺序，我们的聚集索引会对表中的所有列进行排序存储，索引即数据，数据即索引，指的就是我们的主键索引树拉。

 

​		举个例子：字典的目录是安装拼音排序的，内容也是按拼音排序的，按照拼音排序的这种目录就叫做聚集索引），拼音就是我们的键值。

​		再举一个例子：比如我们家庭地址，省市区街的第几巷几号来排序的，家庭地址也叫做聚集索引。

​		再举一个例子：。。。。。

​		**<font color='red'>问题来了，主键之外的索引，需要把表中的一行数据的完整的键值在其叶子节点放一份吗？</font>**

​		答：不会，因为没必要，这会占用额外的<font color='cornflowerblue'>内存空间</font>和<font color='cornflowerblue'>计算消耗</font>。

​		问题来了，有些表没有主键索引，它会使用表里非空的唯一索引作为我们的键值，如果既没有主键索引也没有非空的唯一索引，会使用我们数据行的隐藏列rowid作为聚集索引的键值。



主键索引树，大家已经学习了，在我们的InnoDB除了主键索引树还有二级索引树。

主键索引树是根据聚集索引的键值来排序的，那二级索引树是通过什么进行排序呢？它又是什么索引树呢？



### 二级索引（辅助索引)

#### <font color='red'>**什么是二级索引树，怎么创建？**</font>

```sql
# 通过下面的SQL 可以建立一个组合索引
ALTER TABLE `INNODB_USER` ADD INDEX SECOND_INDEX_AGE_USERNAME_PHONE(`age`,`user_name`,`phone`);

# 其实，看似建立了1个索引，但是你使用 age 查询 age user_name 查询 age user_name phone 都能生效
# 您也可以认为建立了三个这样的索引，
ALTER TABLE `INNODB_USER` ADD INDEX SECOND_INDEX_AGE_USERNAME_PHONE(`age`);
ALTER TABLE `INNODB_USER` ADD INDEX SECOND_INDEX_AGE_USERNAME_PHONE(`age`,`user_name`);
ALTER TABLE `INNODB_USER` ADD INDEX SECOND_INDEX_AGE_USERNAME_PHONE(`age`,`user_name`,`phone`);

# 这里，我们还要提出一个概念，最左匹配原则。
# 至于为什么呢，我们先看看他在PAGE中是怎么存放数据的，看完就明白了
```

#### <font color='red'>**二级索引树是怎么排序的**</font>

这个问题我们班里有同学问过，要分情况说明

首先需要知道参与排序的字段类型是否有有序？
		如果是有序就按照有序字段排序比如（int） 1 2 3 4。
		如果是无序字段，按照这个列的字符集的排序规则来排序，这点不去深入，知道就好。

我现在有一个组合索引（A-B-C）他会按照你建立字段的顺序来进行排序：
		如果A相同按照B排序，如果B相同按照C排序，如果ABC全部相同，会按照聚集索引键进行排序。

​		我们的Page会根据组合索引的字段建立顺序来存储数据，年龄 用户名 手机号。它的数据结构其实是一样的，我们再来画一次。



#### <font color='red'>**索引桥的概念是什么**</font>

​		OK，那么可以看到我们第一个字段是AGE，如果需要这个索引生效，是不是在查询的时候需要先使用Age查询，然后如过还需要user_name，就使用user_name。只使用了user_name 能使用到索引吗，其实是不行的，因为我是使用age进行排序的，你必须先命中age，再命中user_name，再命中phone，这个其实就是我们所说的最左匹配原则，最左其实就是因为我们是按照组合索引的顺序来存储的。大家常说的"索引桥"也是这个原因。命中组合索引必须是像过桥一样，必须现在从第一块木板走到第二块木板再走到第三块木板。

​		<font color='cornflowerblue'>除此之外我们其实存储一个主键ID </font>

#### <span style="color:red">为什么非叶子节点要存聚集索引的主键ID？</span>

```sql
SELECT * FROM `INNODB_USER`
		WHERE AGE = 16 AND USER_NAME = '令狐冲'
					AND PHONE = '18525858534';
# 一条sql是怎么走索引的?
SELECT * FROM `INNODB_USER`
		WHERE AGE = 16;
# 比如这条数据，我们创建的索引有 AGE 、USER_NAME、PHONE 所以他命中了索引，这条语句是走了索引的。
		
# 我们的二级索引树只有 年龄 姓名 手机号，是不是没有其他数据啊，这个时候我们是不是需要去主键索引树去找啊
# 我们去主键索引树去找，是不是需要用索引啊，所以我们需要拿到主键ID才能够去主键索引树查找数据，就会额外存储一个主键ID。然后这个动作我们一般成为回表。这个能理解我们为什么要存储多一个ID了吗？
```



```sql
# 二级索引树有三个重要的概念，分别是回表、覆盖索引、索引下推。
# 刚刚我们已经讲到了回表，是因为我们查询的数据不在二级索引树中需要拿到ID去主键索引树找。
# 覆盖索引呢，其实就是我们需要查询的数据都在二级索引树中，直接返回这种情况就叫做覆盖索引。
# 索引下推：发生的条件 1.必须命中二级索引 2.查询的数据在二级索引中没有，必须回表。 3.必须拥有多个查询列
# 比如下面这条语句：
# 下面这条SQL语句
EXPLAIN SELECT * FROM `INNODB_USER`
		WHERE AGE = 18  AND USER_NAME like '令狐%';

#5.6之前没有索引下推，它是怎么做的呢？
# 存储引擎读取索引记录；
# 根据索引中的主键值，定位并读取完整的行记录；
# 存储引擎把记录交给Server层去检测该记录是否满足WHERE条件
SELECT COUNT(0) FROM `INNODB_USER`
			 WHERE AGE = 18;
# 这里拿到 5W 个 ID 回表到主键索引树 查询5W 条数据
# 然后再筛选 USER_NAME like '令狐%'的数据有46条。

#5.6之后拥有了索引下推，它是怎么做的呢？
# 存储引擎读取索引记录(二级索引树)
# 判断条件部分能否用索引中的列来做检查，条件不满足，则处理下一行索引记录；
# 条件满足，使用索引中的主键去定位并读取完整的行记录（就是所谓的回表）；
# 存储引擎把记录交给Server层，Server层检测该记录是否满足条件的其余部分。
SELECT COUNT(0) FROM `INNODB_USER`
			 WHERE AGE = 18  AND USER_NAME like'令狐%';
# 这里拿到 46个ID 然后再通过回表到主键索引树拿到完整数据返回
# 索引下推就是为了减少回表次数，
# 它怎么做的呢，其实就是指将部分上层（服务层）负责的事情，交给了下层（引擎层）去处理。
```



#### 面试题：

##### <span style="color:red">为什么聚集索引需要是唯一索引？</span>

​	因为如果不唯一，我的聚集索引插入相同数据时，不知道位置在哪！！跟上述结论违背；还有索引即数据，保证数据的唯一性。



##### 为什么离散度低的不走索引？

​		离散度是什么概念，相同的数据越多离散度越低，相同的数据越少离散度就越高。

​		请问都是相同的数据 怎么排序，没办法排序啊？

​		在B+Tree 里面重复值太多，MySQL的优化器发现走索引跟使用全表扫描差不了多少的时候，就算建立了索引也不会走。走不走索引，是MySQL的优化器去决定的。



##### 索引是不是越多越好？

​		空间上：索引是需要占用磁盘空间的。

​		时间上：命中索引会加快查询效率，如果是更新删除，会导致页的分裂与合并，影响插入和更新语句的响应时间，延缓性能。

​		如果是频繁更新的列，建议不要建立索引，因为会频繁触发页的分裂与合并。



#### 二级索引树总结

​		二级索引树也叫组合索引，二级索引树存储的是二级索引的键值，是根据我们的创建语句的列名顺序来存储的，它只保存了表里的部分数据列，二级索引树是为了帮忙我们提高查询效率的。在二级索引树存在三种情况，回表、覆盖索引、索引下推。

​		<span style="color:red">为什么mysql优化的时候，有一个点，一般不查询*,而是先查出ID，然后通过再查询数据！！</span>

​		其实目的就很简单，减少回表！！



## 主键索引树和二级索引树总结：



| 区别 | 主键索引                    | 二级索引                                     |
| ---- | --------------------------- | -------------------------------------------- |
| 数量 | 一张表只有一个主键索引树    | 一张表可以有多个二级索引树                   |
| 存储 | 可以存储表里的所有列数据    | 存储表里的部分数据列、辅助查询，提升查询效率 |
| 创建 | 建表时候自动创建            | 手动创建                                     |
| 排序 | 主键ID、非空唯一索引、rowid | 根据用户创建二级索引时候的列名从左到右       |
| 场景 | 主键索引，排序              | 回表、覆盖索引、索引下推                     |
|      |                             |                                              |



## 索引优化

### 为什么要讲EXPLAIN ？ 

**有一个场景**

<font color='red'>有的同学出去面试，经常会被问到一个这样的问题：</font>

比如我创建了组合索引有（a ，b，c） where  c = 1 and a = 1 and b > 1，是否用到索引？怎么证明呢？

​		今天我们就以这个面试题作为出发点，怎么去查看SQL是否使用到了索引，用到了什么索引，以及什么情况下索引会失效？为什么？以及怎么去优化？



<font color='red'>平时我们日常工作中，想要分析你的SQL语句或者是表的性能，我们通常会使用EXPLAIN 。</font>

那么EXPLAIN是什么呢？

### 索引的优化（就是命中索引，避免索引失效）

​			EXPLAIN  [ɪkˈspleɪn] 命令：该[`EXPLAIN`](https://dev.mysql.com/doc/refman/5.6/en/explain.html)语句提供有关 MySQL 如何执行语句的相关信息。 [`EXPLAIN`](https://dev.mysql.com/doc/refman/5.6/en/explain.html)与 [`SELECT`](https://dev.mysql.com/doc/refman/5.6/en/select.html), [`DELETE`](https://dev.mysql.com/doc/refman/5.6/en/delete.html), [`INSERT`](https://dev.mysql.com/doc/refman/5.6/en/insert.html), [`REPLACE`](https://dev.mysql.com/doc/refman/5.6/en/replace.html), 和 [`UPDATE`](https://dev.mysql.com/doc/refman/5.6/en/update.html)语句一起使用。

​		当EXPLAIN与MySQL一起使用时，**MySQL显示来自于优化器的有关于语句执行的信息**，也就是说，MySQL解释了它将如何处理该语句，包括有关表如何链接以及以何种顺序的链接信息。

<font color='red'>		**用我们自己的话来讲，就是我们可以通过EXPLAIN 语句帮我们查看，当前SQL是否命中索引，还有其中用到的索引和连表信息，执行顺序，查询行数啊，提供信息。**</font>



我执行一下这条SQL语句看看他有没有用到索引

```sql
EXPLAIN SELECT * FROM `INNODB_USER`
		WHERE AGE = 18  AND phone like '132%'
		AND USER_NAME like'令狐%' and id >1000;
```

很明显我们这个SQL是使用了索引，我们看看这个EXPLAIN执行计划里面的内容，这些字段都是什么意思呢？

我们虽然都用到了，我们就来了解一下这些字段的含义吧。



### EXPLAIN

我们就来简单看看EXPLAIN各个字段都代表什么含义吧：

##### select_type 根据这个字段可以看到当前查询类型，

	1.SIMPLE （简单SELECT, 不使用UNION 或者子查询）
	2.PRIMARY (子查询中最外层查询，查询中若包含任何复杂的子部分，最外层的select被标记为PRIMARY)
	3.UNION(UNION 中的第二个或者后面的SELECT语句)
	4.DEPENDENT UNION(子查询中的 UNION 查询第二个或后面的SELECT 语句，取决于外面的查询)
	5.UNION RESULT(UNION的结果，UNION语句中的第二个SELECT 开始后面的所有SELECT)
	6.SUBQUERY/MATERIALIZED (子查询中使用 = 和IN的区别，= 是SUBQUERY、 IN 是METARIALIZED )
	7.DEPENDENT SUBQUERY(子查询中的第一个SELECT,依赖于外部查询)
	8.DERIVED(派生表的SELECT * FROM (SELECT....)子句的子查询)
	9.UNCACHEABLE  SUBQUERY(一个子查询的结果不能被缓存，必须重新评估外链接的第一行 ，暂时没有找到体现的语句)
	10.UNCACHEABLE UNION (一个子查询的 UNION 属于不可缓存子查询，没有找到提现)

##### table

table: 这条数据是关于哪张表的查询

##### partitions

分区



##### TYPE(访问类型)

1. const：使用了主键索引，该表最多只有一个匹配行，在查询开始时读取。因为只有一行，所以这一行中的列的值可以被优化器的其余部分视为常量。CONST 表示 非常快，因为他们只被读取一次。或者是查询系统表。
2. ref：使用了二级索引，如果查询只使用最左前缀，<font color='red'>查找条件列使用了索引但是使用的不是主键或unique 。</font>
3. range： <font color='red'>使用了索引检索一个范围的行数据，</font> 意味着Range 已经走了索引，  一般能达到这个级别就OK了，一般是where 语句中存在 between，大于小于等于，in 等等的查询。
4. index：FULL INDEX SCAN <font color='red'>全索引扫描</font> / INDEX 与ALL 的区别就是INDEX类型只遍历索引树，没有去扫描整个链表。
5. all：FULL TABLE SCAN <font color='red'>全表扫描</font> / MySQL将遍历全表以找到匹配的行

**<font color='red'>打开Navicat演示 </font>**

```SQL
# 二级索引树建立 组合索引（复合索引、联合索引）
# 比如说我要根据年龄和用户名和电话去查数据
ALTER TABLE `INNODB_USER` 
		ADD INDEX SECOND_INDEX_AGE_USERNAME_PHONE
				(`age`,`user_name`,`phone`);
				
# TYPE 访问类型 COST
# 如果把一个主键放置到Where后面作为条件查询，MySQL优化器就能把这次查询
# 优化转换成一个常量啊，至于何时转换以及如何转换，取决于优化器。
EXPLAIN SELECT ID FROM `INNODB_USER`
	WHERE ID = 1;

# TYPE 访问类型 REF 使用了索引
# 查找条件列使用了索引但是使用的不是主键或unique 
EXPLAIN SELECT * FROM `INNODB_USER`
		WHERE AGE = 18;
		
# TYPE 访问类型 RANGE 使用了索引
# range指的是有范围的索引扫描 
# 使用一个索引来选择行，key列显示使用了哪个索引，
#一般就在你的where语句中出现between,in等类似的查询，
# 这种范围扫描索引扫描比全表扫描要好，因为它只需要开始于索引的某一点，而结束语另一点，不用扫描全部索引。
EXPLAIN SELECT * FROM `INNODB_USER`
		WHERE AGE = 18  AND phone like '132%'
		AND USER_NAME like'令狐%' and id >1000;

# TYPE 访问类型 INDEX 使用了索引
# 全索引扫描 ,index与ALL区别为index类型只遍历索引树，这通常比ALL快
# 也就是说虽然all和Index都是读全表，但index是从索引中读取的，而all是从硬盘中读取
EXPLAIN SELECT AGE FROM `INNODB_USER`
		WHERE AGE < 999 

# TYPE 访问类型 ALL 使用了索引
# 全表扫描 ,将遍历全表以找到匹配的行。
EXPLAIN SELECT * FROM `INNODB_USER`
		WHERE AGE < 999 
```

<span style="color:red">互动提问，那这么多类型中，哪个性能更好呢？const > ref > range > index > all</span>

性能 从上往下 越来越慢 开发要求必须在  range 及以上，最理想是 Ref

​		在互联网ToC端业务场景里我们一般要求查询语句在 10ms ~ 20ms SQL 就必须返回，如果没有返回就 不能够上限，你需要去优化，优化不了就找原因，如果是表设计的问题，看情况如果能命中索引就尽量去命中，命中不了，改不了就改需求，或者上ES，使用其他中间件解决。



##### possible_keys

possible_keys:  <span style="color:red">显示可能应用在这张表中的索引</span>，一个或多个 查询涉及到的字段上若存在索引，则该索引将被列出，但不一定被查询实际使用。

```mysql
EXPLAIN SELECT * FROM gp_teacher where teacher_age=18 and teacher_no>33  limit 1000
```



##### key

key :<span style="color:red">实际使用的索引</span>，如果为NULL 则没有使用索引。查询中若使用了覆盖索引，则该索引仅出现在key列表中,优先使用普通索引，然后使用主键索引

key_len:<span style="color:red">表示索引中使用的字节数</span>，可通过该列计算查询中使用索引的长度，<span style="color:red">在不损失精确性的情况下，长度越短越好。</span>



##### ref

~~显示索引的哪一列被使用了，如果可能的话，是一个常量，哪些列被用于查找索引列上的值。~~

Filtered 

百分比



##### ROWS(扫描的行数)

数据量越大，扫描越多，性能越低



##### Extra [ˈekstrə] （附加的信息）

1. ###### Using where 使用where 过滤

   - 仅表示是否存在where子句限制对结果集进行筛选后返回，要不要优化根据type一起考虑

2. ###### Using index 使用了覆盖索引，一般会出现在二级索引树里

   - 如果没有出现using where，仅表示是否使用了覆盖索引，即查询涉及字段均可以从一个索引中获得，单独的Using Index表示从索引中获取返回结果集即可直接作为最终结果返回。
   - Using where; Using index 表示sql使用了覆盖索引--所有字段均从一个索引中获取，同时在从索引中查询出初步结果后，还需要使用组成索引的部分字段进一步进行条件筛选，而不是说需要回表获取完整行数据--其实直觉上这种理解也更合理，因为Using index已经表示所有查询涉及字段都在索引里面包含了，压根没有什么额外字段需要再回表才能获取，那回表又有什么意义呢？

3. ###### Using filesort 排序没有用到索引

   - 查询的时候用到了索引，但是排序的时候没有用到，导致sql用到文件排序

4. ###### Using index condition 索引下推

   - 使用二级索引 ,查找使用了索引，但是需要回表查询数据

   - 因为我们这里select * 查找的是所有字段,而我们的字段d是没有创建索引的,我们无法直接从索引树取数据,需要回表.

     大家还记不记得索引下推：5.6以后完善的功能，只适用于二级索引。其实就是把过滤的动作在存储引擎做完，而不需要到Server层过滤。



总结下：explain执行计划中的各个字段都分析过了，type，key，extra尤为重要，现在大家已经知道怎么去分析一条SQL有没有用到索引了。





## 索引失效

​		ok，明白了原理，我们再回到<font color='cornflowerblue'>面试题</font>，来分析下哪个字段用到了索引，说道到合索引，我们平时听得最多的就是索引的最左匹配原则。

1. <span style="color:red">什么是最左匹配？</span>查询语句的where条件中的查询字段，有没有包含联合索引中最左边的列

   这个定义可能还是比较难理解

   <span style="color:red">互动提问:那我问下大家abc这个联合索引最左边的列是什么？</span>

   接着来分析我们的sql语句,我们到底该怎么看呢?首先我们来看下 

   ```mysql
   SELECT * FROM test WHERE  c=1 AND a = 1 AND b > 1
   ```

   <span style="color:red">互动提问:where条件 有没有a ？</span>

   有a,那肯定是能走a索引的，那么如果是没有a的情况，会不会走索引呢？找个同学来回答下，我们来验证下

   ```mysql
   EXPLAIN SELECT * FROM test WHERE  c=1
   ```

   从这条sql中我们可以看出如果where条件中没有a是不会走索引的，因为不满足最左匹配

   那我们再看下另外一种情况，我把这个sql语句稍微改下

   <span style="color:red">如果没有b,只有a c ，那有没有走索引？哪些字段走索引了？</span>

   ```mysql
   SELECT * FROM test WHERE a= 1 and c=1
   ```

   联合索引有没有走？我们是不是先检查where条件中有没有a， 有a，那是不是走了a，ab，abc中的a，所以肯定走了联合索引

   那我们再看有没有 b ，没有b，那b就不会走索引

   那我们接着看有没有c，有c，那c有没有走索引？我们现在只需要确认c到底有没有走索引，我们可以用个示例验证下

   ```mysql
   SELECT * FROM test WHERE a= 1;
   
   SELECT * FROM test WHERE a= 1 AND c= 1;
   
   EXPLAIN SELECT * FROM test WHERE a= 1 and c=1;
   ```

   经过我们的验证，c并没有走索引，c 为什么没走索引呢？因为我们的索引是按a，ab，abc这样的顺序执行的，b既然已经中断，没有走索引，那b后面的c肯定不会走索引。

   那我们再回到刚刚的面试题，a，b都走了索引，那么按照我们的理解，索引顺序执行，c是不是也要走索引呢？那到底C有没有走！！！同样我们是不是也可以用explain来验证下

   ```mysql
   EXPLAIN SELECT * FROM test WHERE  c=1 AND a =2 AND b > 1;  
   
   EXPLAIN SELECT * FROM test WHERE a =2 AND b > 1;  --有没有C，rows都是一样的，所以确定C是没走索引的
   ```

   <span style="color:red">那么为什么明明没有中断，c还是没走索引呢？</span>

   当查询条件中出现某个列是范围查询的，存储引擎不能使用复合索引中该列其后的所有列。b>1是个范围，c所以是没走

   那我说的到底对不对呢？同样我们也来验证下。我们把这个面试题改造下

   反例：EXPLAIN SELECT * from test WHERE c=1 and a =2 AND b > 1;-- 范围查询row是6条

   ```MYSQL
   EXPLAIN SELECT * FROM test WHERE  c=1 AND a =2 AND b = 3;-- 这个是C走了索引的，因为不是范围
   ```

   除了上面说的举例的>号以外，比如!= <> IS NOT NULL  < 等范围条件查找，也会导致下一个索引列失效！！！

   除了使下一个索引列失效外，还有当前索引列也失效的情况:

   

2. 查询条件中某列使用LIKE 然后百分号前置会导致索引失效，存储引擎不能使用索引中改列的索引以及后面所有列也不使用索引。

3. 查询条件中某列使用了系统函数，存储引擎不能使用索引的该列以及后面的所有列。

4. 查询条件中某列使用类型转换的（包括显示的和隐式的）比如，idcard = 445381200209066666  将INT 型转换为字符串类型。

5. 使用了范围索引比如 <=> !=  IS NULL IS NOT ,比如在列上做计算等。

6. 比如说联合索引的索引桥，没有正常命中和通过。

 比较容易忽略的点：

​	1.查询数据超过30% （这是一个预估值，并不准确）

​	2.最左的索引字段满足上面的 2.3.4。





## MySQL索引优化总结，避免索引失效

### 索引失效常见问题

1.索引列上发生了类型转换比如 IDCARD = '44538120010690232' 实际传递了 44538120010690232，出现了隐式或者强制转换。

2.索引列上发生了计算比如：SELECT id FROM TABLE WHERE AGE + 1 = 18。

3.索引列上使用了系统函数，比如 WHERE REMARK IS NULL  等等。

4.索引列上使用了范围查询，比如 > < = != between or 等等。

5.索引列上使用了Like 百分号前置，比如 like '%xxx'。

6.比如联合索引桥，最左匹配原则，其实就是索引桥原理，联合索引是根据我们创建索引的顺序去决定的，从左到右行成索引桥，假如ABC 你需要命中A 再命中B 再命中C，不可以跳过A 去命中BC，同理不能跳过AB去命中C。如果有任何一个索引使用了范围查询会导致当前列后面的索引失效，如果使用了like 百分号前置会导致当前索引列名和之后的索引失效。

​     	**其实这个是由于我们索引树存储数据的方式去决定的，使用了某些系统函数，或者是在索引列上做计算，会导致表扫描，使得我们没办法命中我们的索引树，至于到底是否失效，这个跟数据库版本，表内数据的具体情况由我们的的优化器去决定的，我们说了不算，要具体问题，具体分析。**



### 建立合适的索引

​	1.离散度低的不要建立索引

​	2.进来建立联合索引，减少索引树；优先建立where与order by 联合索引

### 尽量用覆盖索引，减少回表

### 拿不准的语句先去线上预先执行

### 减少表关联 

### 每次返回数据一定要控制 不能 SELECT  * 



## 4.4 MySQL 调优

### 4.4.1 什么情况下需要调优

预调优、出现问题才会去调优！没有问题，监控维护就好了。

#### 慢日志查询

首先，我们为什么要优化，肯定是执行时间太慢，并发能力上不去。所以，我们需不需要优化，第一，我们看我们执行的时间是否满足我们的需求。

但是，我们不能经常人为的去查看我们sql的执行时间，所以有没有地方可以看到我哪些查询或者哪些操作是比较慢的。



那么这个功能就是我们的慢日志查询：

官网介绍：https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html

慢速查询日志由执行时间超过 [`long_query_time`](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_long_query_time)几秒并且至少需要 [`min_examined_row_limit`](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_min_examined_row_limit)检查行的 SQL 语句组成

所以，慢查有几个很重要的参数。

##### 慢日志参数

###### **slow_query_log开关**   

```mysql
SELECT @@slow_query_log;
```

是否开启慢查：默认情况下是关闭的，我们可以通过

```mysql
SET GLOBAL slow_query_log=1;  -- 开启慢查
```



###### **long_query_time慢时间**

官网说明：https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_long_query_time

必须超过这个值才是慢查

```mysql
SELECT @@long_query_time;   -- 默认是10  单位s

SET GLOBAL long_query_time=1; -- 设置超过1s就算慢查
```



###### **min_examined_row_limit检索数量**

官网说明：https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_min_examined_row_limit

检索查询的数量的行如果低于这个值，不进入慢查。

```mysql
SELECT @@min_examined_row_limit;  -- 默认是 0
```



###### **log_slow_admin_statements** 

慢查默认不包括管理语句，比如创建表、创建索引等等

```mysql
SELECT @@log_slow_admin_statements
```

开启

```mysql
SET GLOBAL log_slow_admin_statements=1; 
```



###### **log_queries_not_using_indexes**

默认也不记录不使用索引的慢查，可以用log_queries_not_using_indexes来进行开启

```mysql
SELECT @@log_queries_not_using_indexes;
```

开启：

```mysql
SET  @@GLOBAL.log_queries_not_using_indexes=1;
```



###### **log_output**

日志保存方式，FILE 或 TABLE， 也可以TABLE,FILE  

或者NONE   代表禁用日志写入

table是将慢日志添加至表中，FILE是将慢日志添加至慢日志文件

```mysql
SELECT @@log_output;  -- 慢查存在哪里

SET GLOBAL log_output='table,file';   -- 比如我希望2边都保存
```



如果是file，那么保存的文件路径为slow_query_log_file

```mysql
SELECT @@slow_query_log_file;
SET GLOBAL slow_query_log_file='/var/lib/mysql/default-slow.log';
```



如果是表，则保存在mysql.slow_log表中

假如，我去查询

```mysql
SELECT * FROM INNODB_USER;  -- 需要19s+
```



###### **general_log**

普通查询默认关闭 （不是慢查）

```mysql
show variables like 'general_log'; 

set GLOBAL general_log=0;
```



普通查询储存地址：

```mysql
SELECT @@general_log_file;
```



如果是保存在表中，则保存在mysql.general_log



我们发现在表里面的慢查好像是一些二进制的方式，那么有没有分析慢查的一些东西？



#### 慢日志分析

##### 表分析

查询mysql.slow_log表，慢查在我们的慢查表中

![image-20230407160524012](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230407160524012.png)



我们发现，sql_text是一些二进制，我们需要给他转码一下

```mysql
SELECT *,CONVERT(sql_text using utf8) FROM slow_log
```





##### 文件分析

官网其实有提供分析慢查的指令，就是mysqldumpslow

官网地址：https://dev.mysql.com/doc/refman/8.0/en/mysqldumpslow.html

```mysql
[root@localhost mysql]# mysqldumpslow --help
Usage: mysqldumpslow [ OPTS... ] [ LOGS... ]

Parse and summarize the MySQL slow query log. Options are

  --verbose    verbose
  --debug      debug
  --help       write this text to standard output

  -v           verbose
  -d           debug
  -s ORDER     what to sort by (al, at, ar, c, l, r, t), 'at' is default  -- 排字段
                al: average lock time
                ar: average rows sent
                at: average query time
                 c: count
                 l: lock time
                 r: rows sent
                 t: query time
  -r           reverse the sort order (largest last instead of first)
  -t NUM       just show the top n queries   -- 获取前几条
  -a           don't abstract all numbers to N and strings to 'S'
  -n NUM       abstract numbers with at least n digits within names
  -g PATTERN   grep: only consider stmts that include this string
  -h HOSTNAME  hostname of db server for *-slow.log filename (can be wildcard),
               default is '*', i.e. match all
  -i NAME      name of server instance (if using mysql.server startup script)
  -l           don't subtract lock time from total time

```



**查询（不需要进入shell客户端）**

```mysql
[root@localhost mysql]# mysqldumpslow -s t -t 10 '/var/lib/mysql/localhost-slow.log'

Reading mysql slow query log from /var/lib/mysql/localhost-slow.log
Count: 1  Time=15.00s (15s)  Lock=0.00s (0s)  Rows=1.0 (1), root[root]@[192.168.8.23]
  SELECT SLEEP(N)

Count: 3  Time=0.63s (1s)  Lock=0.00s (0s)  Rows=61440.0 (184320), root[root]@[192.168.8.23]
  SELECT * from product WHERE product_price=N

Count: 1  Time=1.37s (1s)  Lock=0.00s (0s)  Rows=470016.0 (470016), root[root]@[192.168.8.129]
  SELECT * FROM product_new where product_price>N

Count: 13  Time=0.00s (0s)  Lock=0.00s (0s)  Rows=14.2 (184), root[root]@[192.168.8.23]
  SELECT QUERY_ID, SUM(DURATION) AS SUM_DURATION FROM INFORMATION_SCHEMA.PROFILING GROUP BY QUERY_ID

Count: 10  Time=0.00s (0s)  Lock=0.00s (0s)  Rows=0.0 (0), root[root]@[192.168.8.23]
  SELECT * FROM `slow_log` LIMIT N, N

Count: 1  Time=0.00s (0s)  Lock=0.00s (0s)  Rows=0.0 (0), root[root]@[192.168.8.23]
  SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing, DEFINER FROM information_schema.triggers WHERE BINARY event_object_schema='S' AND BINARY event_object_table='S'

Died at /usr/bin/mysqldumpslow line 162, <> chunk 28.

```



我们就能很清晰的知道，我们的mysql实例有哪些是慢查，也可以根据自己的业务场景来定义自己到底多慢才算是慢查。





### 4.4.2 MySQL调优

#### 4.4.2.1 硬件层面优化

> 钞能力，

- **CPU、内存、带宽**
- **主从、多主多从等集群**



#### 4.4.2.2 数据库层面优化

##### 表结构-基于使用场景去优化

- 选择合适的存储引擎
- 读多写少
  - 高速缓存，防止缓存击穿
  - 表冗余和内嵌
  - 读写分离、一主多从(多组复制)
  - 主从复制、（延时的问题可以通过  数据冗余、使用缓存DB 双写、直接查主库）
- 写多读少
  - 删除不必要索引
  - 调整MySQL参数
    - innodb_flush_log_at_trx_commit =  2 （1 性能最高 2 最差 3适中）落盘
    - temp_table_size,heap_table_size  临时表空间、调整缓冲区大小
    -  innodb_data_file_path=ibdata1:1G;ibdata2:64M:autoextend  调整 表空间大小 
    - innodb_log_file_size,innodb_log_files_in_group,innodb_log_buffer_size  redo log 和buffer pool大小
    -  innodb_thread_concurrency=16 调整线程数（CPU 核心数 *2）
    -  write_buffer_size  写缓存
    - innodb_buffer_pool_instance 缓冲池个数
    - 关闭bin log
  - 减少磁盘IO，提高磁盘读写效率
    - 多主互备
  - 拆表
    - 冷热拆分
  - 机器升级
- 分库分表
  - 什么时候去拆，为什么去拆，怎么去拆



● 最频繁的数据查询模式  通过冗余和内嵌的方式设计

● 最常用的查询参数     根据业务需求创建索引

● 最频繁的数据写入模式  使用中间表和冗余表来避免性能瓶颈

● 读写操作的比例       使用冗余来优化读访问性能

● 数据量的大小 决定我们是否需要进行 分库分表



##### 设计模式

预聚合、近似计算





##### INNODB 存储引擎优化

- Buffer Pool 大小
  - SET GLOBAL innodb_buffer_pool_size=402653184;   -- 建议可以使用机器的50%-70%的内存
- 增加RedoLog 大小
- 隔离级别优化
  - 判断是否可以采取更低的隔离级别





#### 4.4.2.3 SQL优化

##### 高效的SQL语句

```
https://tech.meituan.com/2014/06/30/mysql-index.html
```

​		包括使用合适的查询语句、避免使用不必要的关联或子查询、使用索引等

###### 读：

**不能命中索引的搜索和内存排序是导致性能的主要原因**

###### 写：

**读写的IO能力必须也要跟上**



##### 合理使用索引

##### 避免索引失效的场景

 





### 4.4.3 B+ 树索引的使用

#### 4.4.3.1 索引的代价

- **空间上的代价**

​		这个是显而易见的，每建立一个索引都要为它建立一棵B+树，每一棵B+树的每一个节点都是一个数据页，一个页默认会占用16KB的存储空间，一棵很大的B+树由 许多数据页组成，那可是很大的一片存储空间呢。

- **时间上的代价**

​		每次对表中的数据进行增、删、改操作时，都需要去修改各个B+树索引。 

**一个表上索引建的越多，就会占用越多的存储空间，在增删改记录的时候性能就越差。**



#### 4.4.3.2 B+ 树索引适用条件

B+树索引并不是万能的，并不是所有的查询语句都能用 到我们建立的索引。是否命中索引跟我们 数据在磁盘上物理行的顺序去决定的。

```sql
CREATE TABLE person_info(
    id INT NOT NULL auto_increment,
    name VARCHAR(100) NOT NULL,
    birthday DATE NOT NULL,
    phone_number CHAR(11) NOT NULL,
    country varchar(100) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_name_birthday_phone_number (name, birthday, phone_number)
); 
```

对于这个person_info表我们需要注意两点： 

- 表中的主键是id列，它存储一个自动递增的整数。所以InnoDB存储引擎会自动为id列建立聚簇索引。

- 我们额外定义了一个二级索引 idx_name_birthday_phone_number，它是由3个列组成的联合索引。所以在这个索引对应的B+树的叶子节点处存储的用户记录只保 留name、birthday、phone_number这三个列的值以及主键id的值，并不会保存country列的值。

一个表中有多少索引就会建立多少棵B+树，person_info表会为聚簇索引（主键索引）idx_name_birthday_phone_number索引建立2棵B+树。我们画一下索引idx_name_birthday_phone_number的示意图，样（留心的同学看出来了，这其实和《高性能MySQL》里举的例子的图差不多，我 觉得这个例子特别好，所以就借鉴了一下）：

![image-20230630162559082](令狐老师-MySQL专题-MySQL索引 - 副本.assets/image-20230630162559082-16881135599691.png)

为了方便大家理解，我们特意标明了哪些是内节点，哪些是叶子节点。再次强调一下，内节点中存储的是目录项记录，叶子节点中存储的是用户记录（由于不是聚簇索 引，所以用户记录是不完整的，缺少country列的值）。从图中可以看出，这个idx_name_birthday_phone_number索引对应的B+树中页面和记录的排序方式就是这样 的：

- 先按照name列的值进行排序。 
- 如果name列的值相同，则按照birthday列的值进行排序。
- 如果birthday列的值也相同，则按照phone_number的值进行排序。



这个排序方式很重要，因为页面和记录是排好序的，所以通过二分法来快速定位查找。下边的内容都仰仗这个图了，大 家对照着图理解。



##### 全值匹配

如果我们的搜索条件中的列和索引列一致的话，这种情况就称为全值匹配，比方说下边这个查找语句：

```
SELECT * FROM person_info WHERE name = 'Ashburn' AND birthday = '1990-09-27' AND phone_number = '15123983239';
```

idx_name_birthday_phone_number 索引包含的3个列在这个查询语句中都展现出来了。大家可以想象一下这个查询过程：

- 因为B+树的数据页和记录先是按照name列的值进行排序的，所以先可以很快定位name列的值是Ashburn的记录位置。

- 在name列相同的记录里又是按照birthday列的值进行排序的，所以在name列的值是Ashburn的记录里又可以快速定位birthday列的值是'1990-09-27'的记录。

- 如果很不幸，name和birthday列的值都是相同的，那记录是按照phone_number列的值排序的，所以联合索引中的三个列都可能被用到。

SQL中where子句的搜索条件 的顺序 不影响索引命中，因为有优化器啊。



##### 匹配左边的列(最左匹配)

```sql
SELECT * FROM person_info WHERE name = 'Ashburn';
```

或者包含多个左边的列也行：

```sql
SELECT * FROM person_info WHERE name = 'Ashburn' AND birthday = '1990-09-27';
```

那为什么搜索条件中必须出现左边的列才可以使用到这个B+树索引呢？比如下边的语句就用不到这个B+树索引么？

SELECT * FROM person_info WHERE birthday = '1990-09-27'; 因为B+树的数据页和记录先是按照name列的值排序的，在name列的值相同的情况下才使用birthday列进行排序，也就是说name列的值不同的记录 中birthday的值可能是无序的。而现在你跳过name列直接根据birthday的值去查找，臣妾做不到呀～ 那如果我就想在只使用birthday的值去通过B+树索引进行查找咋 办呢？这好办，你再对birthday列建一个B+树索引就行了，创建索引的语法不用我唠叨了吧。

**<font color='red'>如果我们想使用联合索引中尽可能多的列，搜索条件中的各个列必须是联合索引中从最左边连续的列。</font>**

比方说联合索 引idx_name_birthday_phone_number中列的定义顺序是name、birthday、phone_number，如果我们的搜索条件中只有name和phone_number，而没有中间的birthday， 比方说这样： SELECT * FROM person_info WHERE name = 'Ashburn' AND phone_number = '15123983239'; 

这样只能用到name列的索引，birthday和phone_number的索引就用不上了，因为name值相同的记录先按照birthday的值进行排序，birthday值相同的记录才按 照phone_number值进行排序。

##### 匹配列前缀

我们前边说过为某个列建立索引的意思其实就是在对应的B+树的记录中使用该列的值进行排序，比方说person_info表上建立的联合索 引idx_name_birthday_phone_number会先用name列的值进行排序，所以这个联合索引对应的B+树中的记录的name列的排列就是这样的：

Aaron Aaron ... Aaron Asa Ashburn ... Ashburn Baird Barlow ... Barlow

字符串排序的本质就是比较哪个字符串大一点儿，哪个字符串小一点，比较字符串大小就用到了该列的字符集和比较规则，这里需要注意的是，一般的比较规则都是逐个比较字符的大小，也就是说我们比较两个字符串的大小的过程其实是这样的：

- 先比较字符串的第一个字符，第一个字符小的那个字符串就比较小。 
- 如果两个字符串的第一个字符相同，那就再比较第二个字符，第二个字符比较小的那个字符串就比较小。 
- 如果两个字符串的第二个字符也相同，那就接着比较第三个字符，依此类推。

所以一个排好序的字符串列其实有这样的特点：

- 先按照字符串的第一个字符进行排序。 
- 如果第一个字符相同再按照第二个字符进行排序。 
- 如果第二个字符相同再按照第三个字符进行排序，依此类推。

也就是说这些字符串的前n个字符，也就是前缀都是排好序的，所以对于字符串类型的索引列来说，我们只匹配它的前缀也是可以快速定位记录的，比方说我们想查询 名字以'As'开头的记录，那就可以这么写查询语句： SELECT * FROM person_info WHERE name LIKE 'As%'; 

但是需要注意的是，如果只给出后缀或者中间的某个字符串，

比如这样： SELECT * FROM person_info WHERE name LIKE '%As%';

MySQL就无法快速定位记录位置了，因为字符串中间有'As'的字符串并没有排好序，所以只能全表扫描了。有时候我们有一些匹配某些字符串后缀的需求，比方说某个 表有一个url列，该列中存储了许多url：

```
+----------------+
| url 			|
+----------------+
| www.baidu.com |
| www.google.com|
| www.gov.cn 	|
| ... 			|
| www.wto.org 	|
+----------------+
```

如果我们想查询以com为后缀的网址的话可以这样写查询条件：WHERE url LIKE '%com'，但是这样的话无法使用该url列的索引。为 了在查询时用到这个索引而不至于全表扫描，我们可以把后缀查询改写成前缀查询，不过我们就得把表中的数据全部逆序存储一下，也就是说我们可以这样保存url列 中的数据：

```
+----------------+
| url            |
+----------------+
| moc.udiab.www  |
| moc.elgoog.www |
| nc.vog.www  	 |
| ... 		     |
| gro.otw.www    |
+----------------+
```

这样再查找以com为后缀的网址时搜索条件便可以这么写：WHERE url LIKE 'moc%'，这样就可以用到索引了。

##### 匹配范围值

回头看我们idx_name_birthday_phone_number索引的B+树示意图，<font color='red'>所有记录都是按照索引列的值从小到大的顺序排好序的</font>，所以这极大的方便我们查找索引列的值在 某个范围内的记录。比方说下边这个查询语句：

```sql
SELECT * FROM person_info WHERE name > 'Asa' AND name < 'Barlow';
```

由于B+树中的数据页和记录是先按name列排序的，所以我们上边的查询过程其实是这样的：

- 找到name值为Asa的记录。 
- 找到name值为Barlow的记录。
- 哦啦，由于所有记录都是由链表连起来的（记录之间用单链表，数据页之间用双链表），所以他们之间的记录都可以很容易的取出来喽～ 找到这些记录的主键值，再到聚簇索引中回表查找完整的记录。

如果对多个列同时进行范围查找的话，只有对索引最左边的那个列进行范围查找的时候才能用到B+树，因为其他列的排序方式和第一个列排序字段是不一样的，所以数据也是乱序无法使用索引。

```sql
SELECT * FROM person_info WHERE name > 'Asa' AND name < 'Barlow' AND birthday > '1980-01-01';
```

上边这个查询可以分成两个部分：

1. 通过条件name > 'Asa' AND name < 'Barlow'来对name进行范围，查找的结果可能有多条name值不同的记录。 
2. 对这些name值不同的记录继续通过birthday > '1980-01-01'条件继续过滤。

对于联合索引idx_name_birthday_phone_number来说，只能用到name列的部分，而用不到birthday列的部分，因为只有name值相同的情况下才能用birthday列 的值进行排序，而这个查询中<font color='red'>通过name进行范围查找的记录中可能并不是按照birthday列进行排序的</font>，所以在搜索条件中继续以birthday列进行查找时是用不到这 个B+树索引的。



##### 精确匹配某一列并范围匹配另外一列

对于同一个联合索引来说，虽然对多个列都进行范围查找时只能用到最左边那个索引列，但是如果左边的列是精确查找，则右边的列可以进行范围查找，比方说这 样： 

```sql
SELECT * FROM person_info WHERE name = 'Ashburn' AND birthday > '1980-01-01' AND birthday < '2000-12-31' AND phone_number > '15100000000'; 
```



这个查询的条件可以分为3个部分：

1. name = 'Ashburn'，对name列进行精确查找，当然可以使用B+树索引了。 
2. birthday > '1980-01-01' AND birthday < '2000-12-31'，由于name列是精确查找，所以通过name = 'Ashburn'条件查找后得到的结果的name值都是相同的， 它们会再按照birthday的值进行排序。所以此时对birthday列进行范围查找是可以用到B+树索引的。
3. phone_number > '15100000000'，通过birthday的范围查找的记录的birthday的值可能不同，所以这个条件无法再利用B+树索引了，只能遍历上一步查询得到的 记录。 

同理，下边的查询也是可能用到这个idx_name_birthday_phone_number联合索引的：

```sql
SELECT * FROM person_info WHERE name = 'Ashburn' AND birthday = '1980-01-01' AND phone_number > '15100000000';
```



##### 用于排序

​		我们在写查询语句的时候经常需要对查询出来的记录通过ORDER BY子句按照某种规则进行排序。一般情况下，我们只能把记录都加载到内存中，再用一些排序算法， 比如快速排序、归并排序、吧啦吧啦排序等等在内存中对这些记录进行排序，有的时候可能查询的结果集太大以至于不能在内存中进行排序的话，还可能暂时借助磁 盘的空间来存放中间结果，排序操作完成后再把排好序的结果集返回到客户端。

​		内存中或者磁盘上进行排序的方式统称为文件排序（英文 名：filesort），跟文件这个词儿一沾边儿，就显得这些排序操作非常慢了（磁盘和内存的速度比起来，就像是飞机和蜗牛的对比）。但是如果ORDER BY子句里使用到 了我们的索引列，就有可能省去在内存或文件中排序的步骤，比如下边这个简单的查询语句：

```sql
SELECT * FROM person_info ORDER BY name, birthday, phone_number LIMIT 10;
```

​		先按照name值排序，如果记录的name值相同，则需要按照birthday来排序，如果birthday的值相同，则需要按照phone_number排序。大家可以 回过头去看我们建立的idx_name_birthday_phone_number索引的示意图，因为这个B+树索引本身就是按照上述规则排好序的，所以直接从索引中提取数据，然后进 行回表操作取出该索引中不包含的列就好了。简单吧？是的，索引就是这么牛逼。



###### 使用联合索引进行排序注意事项

ORDER BY的子句后边的列的顺序也必须按照索引列的顺序给出，如果给出ORDER BY phone_number, birthday, name的顺序，那也是 用不了B+树索引，这种颠倒顺序就不能使用索引。

同理ORDER BY name、ORDER BY name, birthday这种匹配索引左边的列的形式可以使用部分的B+树索引。当联合索引左边列的值为常量，也可以使用后边的列进行 排序，比如这样： SELECT * FROM person_info WHERE name = 'A' ORDER BY birthday, phone_number LIMIT 10;



###### 不可以使用索引进行排序的几种情况

**ASC、DESC混用**

对于使用联合索引进行排序的场景，我们要求各个排序列的排序顺序是一致的，也就是要么各个列都是ASC规则排序，要么都是DESC规则排序。 

小贴士： 

ORDER BY子句后的列如果不加ASC或者DESC默认是按照ASC排序规则排序的，也就是升序排序的。

为啥会有这种奇葩规定呢？这个还得回头想想这个idx_name_birthday_phone_number联合索引中记录的结构：

- 先按照记录的name列的值进行升序排列。 
- 如果记录的name列的值相同，再按照birthday列的值进行升序排列。 
- 如果记录的birthday列的值相同，再按照phone_number列的值进行升序排列。

如果查询中的各个排序列的排序顺序是一致的，比方说下边这两种情况：

- ORDER BY name, birthday LIMIT 10 

这种情况直接从索引的最左边开始往右读10行记录就可以了。 

- ORDER BY name DESC, birthday DESC LIMIT 10， 

这种情况直接从索引的最右边开始往左读10行记录就可以了。



但是如果我们查询的需求是先按照name列进行升序排列，再按照birthday列进行降序排列的话，比如说这样的查询语句：

```sql
SELECT * FROM person_info ORDER BY name, birthday DESC LIMIT 10;
```

这样如果使用索引排序的话过程就是这样的：

- 先从索引的最左边确定name列最小的值，然后找到name列等于该值的所有记录，然后从name列等于该值的最右边的那条记录开始往左找10条记录。 
- 如果name列等于最小的值的记录不足10条，再继续往右找name值第二小的记录，重复上边那个过程，直到找到10条记录为止。

​		这样不能高效使用索引，而要采取更复杂的算法去从索引中取数据，设计MySQL的大叔觉得这样还不如直接文件排序来的快，所以就规定使用联合 索引的各个排序列的排序顺序必须是一致的。

**WHERE子句中出现非排序使用到的索引列** 

如果WHERE子句中出现了非排序使用到的索引列，那么排序依然是使用不到索引的，比方说这样： 

```sql
SELECT * FROM person_info WHERE country = 'China' ORDER BY name LIMIT 10;
```

这个查询只能先把符合搜索条件country = 'China'的记录提取出来后再进行排序，是使用不到索引。注意和下边这个查询作区别：

```sql
SELECT * FROM person_info WHERE name = 'A' ORDER BY birthday, phone_number LIMIT 10;
```

虽然这个查询也有搜索条件，但是name = 'A'可以使用到索引idx_name_birthday_phone_number，而且过滤剩下的记录还是按照birthday、phone_number列排序的， 所以还是可以使用索引进行排序的。

**排序列包含非同一个索引的列**

有时候用来排序的多个列不是一个索引里的，这种情况也不能使用索引进行排序，比方说：

```sql
SELECT * FROM person_info ORDER BY name, country LIMIT 10;
```

name和country并不属于一个联合索引中的列，所以无法使用索引进行排序  

**排序列使用了复杂的表达式**

要想使用索引进行排序操作，必须保证索引列是以单独列的形式出现，而不是修饰过的形式，比方说这样： 

```sql
SELECT * FROM person_info ORDER BY UPPER(name) LIMIT 10; 
```

使用了UPPER函数修饰过的列就不是单独的列啦，这样就无法使用索引进行排序啦。

##### 用于分组

有时候我们为了方便统计表中的一些信息，会把表中的记录按照某些列进行分组。比如下边这个分组查询：

```sql
SELECT name, birthday, phone_number, COUNT(*) FROM person_info GROUP BY name, birthday, phone_number
```

这个查询语句相当于做了3次分组操作：

1. 先把记录按照name值进行分组，所有name值相同的记录划分为一组。 
2. 将每个name值相同的分组里的记录再按照birthday的值进行分组，将birthday值相同的记录放到一个小分组里，所以看起来就像在一个大分组里又化分了好多小 分组。 
3. 再将上一步中产生的小分组按照phone_number的值分成更小的分组，所以整体上看起来就像是先把记录分成一个大分组，然后把大分组分成若干个小分组，然后把 若干个小分组再细分成更多的小小分组。

如果没有索引的话，这个分组过程全部需要在内存里实现，而如果 有了索引的话，恰巧这个分组顺序又和我们的B+树中的索引列的顺序是一致的，而我们的B+树索引又是按照索引列排好序的，这不正好么，所以可以直接使用B+树索 引进行分组。

和使用B+树索引进行排序是一个道理，分组列的顺序也需要和索引列的顺序一致，也可以只使用索引列中左边的列进行分组



##### 回表的代价

```sql
SELECT * FROM person_info WHERE name > 'Asa' AND name < 'Barlow';
```

在使用idx_name_birthday_phone_number索引进行查询时大致可以分为这两个步骤：

1. 从索引idx_name_birthday_phone_number对应的B+树中取出name值在Asa～Barlow之间的用户记录。
2. 由于索引idx_name_birthday_phone_number对应的B+树用户记录中只包含name、birthday、phone_number、id这4个字段，而查询列表是*，意味着要查询表中所 有字段，也就是还要包括country字段。这时需要把从上一步中获取到的每一条记录的id字段都到聚簇索引对应的B+树中找到完整的用户记录，也就是我们通常 所说的回表，然后把完整的用户记录返回给查询用户。

由于索引idx_name_birthday_phone_number对应的B+树中的记录首先会按照name列的值进行排序，所以值在Asa～Barlow之间的记录在磁盘中的存储是相连的，集中分 布在一个或几个数据页中，我们可以很快的把这些连着的记录从磁盘中读出来，这种读取方式我们也可以称为顺序I/O。根据第1步中获取到的记录的id字段的值可能并 不相连，而在聚簇索引中记录是根据id（也就是主键）的顺序排列的，所以根据这些并不连续的id值到聚簇索引中访问完整的用户记录可能分布在不同的数据页中， 这样读取完整的用户记录可能要访问更多的数据页，这种读取方式我们也可以称为随机I/O。一般情况下，顺序I/O比随机I/O的性能高很多，所以步骤1的执行可能很 快，而步骤2就慢一些。

所以这个使用索引idx_name_birthday_phone_number的查询有这么两个特点：

- 会使用到两个B+树索引，一个二级索引，一个聚簇索引。
- 访问二级索引使用顺序I/O，访问聚簇索引使用随机I/O。



**<font color='red'>需要回表的记录越多，使用二级索引的性能就越低</font>**，甚至让某些查询宁愿使用全表扫描也不使用二级索引。比方说name值在Asa～Barlow之间的用户记录数量占全部记 录数量90%以上，那么如果使用idx_name_birthday_phone_number索引的话，有90%多的id值需要回表，这不是吃力不讨好么，还不如直接去扫描聚簇索引（也就是全 表扫描）。



那什么时候采用全表扫描的方式，什么时候使用采用二级索引 + 回表的方式去执行查询呢？这个就是传说中的查询优化器做的工作，查询优化器会事先对表中的记录计 算一些统计数据，然后再利用这些统计数据根据查询的条件来计算一下需要回表的记录数，需要回表的记录数越多，就越倾向于使用全表扫描，反之倾向于使用二级索 引 + 回表的方式。当然优化器做的分析工作不仅仅是这么简单，但是大致上是个这个过程。一般情况下，限制查询获取较少的记录数会让优化器更倾向于选择使用二级 索引 + 回表的方式进行查询，因为回表的记录越少，性能提升就越高，比方说上边的查询可以改写成这样：



SELECT * FROM person_info WHERE name > 'Asa' AND name < 'Barlow' LIMIT 10; 添加了LIMIT 10的查询更容易让优化器采用二级索引 + 回表的方式进行查询。

 对于有排序需求的查询，上边讨论的采用全表扫描还是二级索引 + 回表的方式进行查询的条件也是成立的，比方说下边这个查询： SELECT * FROM person_info ORDER BY name, birthday, phone_number; 

由于查询列表是*，所以如果使用二级索引进行排序的话，需要把排序完的二级索引记录全部进行回表操作，这样操作的成本还不如直接遍历聚簇索引然后再进行文件 排序（filesort）低，所以优化器会倾向于使用全表扫描的方式执行查询。如果我们加了LIMIT子句，比如这样：

```sql
SELECT * FROM person_info ORDER BY name, birthday, phone_number LIMIT 10; 
```

这样需要回表的记录特别少，优化器就会倾向于使用二级索引 + 回表的方式执行查询。



##### 覆盖索引

为了彻底告别回表操作带来的性能损耗，我们建议：<font color='red'>最好在查询列表里只包含索引列</font>，比如这样：

```sql
SELECT name, birthday, phone_number FROM person_info WHERE name > 'Asa' AND name < 'Barlow'
```

因为我们只查询name, birthday, phone_number这三个索引列的值，所以在通过idx_name_birthday_phone_number索引得到结果后就不必到聚簇索引中再查找记录的剩余 列，也就是country列的值了，这样就省去了回表操作带来的性能损耗。我们把这种只需要用到索引的查询方式称为索引覆盖。排序操作也优先使用覆盖索引的方式进行查 询，比方说这个查询：

```sql
SELECT name, birthday, phone_number FROM person_info ORDER BY name, birthday, phone_number;
```

虽然这个查询中没有LIMIT子句，但是采用了覆盖索引，所以查询优化器就会直接使用idx_name_birthday_phone_number索引进行排序而不需要回表操作了。

当然，如果业务需要查询出索引以外的列，那还是以保证业务需求为重。但是我们很不鼓励用*号作为查询列表，最好把我们需要查询的列依次标明。



##### 如何挑选索引

1.考虑列的基数

2.索引列的类型尽量小

3.索引字符串值的前缀

​	一个字符串其实是由若干个字符组成，如果我们在MySQL中使用utf8字符集去存储字符串的话，编码一个字符需要占用1~3个字节。假设我们的字符串很长， 那存储一个字符串就需要占用很大的存储空间。在我们需要为这个字符串列建立索引时，那就意味着在对应的B+树中有这么两个问题：

- B+树索引中的记录需要把该列的完整字符串存储起来，而且字符串越长，在索引中占用的存储空间越大。 
- 如果B+树索引中索引列存储的字符串很长，那在做字符串比较时会占用更多的时间。

<font color='red'>**只对字符串的前几个字符进行索引**</font>也就是说在二级索引的记录中只保留字 符串前几个字符。这样在查找记录时虽然不能精确的定位到记录的位置，但是能定位到相应前缀所在的位置，然后根据前缀相同的记录的主键值回表查询完整的字符 串值，再对比就好了。这样只在B+树中存储字符串的前几个字符的编码，既节约空间，又减少了字符串的比较时间，还大概能解决排序的问题，何乐而不为，比方说 我们在建表语句中只对name列的前10个字符进行索引可以这么写：

```sql
CREATE TABLE person_info(
    name VARCHAR(100) NOT NULL,
    birthday DATE NOT NULL,
    phone_number CHAR(11) NOT NULL,
    country varchar(100) NOT NULL,
    KEY idx_name_birthday_phone_number (name(10), birthday, phone_number)
);
```

name(10)就表示在建立的B+树索引中只保留记录的前10个字符的编码，这种<font color='red'>只索引字符串值的前缀的策略是我们非常鼓励的，尤其是在字符串类型能存储的字符比较 多的时候。</font>

##### 索引列前缀对排序的影响

如果使用了索引列前缀，比方说前边只把name列的前10个字符放到了二级索引中，下边这个查询可能就有点儿尴尬了：

```sql
SELECT * FROM person_info ORDER BY name LIMIT 10;
```

因为二级索引中不包含完整的name列信息，所以无法对前十个字符相同，后边的字符不同的记录进行排序，也就是使用索引列前缀的方式无法支持使用索引排序，只 好乖乖的用文件排序喽。

##### 让索引列在比较表达式中单独出现

假设表中有一个整数列my_col，我们为这个列建立了索引。下边的两个WHERE子句虽然语义是一致的，但是在效率上却有差别：

1. WHERE my_col * 2 < 4 
2. 2. WHERE my_col < 4/2

第1个WHERE子句中my_col列并不是以单独列的形式出现的，而是以my_col * 2这样的表达式的形式出现的，存储引擎会依次遍历所有的记录，计算这个表达式的值是 不是小于4，所以这种情况下是使用不到为my_col列建立的B+树索引的。而第2个WHERE子句中my_col列并是以单独列的形式出现的，这样的情况可以直接使用B+树索 引。 

所以结论就是：如果索引列在比较表达式中不是以单独列的形式出现，而是以某个表达式，或者函数调用形式出现的话，是用不到索引的。

##### 主键插入顺序

顺序插入 随机插入、之间的区别

##### 冗余和重复索引

有时候有的同学有意或者无意的就对同一个列创建了多个索引，比方说这样写建表语句：

```sql
CREATE TABLE person_info(
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    birthday DATE NOT NULL,
    phone_number CHAR(11) NOT NULL,
    country varchar(100) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_name_birthday_phone_number (name(10), birthday, phone_number),
    KEY idx_name (name(10))
);
```

我们知道，通过idx_name_birthday_phone_number索引就可以对name列进行快速搜索，再创建一个专门针对name列的索引就算是一个冗余索引，维护这个索引只会增加 维护的成本，并不会对搜索有什么好处。

另一种情况，我们可能会对某个列重复建立索引，比方说这样：

```sql
CREATE TABLE repeat_index_demo (
    c1 INT PRIMARY KEY,
    c2 INT,
    UNIQUE uidx_c1 (c1),
    INDEX idx_c1 (c1)
);
```

我们看到，c1既是主键、又给它定义为一个唯一索引，还给它定义了一个普通索引，可是主键本身就会生成聚簇索引，所以定义的唯一索引和普通索引是重复的，这 种情况要避免。

##### 总结

1.B+树索引在空间和时间上都有代价，所以没事儿别瞎建索引。

 2. B+树索引适用于下边这些情况：

- 全值匹配 
- 匹配左边的列 
- 匹配范围值 
- 精确匹配某一列并范围匹配另外一列 
- 用于排序 
- 用于分组

3.在使用索引时需要注意下边这些事项：

- 只为用于搜索、排序或分组的列创建索引 
- 为列的基数大的列创建索引 
- 索引列的类型尽量小 
- 可以只对字符串值的前缀建立索引 
- 只有索引列在比较表达式中单独出现才可以适用索引 
- 为了尽可能少的让聚簇索引发生页面分裂和记录移位的情况，建议让主键拥有AUTO_INCREMENT属性。 
- 定位并删除表中的重复和冗余索引 
- 尽量使用覆盖索引进行查询，避免回表带来的性能损耗



# 五、课后总结（5分钟）

https://www.processon.com/diagraming/625016375653bb0743c9cb60

![Page 页面反推B+树](令狐老师-MySQL专题-MySQL索引.assets/Page 页面反推B+树.jpg)



# 六、下次预告（5分钟）

1.innoDB的事务特性、事务并发产生的问题与隔离级别

2.innoDB怎么解决相关并发问题？