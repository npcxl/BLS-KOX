-- MySQL dump 10.13  Distrib 8.0.27, for Linux (x86_64)
--
-- Host: localhost    Database: bls
-- ------------------------------------------------------
-- Server version	8.0.27

CREATE DATABASE IF NOT EXISTS `bls`
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_ai_ci;

USE `bls`;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `sys_config`
--

DROP TABLE IF EXISTS `sys_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_config` (
  `config_id` varchar(32) NOT NULL COMMENT '参数ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `config_key` varchar(100) NOT NULL COMMENT '参数键名',
  `config_value` text NOT NULL COMMENT '参数键值',
  `config_name` varchar(100) NOT NULL COMMENT '参数名称',
  `config_type` varchar(20) NOT NULL DEFAULT 'sys' COMMENT 'sys/theme/dict',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`),
  UNIQUE KEY `uk_config_tenant_key` (`tenant_id`,`config_key`),
  KEY `idx_config_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统参数表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_config`
--

LOCK TABLES `sys_config` WRITE;
/*!40000 ALTER TABLE `sys_config` DISABLE KEYS */;
INSERT INTO `sys_config` VALUES ('000401','000000','sys.user.defaultPassword','123456','默认密码','sys','0','新用户默认密码',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('000402','000000','sys.app.name','BLS Management System','系统名称','sys','0','前后端展示名称',0,'2026-06-11 00:58:56','2026-06-15 02:33:47');
INSERT INTO `sys_config` VALUES ('000403','000000','sys.demo.enabled','true','演示模式开关','sys','0','是否开启演示数据',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('000404','000000','sys.upload.maxSize','20','文件上传限制(MB)','sys','0','文件上传大小限制',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('000405','000000','sys.version','0.0.1','版本号','sys','0','系统版本',0,'2026-06-11 00:58:56','2026-06-15 02:34:08');
INSERT INTO `sys_config` VALUES ('100401','100000','sys.app.name','默认租户工作台','系统名称','sys','0','默认租户展示名称',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_config` VALUES ('324733162540371968','000000','sys.app.logo','https://xux.xlcig.cn/logo.png','系统Logo','sys','0','请在文件管理上传后复制-使用公开桶',0,'2026-06-15 02:13:40','2026-06-16 06:59:33');
INSERT INTO `sys_config` VALUES ('324735307117367296','000000','sys.user.defaultAvatar','https://i.scdn.co/image/ab67616d00001e020c1faab9fa6c0b91f9f4e465','用户默认头像','sys','0','用户未设置头像时使用',0,'2026-06-15 02:22:11','2026-06-15 02:25:33');
INSERT INTO `sys_config` VALUES ('324800409917067264','000000','sys.login.multiDevice','0','多开登录','sys','0','1 = 允许多开；0 = 只允许单端。默认1',0,'2026-06-15 06:40:52','2026-06-16 09:15:39');
/*!40000 ALTER TABLE `sys_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dept`
--

DROP TABLE IF EXISTS `sys_dept`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dept` (
  `dept_id` varchar(32) NOT NULL COMMENT '部门ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父部门ID，000000表示根节点',
  `dept_name` varchar(50) NOT NULL COMMENT '部门名称',
  `sort_num` int DEFAULT '0' COMMENT '排序',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0未删除 1已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`dept_id`),
  KEY `idx_dept_tenant` (`tenant_id`),
  KEY `idx_dept_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dept`
--

LOCK TABLES `sys_dept` WRITE;
/*!40000 ALTER TABLE `sys_dept` DISABLE KEYS */;
INSERT INTO `sys_dept` VALUES ('000001','000000','000000','平台总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100001','100000','000000','默认租户总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100002','100000','100001','技术部',2,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('100003','100000','100001','运营部',3,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dept` VALUES ('323381860459745280','000000','000000','暴龙部2',1,'0',0,'2026-06-11 08:44:03','2026-06-12 02:02:26');
INSERT INTO `sys_dept` VALUES ('323719748447768576','000000','323381860459745280','暴风雪',0,'0',0,'2026-06-12 07:06:42','2026-06-12 07:06:42');
/*!40000 ALTER TABLE `sys_dept` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `dict_data_id` varchar(32) NOT NULL COMMENT '字典数据ID',
  `dict_type_id` varchar(32) NOT NULL COMMENT '字典类型ID',
  `dict_label` varchar(100) NOT NULL COMMENT '字典标签',
  `dict_value` varchar(100) NOT NULL COMMENT '字典值',
  `dict_sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_data_id`),
  KEY `idx_dict_data_type` (`dict_type_id`),
  KEY `idx_dict_data_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='字典数据表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
INSERT INTO `sys_dict_data` VALUES ('000301','000201','男','0',1,'0','男','000000',0,'2026-06-11 00:58:56','2026-06-12 03:22:59');
INSERT INTO `sys_dict_data` VALUES ('000302','000201','女','1',2,'0','女','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000303','000201','未知','2',3,'0','未知','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000304','000202','正常','0',1,'0','正常','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000305','000202','停用','1',2,'0','停用','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000306','000203','目录','0',1,'0','目录','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000307','000203','菜单','1',2,'0','菜单','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000308','000203','按钮','2',3,'0','按钮','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000309','000204','是','1',1,'0','是','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000310','000204','否','0',2,'0','否','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000311','000205','系统参数','sys',1,'0','系统参数','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000312','000205','主题配置','theme',2,'0','主题配置','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000313','000205','字典数据','dict',3,'0','字典数据','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_data` VALUES ('000314','000206','密码登录','password',1,'0','用户名密码登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000315','000206','刷新令牌','refresh',2,'0','refreshToken 刷新','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000316','000206','验证码登录','sms',3,'0','短信验证码登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000317','000206','单点登录','sso',4,'0','SSO 登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_data` VALUES ('000318','000207','登录','LOGIN',1,'0','登录操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000319','000207','退出','LOGOUT',2,'0','退出操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000320','000207','新增','ADD',3,'0','新增操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000321','000207','修改','UPDATE',4,'0','修改操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000322','000207','删除','DELETE',5,'0','删除操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000323','000207','上传','UPLOAD',6,'0','上传操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000324','000207','下载','DOWNLOAD',7,'0','下载操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000325','000207','导出','EXPORT',8,'0','导出操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000326','000207','其他','OTHER',9,'0','其他操作','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_data` VALUES ('000327','000208','成功','1',1,'0','上传成功','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_data` VALUES ('000328','000208','失败','0',2,'0','上传失败','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_data` VALUES ('000329','000209','公开','public',1,'0','公开访问','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_data` VALUES ('000330','000209','私有','private',2,'0','私有访问','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_data` VALUES ('324832469079691264','324832179827904512','MinIO','minio',0,'0','MinIO分布式','000000',0,'2026-06-15 08:48:16','2026-06-15 08:48:16');
INSERT INTO `sys_dict_data` VALUES ('324832566806974464','324832179827904512','阿里云 OSS','aliyun_oss',1,'0','阿里云 OSS 文件服务','000000',0,'2026-06-15 08:48:39','2026-06-15 08:48:39');
INSERT INTO `sys_dict_data` VALUES ('324832642832928768','324832179827904512','腾讯云 COS','tencent_cos',2,'0','腾讯云 COS 文件服务','000000',0,'2026-06-15 08:48:57','2026-06-15 08:48:57');
INSERT INTO `sys_dict_data` VALUES ('324832716900143104','324832179827904512','七牛云 Kodo','qiniu_kodo',3,'0','七牛云 Kodo','000000',0,'2026-06-15 08:49:15','2026-06-15 08:49:15');
INSERT INTO `sys_dict_data` VALUES ('324832816439365632','324832179827904512','华为云 OBS','huawei_obs',4,'0','遥遥领先，远远超越','000000',0,'2026-06-15 08:49:38','2026-06-15 08:50:07');
INSERT INTO `sys_dict_data` VALUES ('324832897687228416','324832179827904512','AWS S3','aws_s3',5,'0','AWS S3','000000',0,'2026-06-15 08:49:58','2026-06-15 08:49:58');
INSERT INTO `sys_dict_data` VALUES ('324833081074782208','324832179827904512','本地存储','local',99,'0','本地存储(测试环境','000000',0,'2026-06-15 08:50:41','2026-06-15 08:50:41');
INSERT INTO `sys_dict_data` VALUES ('325153647082213376','325153530858049536','公共桶','public',1,'0','公开可访问文件','000000',0,'2026-06-16 06:04:30','2026-06-16 06:04:30');
INSERT INTO `sys_dict_data` VALUES ('325153773272043520','325153530858049536','私有桶','private',2,'0','需鉴权或签名访问文件','000000',0,'2026-06-16 06:05:00','2026-06-16 06:05:00');
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `dict_type_id` varchar(32) NOT NULL COMMENT '字典类型ID',
  `dict_name` varchar(100) NOT NULL COMMENT '字典名称',
  `dict_type` varchar(100) NOT NULL COMMENT '字典类型',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_type_id`),
  UNIQUE KEY `uk_dict_type_tenant` (`tenant_id`,`dict_type`),
  KEY `idx_dict_type_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='字典类型表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
INSERT INTO `sys_dict_type` VALUES ('000201','性别','sys_gender','0','用户性别字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000202','状态','sys_status','0','通用状态字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000203','菜单类型','sys_menu_type','0','菜单类型字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000204','是否','sys_yes_no','0','是否字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_dict_type` VALUES ('000205','配置类型','sys_config_type','0','系统配置类型','000000',0,'2026-06-11 00:58:56','2026-06-12 03:12:04');
INSERT INTO `sys_dict_type` VALUES ('000206','登录类型','sys_login_type','0','系统登录方式','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16');
INSERT INTO `sys_dict_type` VALUES ('000207','业务类型','sys_business_type','0','系统操作业务类型','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20');
INSERT INTO `sys_dict_type` VALUES ('000208','上传状态','sys_upload_status','0','文件上传结果状态','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24');
INSERT INTO `sys_dict_type` VALUES ('000209','访问类型','sys_access_type','0','上传文件访问类型','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30');
INSERT INTO `sys_dict_type` VALUES ('324832179827904512','OSS类型配置','sys_storage_type','0','minio|阿里云|腾讯云...','000000',0,'2026-06-15 08:47:07','2026-06-15 08:47:07');
INSERT INTO `sys_dict_type` VALUES ('325153530858049536','桶访问类型','sys_bucket_access_type','0','用于区分文件上传到公共桶或私有桶','000000',0,'2026-06-16 06:04:03','2026-06-16 06:04:03');
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_file`
--

DROP TABLE IF EXISTS `sys_file`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_file` (
  `file_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件ID',
  `tenant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '租户ID',
  `storage_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储配置ID',
  `bucket_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '桶名称',
  `object_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对象路径',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件名',
  `file_ext` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件后缀',
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MIME类型',
  `file_size` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `access_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private' COMMENT 'public/private',
  `module_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务模块',
  `url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共文件URL，私有文件为空',
  `create_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`file_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_storage_id` (`storage_id`),
  KEY `idx_bucket_object` (`bucket_name`,`object_name`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_module_name` (`module_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件资源表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_file`
--

LOCK TABLES `sys_file` WRITE;
/*!40000 ALTER TABLE `sys_file` DISABLE KEYS */;
INSERT INTO `sys_file` VALUES ('325151909738582016','000000','000001','private-assets','头像/1781589455662_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'private','头像',NULL,NULL,'2026-06-16 05:57:36',NULL,'2026-06-16 05:57:36',0);
INSERT INTO `sys_file` VALUES ('325155265907396608','000000','000001','public-assets','头像/1781590255855_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781590255855_images.jpg',NULL,'2026-06-16 06:10:56',NULL,'2026-06-16 06:10:56',0);
INSERT INTO `sys_file` VALUES ('325441325367431168','000000','000001','private-assets','头像/1781658458065_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:07:38',NULL,'2026-06-17 01:10:20',1);
INSERT INTO `sys_file` VALUES ('325441335437955072','000000','000001','private-assets','头像/1781658460626_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:07:41',NULL,'2026-06-17 01:10:17',1);
INSERT INTO `sys_file` VALUES ('325441758840360960','000000','000001','private-assets','头像/1781658561442_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:09:22',NULL,'2026-06-17 01:10:14',1);
INSERT INTO `sys_file` VALUES ('325441924779610112','000000','000001','private-assets','头像/1781658600976_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','png','image/png',190,'private','头像',NULL,NULL,'2026-06-17 01:10:01',NULL,'2026-06-17 01:10:11',1);
INSERT INTO `sys_file` VALUES ('325442039544156160','000000','000001','public-assets','头像/1781658628415_sanjiao@2x.png','sanjiao@2x.png','sanjiao@2x.png','png','image/png',454,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781658628415_sanjiao@2x.png',NULL,'2026-06-17 01:10:29',NULL,'2026-06-17 01:10:29',0);
INSERT INTO `sys_file` VALUES ('325452100014313472','000000','000001','public-assets','头像/1781661026961_jian@2x.png','jian@2x.png','jian@2x.png','png','image/png',702,'public','头像','https://s3.minion.xlcig.cn/public-assets/头像/1781661026961_jian@2x.png',NULL,'2026-06-17 01:50:27',NULL,'2026-06-17 01:50:27',0);
INSERT INTO `sys_file` VALUES ('325456136671203328','000000','000001','public-assets','avatar/1781661989382_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','avatar','https://s3.minion.xlcig.cn/public-assets/avatar/1781661989382_images.jpg',NULL,'2026-06-17 02:06:30',NULL,'2026-06-17 02:06:30',0);
INSERT INTO `sys_file` VALUES ('325456179692179456','000000','000001','public-assets','avatar/1781661999673_images.jpg','images.jpg','images.jpg','jpg','image/jpeg',5354,'public','avatar','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg',NULL,'2026-06-17 02:06:40',NULL,'2026-06-17 02:06:40',0);
/*!40000 ALTER TABLE `sys_file` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_login_log`
--

DROP TABLE IF EXISTS `sys_login_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_login_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `login_type` varchar(20) NOT NULL DEFAULT 'password' COMMENT '登录方式：password/otp/sms/oauth等',
  `login_status` char(1) NOT NULL DEFAULT '1' COMMENT '登录状态：1成功 0失败',
  `fail_reason` varchar(500) DEFAULT NULL COMMENT '失败原因',
  `login_ip` varchar(45) DEFAULT NULL COMMENT '登录IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `login_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  PRIMARY KEY (`log_id`),
  KEY `idx_login_log_tenant_time` (`tenant_id`,`login_time`),
  KEY `idx_login_log_user_time` (`user_id`,`login_time`),
  KEY `idx_login_log_status` (`login_status`),
  KEY `idx_login_log_request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='登录日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_login_log`
--

LOCK TABLES `sys_login_log` WRITE;
/*!40000 ALTER TABLE `sys_login_log` DISABLE KEYS */;
INSERT INTO `sys_login_log` VALUES ('325448041182138368','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 01:34:20');
INSERT INTO `sys_login_log` VALUES ('325454958721896448','000000','000001','superadmin','password','1',NULL,NULL,NULL,NULL,'2026-06-17 02:01:49');
/*!40000 ALTER TABLE `sys_login_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID，全局菜单',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父菜单ID，000000表示根节点',
  `menu_name` varchar(50) NOT NULL COMMENT '菜单名称',
  `path` varchar(200) DEFAULT NULL COMMENT '路由路径',
  `component` varchar(200) DEFAULT NULL COMMENT '组件路径',
  `perms` varchar(100) DEFAULT NULL COMMENT '权限标识',
  `icon` varchar(100) DEFAULT NULL COMMENT '图标',
  `menu_type` char(1) NOT NULL DEFAULT '1' COMMENT '0目录 1菜单 2按钮',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`menu_id`),
  KEY `idx_menu_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局菜单表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES ('000100','000000','系统管理','/system',NULL,NULL,'SettingOutlined','0',1,'0','2026-06-11 00:58:56','2026-06-15 01:43:24');
INSERT INTO `sys_menu` VALUES ('000110','000000','租户管理','/tenant',NULL,NULL,'SolutionOutlined','0',1,'0','2026-06-11 00:58:56','2026-06-15 01:42:06');
INSERT INTO `sys_menu` VALUES ('000111','000110','租户列表','/tenant/list','system/tenant-package/tenant','system:tenant:list','UsergroupDeleteOutlined','1',1,'0','2026-06-11 00:58:56','2026-06-16 01:46:18');
INSERT INTO `sys_menu` VALUES ('000112','000110','租户套餐','/tenant/package','system/tenant-package/package','system:package:list','SketchOutlined','1',2,'0','2026-06-11 00:58:56','2026-06-16 01:46:18');
INSERT INTO `sys_menu` VALUES ('000113','000111','查询',NULL,NULL,'system:tenant:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000114','000111','新增',NULL,NULL,'system:tenant:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000115','000111','修改',NULL,NULL,'system:tenant:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000116','000111','删除',NULL,NULL,'system:tenant:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000117','000112','查询',NULL,NULL,'system:package:list',NULL,'2',1,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000118','000112','新增',NULL,NULL,'system:package:add',NULL,'2',2,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000119','000112','修改',NULL,NULL,'system:package:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('00011A','000112','删除',NULL,NULL,'system:package:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44');
INSERT INTO `sys_menu` VALUES ('000120','000100','部门管理','/system/dept','system/dept','system:dept:list',NULL,'1',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000121','000120','查询',NULL,NULL,'system:dept:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000122','000120','新增',NULL,NULL,'system:dept:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000123','000120','修改',NULL,NULL,'system:dept:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000124','000120','删除',NULL,NULL,'system:dept:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000130','000100','用户管理','/system/user','system/user','system:user:list',NULL,'1',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000131','000130','查询',NULL,NULL,'system:user:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000132','000130','新增',NULL,NULL,'system:user:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000133','000130','修改',NULL,NULL,'system:user:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000134','000130','删除',NULL,NULL,'system:user:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000135','000130','重置密码',NULL,NULL,'system:user:resetPwd',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000140','000100','角色管理','/system/role','system/role','system:role:list',NULL,'1',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000141','000140','查询',NULL,NULL,'system:role:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000142','000140','新增',NULL,NULL,'system:role:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000143','000140','修改',NULL,NULL,'system:role:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000144','000140','删除',NULL,NULL,'system:role:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000145','000140','分配菜单',NULL,NULL,'system:role:assignMenu',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000150','000100','菜单管理','/system/menu','system/menu','system:menu:list',NULL,'1',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000151','000150','查询',NULL,NULL,'system:menu:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000152','000150','新增',NULL,NULL,'system:menu:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000153','000150','修改',NULL,NULL,'system:menu:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000154','000150','删除',NULL,NULL,'system:menu:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000160','000100','系统参数','/system/config','system/config','system:config:list',NULL,'1',6,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000161','000160','查询',NULL,NULL,'system:config:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000162','000160','新增',NULL,NULL,'system:config:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000163','000160','修改',NULL,NULL,'system:config:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000170','000100','字典管理','/system/dict','system/dict','system:dict:list',NULL,'1',7,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000171','000170','查询',NULL,NULL,'system:dict:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000172','000170','新增',NULL,NULL,'system:dict:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000173','000170','修改',NULL,NULL,'system:dict:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000174','000170','删除',NULL,NULL,'system:dict:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000180','000100','主题配置','/system/theme','system/theme','system:theme:list',NULL,'1',8,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000181','000180','查询',NULL,NULL,'system:theme:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000182','000180','修改',NULL,NULL,'system:theme:edit',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_menu` VALUES ('000190','000100','日志中心','/system/log',NULL,NULL,'FileSearchOutlined','0',8,'0','2026-06-16 09:05:28','2026-06-16 09:05:28');
INSERT INTO `sys_menu` VALUES ('000191','000190','登录日志','/system/log/login','system/log/login','system:log:login:list','LoginOutlined','1',1,'0','2026-06-16 09:05:35','2026-06-16 09:05:35');
INSERT INTO `sys_menu` VALUES ('000192','000190','操作审计','/system/log/audit','system/log/audit','system:log:audit:list','AuditOutlined','1',2,'0','2026-06-16 09:05:40','2026-06-16 09:05:40');
INSERT INTO `sys_menu` VALUES ('000193','000191','查询',NULL,NULL,'system:log:login:list',NULL,'2',1,'0','2026-06-16 09:05:45','2026-06-16 09:05:45');
INSERT INTO `sys_menu` VALUES ('000194','000191','导出',NULL,NULL,'system:log:login:export',NULL,'2',2,'0','2026-06-16 09:05:45','2026-06-16 09:05:45');
INSERT INTO `sys_menu` VALUES ('000195','000192','查询',NULL,NULL,'system:log:audit:list',NULL,'2',1,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000196','000192','导出',NULL,NULL,'system:log:audit:export',NULL,'2',2,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000197','000192','查看详情',NULL,NULL,'system:log:audit:detail',NULL,'2',3,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('000198','000192','清理',NULL,NULL,'system:log:audit:clean',NULL,'2',4,'0','2026-06-16 09:05:51','2026-06-16 09:05:51');
INSERT INTO `sys_menu` VALUES ('file_center_0001','000000','文件中心','/file-config',NULL,NULL,'FolderOutlined','0',30,'0','2026-06-15 08:40:58','2026-06-16 01:57:23');
INSERT INTO `sys_menu` VALUES ('file_manage_0001','file_center_0001','文件管理','/file-config/files','system/file-config/files','system:file:list','FileOutlined','1',2,'0','2026-06-15 08:41:06','2026-06-16 01:57:24');
INSERT INTO `sys_menu` VALUES ('file_manage_download_0001','file_manage_0001','下载',NULL,NULL,'system:file:download',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('file_manage_remove_0001','file_manage_0001','删除',NULL,NULL,'system:file:remove',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('file_manage_upload_0001','file_manage_0001','上传',NULL,NULL,'system:file:upload',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('storage_config_0001','file_center_0001','存储配置','/file-config/storage','system/file-config/storage','system:storage:list','DatabaseOutlined','1',1,'0','2026-06-15 08:41:06','2026-06-16 01:57:24');
INSERT INTO `sys_menu` VALUES ('storage_config_add_0001','storage_config_0001','新增',NULL,NULL,'system:storage:add',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('storage_config_edit_0001','storage_config_0001','修改',NULL,NULL,'system:storage:edit',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
INSERT INTO `sys_menu` VALUES ('storage_config_remove_0001','storage_config_0001','删除',NULL,NULL,'system:storage:remove',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_operation_log`
--

DROP TABLE IF EXISTS `sys_operation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_operation_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `business_type` varchar(30) NOT NULL COMMENT '业务类型：LOGIN/ADD/UPDATE/DELETE/UPLOAD/DOWNLOAD/EXPORT/OTHER',
  `title` varchar(200) NOT NULL COMMENT '操作标题',
  `request_method` varchar(10) DEFAULT NULL COMMENT '请求方法',
  `request_url` varchar(500) DEFAULT NULL COMMENT '请求URL',
  `request_params` longtext COMMENT '请求参数',
  `response_status` int DEFAULT NULL COMMENT '响应状态码',
  `success` tinyint NOT NULL DEFAULT '1' COMMENT '是否成功：1成功 0失败',
  `error_message` varchar(1000) DEFAULT NULL COMMENT '错误信息',
  `error_stack` longtext COMMENT '错误堆栈',
  `client_ip` varchar(45) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `cost_time_ms` int DEFAULT NULL COMMENT '耗时毫秒',
  `operator_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`log_id`),
  KEY `idx_op_log_tenant_time` (`tenant_id`,`operator_time`),
  KEY `idx_op_log_user_time` (`user_id`,`operator_time`),
  KEY `idx_op_log_business_type` (`business_type`),
  KEY `idx_op_log_request_id` (`request_id`),
  KEY `idx_op_log_success` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统操作日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_operation_log`
--

LOCK TABLES `sys_operation_log` WRITE;
/*!40000 ALTER TABLE `sys_operation_log` DISABLE KEYS */;
INSERT INTO `sys_operation_log` VALUES ('325196342748123136','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"configType\":\"sys\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:10',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196381868396544','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196388944187392','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:21',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196406535098368','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:25',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196457344897024','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:37',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196469692928000','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:54:40',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196827299287040','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:56:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325196885780467712','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:56:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325197328753496064','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"324800409917067264\",\"configKey\":\"sys.login.multiDevice\",\"configValue\":\"1\",\"configName\":\"多开登录\",\"configType\":\"sys\",\"remark\":\"1 = 允许多开；0 = 只允许单端。默认1\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:58:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325197330666098688','000000','000001','superadmin','config','LIST','查询系统参数','GET','/api/system/config/list','{\"current\":\"1\",\"pageSize\":\"10\",\"pageNum\":\"1\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 08:58:05',NULL);
INSERT INTO `sys_operation_log` VALUES ('325199656332169216','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:07:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325200161372508160','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:09:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201751634481152','000000','000001','superadmin','config','UPDATE','修改系统参数','PUT','/api/system/config/edit','{\"configId\":\"324800409917067264\",\"configKey\":\"sys.login.multiDevice\",\"configValue\":\"0\",\"configName\":\"多开登录\",\"configType\":\"sys\",\"remark\":\"1 = 允许多开；0 = 只允许单端。默认1\",\"status\":\"0\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:39',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201815501148160','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325201823025729537','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:15:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204475516162049','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:29',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204578276610048','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:53',NULL);
INSERT INTO `sys_operation_log` VALUES ('325204584450625536','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:26:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207479376023552','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P100/menus','{\"packageId\":\"P100\",\"menuIds\":[\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000161\",\"000162\",\"000163\",\"000181\",\"000182\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"000120\",\"000130\",\"000140\",\"000160\",\"000180\",\"file_manage_0001\",\"000110\",\"000111\",\"000112\",\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000100\",\"000150\",\"000170\",\"000190\",\"000151\",\"000152\",\"000153\",\"000154\",\"000171\",\"000172\",\"000173\",\"000174\",\"000191\",\"000192\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_center_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:38:25',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207608845799424','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P100/menus','{\"packageId\":\"P100\",\"menuIds\":[\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000161\",\"000162\",\"000163\",\"000181\",\"000182\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"000191\",\"000192\",\"000120\",\"000130\",\"000140\",\"000160\",\"000180\",\"000190\",\"file_manage_0001\",\"000100\",\"file_center_0001\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:38:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325207635819368448','000000','000001','superadmin','package','ASSIGN_MENUS','分配菜单','PUT','/api/system/package/P001/menus','{\"packageId\":\"P001\",\"menuIds\":[\"000113\",\"000114\",\"000115\",\"000116\",\"000117\",\"000118\",\"000119\",\"00011A\",\"000121\",\"000122\",\"000123\",\"000124\",\"000131\",\"000132\",\"000133\",\"000134\",\"000135\",\"000141\",\"000142\",\"000143\",\"000144\",\"000145\",\"000151\",\"000152\",\"000153\",\"000154\",\"000161\",\"000162\",\"000163\",\"000171\",\"000172\",\"000173\",\"000174\",\"000181\",\"000182\",\"file_manage_download_0001\",\"file_manage_remove_0001\",\"file_manage_upload_0001\",\"storage_config_add_0001\",\"storage_config_edit_0001\",\"storage_config_remove_0001\",\"000111\",\"000112\",\"000120\",\"000130\",\"000140\",\"000150\",\"000160\",\"000170\",\"000180\",\"storage_config_0001\",\"file_manage_0001\",\"000110\",\"file_center_0001\",\"000100\",\"000190\",\"000191\",\"000192\",\"000193\",\"000194\",\"000195\",\"000196\",\"000197\",\"000198\"]}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:39:02',NULL);
INSERT INTO `sys_operation_log` VALUES ('325208998750064641','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:44:27',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209058665697281','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:44:42',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209846943191040','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:47:50',NULL);
INSERT INTO `sys_operation_log` VALUES ('325209871546978304','100000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:47:55',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212368219017216','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:57:51',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212454063837184','100000','100001','admin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:58:11',NULL);
INSERT INTO `sys_operation_log` VALUES ('325212476180402176','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 09:58:16',NULL);
INSERT INTO `sys_operation_log` VALUES ('325213240726523904','000000','000001','superadmin','auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:01:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325213250184679424','000000',NULL,NULL,'auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:01:21',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215156797837313','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-16 10:08:56',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215475124539392','000000',NULL,NULL,'auth','LOGOUT','用户退出','POST','/api/auth/logout',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',NULL,NULL,'2026-06-16 10:10:11',NULL);
INSERT INTO `sys_operation_log` VALUES ('325215508507004929','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',NULL,NULL,'2026-06-16 10:10:19',NULL);
INSERT INTO `sys_operation_log` VALUES ('325440799624007681','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:05:33',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441968102576128','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441924779610112','{\"fileId\":\"325441924779610112\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:12',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441980823900160','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441758840360960','{\"fileId\":\"325441758840360960\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:15',NULL);
INSERT INTO `sys_operation_log` VALUES ('325441992127549440','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441335437955072','{\"fileId\":\"325441335437955072\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:17',NULL);
INSERT INTO `sys_operation_log` VALUES ('325442003577999360','000000','000001','superadmin','storage','DELETE','删除文件','DELETE','/api/system/storage/files/325441325367431168','{\"fileId\":\"325441325367431168\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:10:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325442746976440320','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\"}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:13:17',NULL);
INSERT INTO `sys_operation_log` VALUES ('325448041559625728','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:34:20',NULL);
INSERT INTO `sys_operation_log` VALUES ('325449677040390144','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"remark\":null,\"avatar\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:40:50',NULL);
INSERT INTO `sys_operation_log` VALUES ('325451340836900864','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":null,\"gender\":\"0\",\"email\":null,\"phone\":null,\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:47:26',NULL);
INSERT INTO `sys_operation_log` VALUES ('325451373195956224','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 01:47:34',NULL);
INSERT INTO `sys_operation_log` VALUES ('325454959099383808','000000','000001','superadmin','auth','LOGIN','用户登录','POST','/api/auth/login',NULL,200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:01:49',NULL);
INSERT INTO `sys_operation_log` VALUES ('325455000325197824','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":null,\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:01:59',NULL);
INSERT INTO `sys_operation_log` VALUES ('325456286172975104','000000','000001','superadmin','user','UPDATE','修改个人资料','PUT','/api/system/user/profile','{\"nickname\":\"超级管理员\",\"realName\":\"暴龙神\",\"gender\":\"0\",\"email\":\"18569795073@163.com\",\"phone\":\"15866669999\",\"avatar\":\"https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg\",\"remark\":null}',200,1,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,NULL,'2026-06-17 02:07:05',NULL);
/*!40000 ALTER TABLE `sys_operation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_package`
--

DROP TABLE IF EXISTS `sys_package`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `package_name` varchar(100) NOT NULL COMMENT '套餐名称',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_package`
--

LOCK TABLES `sys_package` WRITE;
/*!40000 ALTER TABLE `sys_package` DISABLE KEYS */;
INSERT INTO `sys_package` VALUES ('P001','0','0','000000 平台租户使用，拥有全部菜单权限','2026-06-11 00:58:56','2026-06-12 02:05:18');
INSERT INTO `sys_package` VALUES ('P100','租户标准版套餐','0','普通租户标准版，默认不包含租户管理','2026-06-11 00:58:56','2026-06-11 00:58:56');
/*!40000 ALTER TABLE `sys_package` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_package_menu`
--

DROP TABLE IF EXISTS `sys_package_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package_menu` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`package_id`,`menu_id`),
  KEY `idx_package_menu_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐菜单关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_package_menu`
--

LOCK TABLES `sys_package_menu` WRITE;
/*!40000 ALTER TABLE `sys_package_menu` DISABLE KEYS */;
INSERT INTO `sys_package_menu` VALUES ('P001','000100');
INSERT INTO `sys_package_menu` VALUES ('P100','000100');
INSERT INTO `sys_package_menu` VALUES ('P001','000110');
INSERT INTO `sys_package_menu` VALUES ('P001','000111');
INSERT INTO `sys_package_menu` VALUES ('P001','000112');
INSERT INTO `sys_package_menu` VALUES ('P001','000113');
INSERT INTO `sys_package_menu` VALUES ('P001','000114');
INSERT INTO `sys_package_menu` VALUES ('P001','000115');
INSERT INTO `sys_package_menu` VALUES ('P001','000116');
INSERT INTO `sys_package_menu` VALUES ('P001','000117');
INSERT INTO `sys_package_menu` VALUES ('P001','000118');
INSERT INTO `sys_package_menu` VALUES ('P001','000119');
INSERT INTO `sys_package_menu` VALUES ('P001','00011A');
INSERT INTO `sys_package_menu` VALUES ('P001','000120');
INSERT INTO `sys_package_menu` VALUES ('P100','000120');
INSERT INTO `sys_package_menu` VALUES ('P001','000121');
INSERT INTO `sys_package_menu` VALUES ('P100','000121');
INSERT INTO `sys_package_menu` VALUES ('P001','000122');
INSERT INTO `sys_package_menu` VALUES ('P100','000122');
INSERT INTO `sys_package_menu` VALUES ('P001','000123');
INSERT INTO `sys_package_menu` VALUES ('P100','000123');
INSERT INTO `sys_package_menu` VALUES ('P001','000124');
INSERT INTO `sys_package_menu` VALUES ('P100','000124');
INSERT INTO `sys_package_menu` VALUES ('P001','000130');
INSERT INTO `sys_package_menu` VALUES ('P100','000130');
INSERT INTO `sys_package_menu` VALUES ('P001','000131');
INSERT INTO `sys_package_menu` VALUES ('P100','000131');
INSERT INTO `sys_package_menu` VALUES ('P001','000132');
INSERT INTO `sys_package_menu` VALUES ('P100','000132');
INSERT INTO `sys_package_menu` VALUES ('P001','000133');
INSERT INTO `sys_package_menu` VALUES ('P100','000133');
INSERT INTO `sys_package_menu` VALUES ('P001','000134');
INSERT INTO `sys_package_menu` VALUES ('P100','000134');
INSERT INTO `sys_package_menu` VALUES ('P001','000135');
INSERT INTO `sys_package_menu` VALUES ('P100','000135');
INSERT INTO `sys_package_menu` VALUES ('P001','000140');
INSERT INTO `sys_package_menu` VALUES ('P100','000140');
INSERT INTO `sys_package_menu` VALUES ('P001','000141');
INSERT INTO `sys_package_menu` VALUES ('P100','000141');
INSERT INTO `sys_package_menu` VALUES ('P001','000142');
INSERT INTO `sys_package_menu` VALUES ('P100','000142');
INSERT INTO `sys_package_menu` VALUES ('P001','000143');
INSERT INTO `sys_package_menu` VALUES ('P100','000143');
INSERT INTO `sys_package_menu` VALUES ('P001','000144');
INSERT INTO `sys_package_menu` VALUES ('P100','000144');
INSERT INTO `sys_package_menu` VALUES ('P001','000145');
INSERT INTO `sys_package_menu` VALUES ('P100','000145');
INSERT INTO `sys_package_menu` VALUES ('P001','000150');
INSERT INTO `sys_package_menu` VALUES ('P001','000151');
INSERT INTO `sys_package_menu` VALUES ('P001','000152');
INSERT INTO `sys_package_menu` VALUES ('P001','000153');
INSERT INTO `sys_package_menu` VALUES ('P001','000154');
INSERT INTO `sys_package_menu` VALUES ('P001','000160');
INSERT INTO `sys_package_menu` VALUES ('P100','000160');
INSERT INTO `sys_package_menu` VALUES ('P001','000161');
INSERT INTO `sys_package_menu` VALUES ('P100','000161');
INSERT INTO `sys_package_menu` VALUES ('P001','000162');
INSERT INTO `sys_package_menu` VALUES ('P100','000162');
INSERT INTO `sys_package_menu` VALUES ('P001','000163');
INSERT INTO `sys_package_menu` VALUES ('P100','000163');
INSERT INTO `sys_package_menu` VALUES ('P001','000170');
INSERT INTO `sys_package_menu` VALUES ('P001','000171');
INSERT INTO `sys_package_menu` VALUES ('P001','000172');
INSERT INTO `sys_package_menu` VALUES ('P001','000173');
INSERT INTO `sys_package_menu` VALUES ('P001','000174');
INSERT INTO `sys_package_menu` VALUES ('P001','000180');
INSERT INTO `sys_package_menu` VALUES ('P100','000180');
INSERT INTO `sys_package_menu` VALUES ('P001','000181');
INSERT INTO `sys_package_menu` VALUES ('P100','000181');
INSERT INTO `sys_package_menu` VALUES ('P001','000182');
INSERT INTO `sys_package_menu` VALUES ('P100','000182');
INSERT INTO `sys_package_menu` VALUES ('P001','000190');
INSERT INTO `sys_package_menu` VALUES ('P100','000190');
INSERT INTO `sys_package_menu` VALUES ('P001','000191');
INSERT INTO `sys_package_menu` VALUES ('P100','000191');
INSERT INTO `sys_package_menu` VALUES ('P001','000192');
INSERT INTO `sys_package_menu` VALUES ('P100','000192');
INSERT INTO `sys_package_menu` VALUES ('P001','000193');
INSERT INTO `sys_package_menu` VALUES ('P100','000193');
INSERT INTO `sys_package_menu` VALUES ('P001','000194');
INSERT INTO `sys_package_menu` VALUES ('P100','000194');
INSERT INTO `sys_package_menu` VALUES ('P001','000195');
INSERT INTO `sys_package_menu` VALUES ('P100','000195');
INSERT INTO `sys_package_menu` VALUES ('P001','000196');
INSERT INTO `sys_package_menu` VALUES ('P100','000196');
INSERT INTO `sys_package_menu` VALUES ('P001','000197');
INSERT INTO `sys_package_menu` VALUES ('P100','000197');
INSERT INTO `sys_package_menu` VALUES ('P001','000198');
INSERT INTO `sys_package_menu` VALUES ('P100','000198');
INSERT INTO `sys_package_menu` VALUES ('P001','file_center_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_center_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_download_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_download_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_remove_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','file_manage_upload_0001');
INSERT INTO `sys_package_menu` VALUES ('P100','file_manage_upload_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_add_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_edit_0001');
INSERT INTO `sys_package_menu` VALUES ('P001','storage_config_remove_0001');
/*!40000 ALTER TABLE `sys_package_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `role_name` varchar(50) NOT NULL COMMENT '角色名称',
  `role_key` varchar(50) NOT NULL COMMENT '角色标识',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uk_role_tenant_key` (`tenant_id`,`role_key`),
  KEY `idx_role_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES ('000001','000000','超级管理员','admin',1,'0','平台超级管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('100001','100000','租户管理员','tenant_admin',1,'0','默认租户管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('100002','100000','普通用户','user',2,'0','默认租户普通用户角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_role` VALUES ('323300594838278144','000000','用户A','user:A',1,'0','普通用户',0,'2026-06-11 03:21:08','2026-06-11 03:21:08');
INSERT INTO `sys_role` VALUES ('323304627162451968','000000','用户B','用户B',0,'0',NULL,0,'2026-06-11 03:37:09','2026-06-11 03:37:09');
INSERT INTO `sys_role` VALUES ('323642966914764800','000000','用户C','用户c',0,'0',NULL,0,'2026-06-12 02:01:36','2026-06-12 06:33:14');
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色菜单关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES ('000001','000100');
INSERT INTO `sys_role_menu` VALUES ('000001','000110');
INSERT INTO `sys_role_menu` VALUES ('000001','000111');
INSERT INTO `sys_role_menu` VALUES ('000001','000112');
INSERT INTO `sys_role_menu` VALUES ('000001','000113');
INSERT INTO `sys_role_menu` VALUES ('000001','000114');
INSERT INTO `sys_role_menu` VALUES ('000001','000115');
INSERT INTO `sys_role_menu` VALUES ('000001','000116');
INSERT INTO `sys_role_menu` VALUES ('000001','000117');
INSERT INTO `sys_role_menu` VALUES ('000001','000118');
INSERT INTO `sys_role_menu` VALUES ('000001','000119');
INSERT INTO `sys_role_menu` VALUES ('000001','00011A');
INSERT INTO `sys_role_menu` VALUES ('000001','000120');
INSERT INTO `sys_role_menu` VALUES ('000001','000121');
INSERT INTO `sys_role_menu` VALUES ('000001','000122');
INSERT INTO `sys_role_menu` VALUES ('000001','000123');
INSERT INTO `sys_role_menu` VALUES ('000001','000124');
INSERT INTO `sys_role_menu` VALUES ('000001','000130');
INSERT INTO `sys_role_menu` VALUES ('000001','000131');
INSERT INTO `sys_role_menu` VALUES ('000001','000132');
INSERT INTO `sys_role_menu` VALUES ('000001','000133');
INSERT INTO `sys_role_menu` VALUES ('000001','000134');
INSERT INTO `sys_role_menu` VALUES ('000001','000135');
INSERT INTO `sys_role_menu` VALUES ('000001','000140');
INSERT INTO `sys_role_menu` VALUES ('000001','000141');
INSERT INTO `sys_role_menu` VALUES ('000001','000142');
INSERT INTO `sys_role_menu` VALUES ('000001','000143');
INSERT INTO `sys_role_menu` VALUES ('000001','000144');
INSERT INTO `sys_role_menu` VALUES ('000001','000145');
INSERT INTO `sys_role_menu` VALUES ('000001','000150');
INSERT INTO `sys_role_menu` VALUES ('000001','000151');
INSERT INTO `sys_role_menu` VALUES ('000001','000152');
INSERT INTO `sys_role_menu` VALUES ('000001','000153');
INSERT INTO `sys_role_menu` VALUES ('000001','000154');
INSERT INTO `sys_role_menu` VALUES ('000001','000160');
INSERT INTO `sys_role_menu` VALUES ('000001','000161');
INSERT INTO `sys_role_menu` VALUES ('000001','000162');
INSERT INTO `sys_role_menu` VALUES ('000001','000163');
INSERT INTO `sys_role_menu` VALUES ('000001','000170');
INSERT INTO `sys_role_menu` VALUES ('000001','000171');
INSERT INTO `sys_role_menu` VALUES ('000001','000172');
INSERT INTO `sys_role_menu` VALUES ('000001','000173');
INSERT INTO `sys_role_menu` VALUES ('000001','000174');
INSERT INTO `sys_role_menu` VALUES ('000001','000180');
INSERT INTO `sys_role_menu` VALUES ('000001','000181');
INSERT INTO `sys_role_menu` VALUES ('000001','000182');
INSERT INTO `sys_role_menu` VALUES ('000001','000190');
INSERT INTO `sys_role_menu` VALUES ('000001','000191');
INSERT INTO `sys_role_menu` VALUES ('000001','000192');
INSERT INTO `sys_role_menu` VALUES ('000001','000193');
INSERT INTO `sys_role_menu` VALUES ('000001','000194');
INSERT INTO `sys_role_menu` VALUES ('000001','000195');
INSERT INTO `sys_role_menu` VALUES ('000001','000196');
INSERT INTO `sys_role_menu` VALUES ('000001','000197');
INSERT INTO `sys_role_menu` VALUES ('000001','000198');
INSERT INTO `sys_role_menu` VALUES ('000001','file_center_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_download_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','file_manage_upload_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_add_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_edit_0001');
INSERT INTO `sys_role_menu` VALUES ('000001','storage_config_remove_0001');
INSERT INTO `sys_role_menu` VALUES ('100001','000100');
INSERT INTO `sys_role_menu` VALUES ('100001','000120');
INSERT INTO `sys_role_menu` VALUES ('100001','000121');
INSERT INTO `sys_role_menu` VALUES ('100001','000122');
INSERT INTO `sys_role_menu` VALUES ('100001','000123');
INSERT INTO `sys_role_menu` VALUES ('100001','000124');
INSERT INTO `sys_role_menu` VALUES ('100001','000130');
INSERT INTO `sys_role_menu` VALUES ('100001','000131');
INSERT INTO `sys_role_menu` VALUES ('100001','000132');
INSERT INTO `sys_role_menu` VALUES ('100001','000133');
INSERT INTO `sys_role_menu` VALUES ('100001','000134');
INSERT INTO `sys_role_menu` VALUES ('100001','000135');
INSERT INTO `sys_role_menu` VALUES ('100001','000140');
INSERT INTO `sys_role_menu` VALUES ('100001','000141');
INSERT INTO `sys_role_menu` VALUES ('100001','000142');
INSERT INTO `sys_role_menu` VALUES ('100001','000143');
INSERT INTO `sys_role_menu` VALUES ('100001','000144');
INSERT INTO `sys_role_menu` VALUES ('100001','000145');
INSERT INTO `sys_role_menu` VALUES ('100001','000150');
INSERT INTO `sys_role_menu` VALUES ('100001','000151');
INSERT INTO `sys_role_menu` VALUES ('100001','000152');
INSERT INTO `sys_role_menu` VALUES ('100001','000153');
INSERT INTO `sys_role_menu` VALUES ('100001','000154');
INSERT INTO `sys_role_menu` VALUES ('100001','000160');
INSERT INTO `sys_role_menu` VALUES ('100001','000161');
INSERT INTO `sys_role_menu` VALUES ('100001','000162');
INSERT INTO `sys_role_menu` VALUES ('100001','000163');
INSERT INTO `sys_role_menu` VALUES ('100001','000170');
INSERT INTO `sys_role_menu` VALUES ('100001','000171');
INSERT INTO `sys_role_menu` VALUES ('100001','000172');
INSERT INTO `sys_role_menu` VALUES ('100001','000173');
INSERT INTO `sys_role_menu` VALUES ('100001','000174');
INSERT INTO `sys_role_menu` VALUES ('100001','000180');
INSERT INTO `sys_role_menu` VALUES ('100001','000181');
INSERT INTO `sys_role_menu` VALUES ('100001','000182');
INSERT INTO `sys_role_menu` VALUES ('100001','000190');
INSERT INTO `sys_role_menu` VALUES ('100001','000191');
INSERT INTO `sys_role_menu` VALUES ('100001','000192');
INSERT INTO `sys_role_menu` VALUES ('100001','000193');
INSERT INTO `sys_role_menu` VALUES ('100001','000194');
INSERT INTO `sys_role_menu` VALUES ('100001','000195');
INSERT INTO `sys_role_menu` VALUES ('100001','000196');
INSERT INTO `sys_role_menu` VALUES ('100001','000197');
INSERT INTO `sys_role_menu` VALUES ('100001','000198');
INSERT INTO `sys_role_menu` VALUES ('100002','000100');
INSERT INTO `sys_role_menu` VALUES ('100002','000120');
INSERT INTO `sys_role_menu` VALUES ('100002','000121');
INSERT INTO `sys_role_menu` VALUES ('100002','000130');
INSERT INTO `sys_role_menu` VALUES ('100002','000131');
INSERT INTO `sys_role_menu` VALUES ('100002','000160');
INSERT INTO `sys_role_menu` VALUES ('100002','000161');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000100');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000120');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000121');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000130');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000131');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000160');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000161');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000163');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000180');
INSERT INTO `sys_role_menu` VALUES ('323642966914764800','000181');
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_storage_config`
--

DROP TABLE IF EXISTS `sys_storage_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_storage_config` (
  `storage_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储配置ID',
  `tenant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '000000' COMMENT '租户ID，000000表示平台默认配置',
  `storage_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储名称',
  `storage_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储类型：minio/aliyun_oss/tencent_cos/qiniu_kodo/huawei_obs/aws_s3/local',
  `endpoint` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '访问端点，不带协议，例如 s3.minion.xlcig.cn / oss-cn-hangzhou.aliyuncs.com',
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地域，例如 oss-cn-hangzhou / ap-shanghai',
  `port` int DEFAULT NULL COMMENT '端口，MinIO常用443/9000',
  `use_ssl` tinyint NOT NULL DEFAULT '1' COMMENT '是否使用HTTPS',
  `access_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AccessKey，可加密',
  `secret_key` text COLLATE utf8mb4_unicode_ci COMMENT 'SecretKey，必须加密',
  `public_bucket` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共桶',
  `private_bucket` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '私有桶',
  `public_base_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共访问基础URL',
  `private_base_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '私有访问基础URL，一般可为空',
  `path_style` tinyint NOT NULL DEFAULT '0' COMMENT '是否Path Style访问，MinIO通常为1，云厂商通常为0',
  `config_json` json DEFAULT NULL COMMENT '厂商差异配置JSON',
  `policy_json` json DEFAULT NULL COMMENT '上传限制/访问策略JSON',
  `is_default` tinyint NOT NULL DEFAULT '0' COMMENT '是否默认配置',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1启用，0停用',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_by` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`storage_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_storage_type` (`storage_type`),
  KEY `idx_status` (`status`),
  KEY `idx_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对象存储配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_storage_config`
--

LOCK TABLES `sys_storage_config` WRITE;
/*!40000 ALTER TABLE `sys_storage_config` DISABLE KEYS */;
INSERT INTO `sys_storage_config` VALUES ('000001','000000','MinIO分布式存储','minio','s3.minion.xlcig.cn',NULL,443,1,'admin','StrongPass123!','public-assets','private-assets','https://s3.minion.xlcig.cn/public-assets',NULL,1,'{\"nodes\": [{\"name\": \"minio1\", \"apiPort\": 9000, \"consolePort\": 9001}, {\"name\": \"minio2\", \"apiPort\": 9002, \"consolePort\": 9003}, {\"name\": \"minio3\", \"apiPort\": 9004, \"consolePort\": 9005}, {\"name\": \"minio4\", \"apiPort\": 9006, \"consolePort\": 9007}], \"apiUrl\": \"https://s3.minion.xlcig.cn\", \"consoleUrl\": \"https://minion.xlcig.cn\", \"clusterMode\": true, \"forcePathStyle\": true}','{\"maxSizeMB\": 100, \"allowedExt\": [\"jpg\", \"jpeg\", \"png\", \"gif\", \"webp\", \"pdf\", \"doc\", \"docx\", \"xls\", \"xlsx\", \"ppt\", \"pptx\", \"zip\"], \"blockedExt\": [\"exe\", \"bat\", \"cmd\", \"sh\", \"js\", \"msi\"], \"privateExpireSeconds\": 300}',1,0,'MinIO Docker 四节点分布式集群；控制台域名 minion.xlcig.cn；S3 API 域名 s3.minion.xlcig.cn',NULL,'2026-06-15 08:21:40',NULL,'2026-06-16 02:01:53',0);
/*!40000 ALTER TABLE `sys_storage_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_tenant`
--

DROP TABLE IF EXISTS `sys_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant` (
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID，000000为平台租户，其他租户使用雪花ID字符串',
  `tenant_name` varchar(100) NOT NULL COMMENT '租户名称',
  `package_id` varchar(32) DEFAULT NULL COMMENT '绑定套餐ID',
  `expire_time` datetime DEFAULT NULL COMMENT '套餐到期时间，000000平台租户可为空表示永久有效',
  `domain_name` varchar(100) DEFAULT NULL COMMENT '绑定域名，如：admin.xxx.com',
  `contact_user` varchar(50) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(30) DEFAULT NULL COMMENT '联系电话',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `uk_tenant_domain` (`domain_name`),
  KEY `idx_tenant_package` (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_tenant`
--

LOCK TABLES `sys_tenant` WRITE;
/*!40000 ALTER TABLE `sys_tenant` DISABLE KEYS */;
INSERT INTO `sys_tenant` VALUES ('000000','平台租户','P001',NULL,'admin.xxx.com','系统管理员','00000000000','0','平台默认租户，永久有效','2026-06-11 00:58:56','2026-06-11 00:58:56');
INSERT INTO `sys_tenant` VALUES ('100000','默认租户','P100','2027-06-24 00:58:56','test.xxx.com','租户管理员','13800000000','0','开箱即用默认租户，标准版套餐','2026-06-11 00:58:56','2026-06-11 02:25:58');
/*!40000 ALTER TABLE `sys_tenant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_theme_config`
--

DROP TABLE IF EXISTS `sys_theme_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_theme_config` (
  `theme_id` varchar(32) NOT NULL COMMENT '主题配置ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `nav_theme` varchar(20) NOT NULL DEFAULT 'light' COMMENT '导航主题',
  `color_primary` varchar(20) NOT NULL DEFAULT '#1677ff' COMMENT '主色',
  `layout` varchar(20) NOT NULL DEFAULT 'mix' COMMENT '布局',
  `content_width` varchar(20) NOT NULL DEFAULT 'Fluid' COMMENT '内容宽度',
  `fixed_header` tinyint NOT NULL DEFAULT '0' COMMENT '固定头部',
  `fix_siderbar` tinyint NOT NULL DEFAULT '1' COMMENT '固定侧栏',
  `color_weak` tinyint NOT NULL DEFAULT '0' COMMENT '色弱模式',
  `title` varchar(100) NOT NULL DEFAULT 'BLS Admin' COMMENT '标题',
  `logo` varchar(500) DEFAULT NULL COMMENT 'Logo',
  `iconfont_url` varchar(500) DEFAULT NULL COMMENT 'iconfont地址',
  `token_json` text COMMENT '主题Token(JSON字符串)',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`theme_id`),
  UNIQUE KEY `uk_theme_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统主题配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_theme_config`
--

LOCK TABLES `sys_theme_config` WRITE;
/*!40000 ALTER TABLE `sys_theme_config` DISABLE KEYS */;
INSERT INTO `sys_theme_config` VALUES ('000501','000000','light','#722ED1','mix','Fluid',0,1,0,'BLS Management System','https://xux.xlcig.cn/logo.png','','{}','0',NULL,0,'2026-06-11 00:58:56','2026-06-17 01:42:44');
INSERT INTO `sys_theme_config` VALUES ('100501','100000','light','#1677ff','mix','Fluid',0,1,0,'默认租户工作台',NULL,'','{}','0',NULL,0,'2026-06-11 00:58:56','2026-06-12 07:23:45');
/*!40000 ALTER TABLE `sys_theme_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_ui_field`
--

DROP TABLE IF EXISTS `sys_ui_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_ui_field` (
  `field_id` varchar(32) NOT NULL COMMENT '字段ID',
  `page_code` varchar(100) NOT NULL COMMENT '页面编码，如 system_dept',
  `field_key` varchar(100) NOT NULL COMMENT '字段名，如 deptName',
  `field_label` varchar(100) NOT NULL COMMENT '字段标题，如 部门名称',
  `field_scope` char(1) NOT NULL DEFAULT '2' COMMENT '字段范围：0表格 1表单 2两者都用',
  `field_type` varchar(50) NOT NULL DEFAULT 'text' COMMENT '字段类型：text/select/digit/textarea/dateTime/treeSelect',
  `value_enum_key` varchar(100) DEFAULT NULL COMMENT '字典类型，如 sys_status',
  `is_search` tinyint NOT NULL DEFAULT '1' COMMENT '是否参与搜索：1是 0否',
  `is_required` tinyint NOT NULL DEFAULT '0' COMMENT '是否必填：1是 0否',
  `is_copyable` tinyint NOT NULL DEFAULT '0' COMMENT '是否可复制：1是 0否',
  `is_ellipsis` tinyint NOT NULL DEFAULT '0' COMMENT '是否省略显示：1是 0否',
  `is_form_visible` tinyint NOT NULL DEFAULT '1' COMMENT '表单是否显示：1是 0否',
  `is_table_visible` tinyint NOT NULL DEFAULT '1' COMMENT '表格是否显示：1是 0否',
  `width` int DEFAULT NULL COMMENT '表格列宽',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `default_value` varchar(200) DEFAULT NULL COMMENT '默认值',
  `placeholder` varchar(200) DEFAULT NULL COMMENT '占位提示',
  `props_json` json DEFAULT NULL COMMENT '额外属性JSON，如 treeSelect / multiple 等',
  `render_code` varchar(100) DEFAULT NULL COMMENT '特殊渲染标记，如 iconPicker/statusTag',
  `before_submit_code` varchar(100) DEFAULT NULL COMMENT '提交前处理标记，如 joinComma/splitArray',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0启用 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`field_id`),
  KEY `idx_field_page_code` (`page_code`),
  KEY `idx_field_sort` (`page_code`,`sort_num`),
  KEY `idx_field_key` (`page_code`,`field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='动态字段元数据表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_ui_field`
--

LOCK TABLES `sys_ui_field` WRITE;
/*!40000 ALTER TABLE `sys_ui_field` DISABLE KEYS */;
INSERT INTO `sys_ui_field` VALUES ('100001','system_dept','deptName','部门名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入部门名称',NULL,NULL,NULL,'0','部门名称','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100002','system_dept','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,2,'0',NULL,NULL,NULL,NULL,'0','排序','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100003','system_dept','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,3,'0',NULL,NULL,'statusTag',NULL,'0','状态','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100004','system_dept','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,NULL,4,NULL,NULL,NULL,NULL,NULL,'0','创建时间','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('100005','system_dept','parentId','上级部门','1','treeSelect',NULL,0,1,0,0,1,0,NULL,5,'000000','请选择上级部门','{\"allowClear\": false, \"showSearch\": true, \"treeNodeFilterProp\": \"title\", \"treeDefaultExpandAll\": true}',NULL,NULL,'0','上级部门','2026-06-12 08:46:07','2026-06-12 08:46:07');
INSERT INTO `sys_ui_field` VALUES ('200001','system_role','roleName','角色名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入角色名称',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200002','system_role','roleKey','角色标识','2','text',NULL,1,1,1,1,1,1,NULL,2,NULL,'请输入角色标识',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200003','system_role','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,3,'0',NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200004','system_role','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,4,'0',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200005','system_role','remark','备注','2','textarea',NULL,0,0,0,0,1,1,NULL,5,NULL,NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('200006','system_role','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,NULL,6,NULL,NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:46:01','2026-06-12 08:46:01');
INSERT INTO `sys_ui_field` VALUES ('300001','system_menu','menuName','菜单名称','2','text',NULL,1,1,0,1,1,1,NULL,1,NULL,'请输入菜单名称',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300002','system_menu','icon','图标','0','text',NULL,0,0,0,0,0,1,80,2,NULL,NULL,NULL,'iconPicker',NULL,'0','仅表格显示图标','2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300003','system_menu','path','路由地址','0','text',NULL,1,0,1,1,0,1,NULL,3,NULL,'请输入路由地址',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300004','system_menu','component','组件路径','0','text',NULL,0,0,0,1,1,1,NULL,4,NULL,'请输入组件路径',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300005','system_menu','perms','权限标识','0','text',NULL,0,0,1,1,1,1,NULL,5,NULL,'请输入权限标识',NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300006','system_menu','menuType','类型','2','select','sys_menu_type',1,1,0,0,1,1,NULL,6,'1',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300007','system_menu','status','状态','2','select','sys_status',1,1,0,0,1,1,NULL,7,'0',NULL,NULL,'statusTag',NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300008','system_menu','sortNum','排序','2','digit',NULL,0,0,0,0,1,1,80,8,'0',NULL,NULL,NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('300009','system_menu','parentId','上级菜单','1','treeSelect',NULL,0,1,0,0,1,0,NULL,9,'000000','请选择上级菜单','{\"allowClear\": true, \"treeDefaultExpandAll\": true}',NULL,NULL,'0',NULL,'2026-06-12 08:45:54','2026-06-12 08:45:54');
INSERT INTO `sys_ui_field` VALUES ('userf001','system_user','username','用户名','2','text',NULL,1,1,1,1,1,1,NULL,1,NULL,'请输入用户名',NULL,NULL,NULL,'0','用户名','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf002','system_user','nickname','昵称','2','text',NULL,0,1,0,0,1,1,NULL,2,NULL,'请输入昵称',NULL,NULL,NULL,'0','昵称','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf003','system_user','realName','真实姓名','2','text',NULL,0,0,0,0,1,1,NULL,3,NULL,'请输入真实姓名',NULL,NULL,NULL,'0','真实姓名','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf004','system_user','phone','手机号','2','text',NULL,0,0,0,0,1,1,NULL,4,NULL,'请输入手机号',NULL,NULL,NULL,'0','手机号','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf005','system_user','email','邮箱','2','text',NULL,0,0,0,1,1,1,NULL,5,NULL,'请输入邮箱',NULL,NULL,NULL,'0','邮箱','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf006','system_user','isAdmin','管理员','2','select','sys_yes_no',0,1,0,0,1,1,100,6,'0',NULL,NULL,'statusTag',NULL,'0','是否管理员','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf007','system_user','status','状态','2','select','sys_status',1,1,0,0,1,1,100,7,'0',NULL,NULL,'statusTag',NULL,'0','状态','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf008','system_user','createTime','创建时间','0','dateTime',NULL,0,0,0,0,0,1,160,8,NULL,NULL,NULL,NULL,NULL,'0','创建时间','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf009','system_user','password','密码','1','password',NULL,0,1,0,0,1,0,NULL,9,NULL,'新增时为空则使用默认密码 123456，编辑时留空不修改',NULL,NULL,NULL,'0','密码','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf010','system_user','deptId','部门','1','treeSelect',NULL,0,0,0,0,1,0,NULL,10,'000000','请选择部门','{\"allowClear\": true, \"showSearch\": true, \"treeNodeFilterProp\": \"title\", \"treeDefaultExpandAll\": true}',NULL,NULL,'0','部门','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf011','system_user','roleIds','角色','1','select',NULL,0,0,0,0,1,0,NULL,11,NULL,'请选择角色','{\"mode\": \"multiple\", \"placeholder\": \"请选择角色\"}',NULL,'joinComma','0','角色','2026-06-12 08:48:53','2026-06-12 08:48:53');
INSERT INTO `sys_ui_field` VALUES ('userf012','system_user','remark','备注','2','textarea',NULL,0,0,0,0,1,1,NULL,12,NULL,'请输入备注',NULL,NULL,NULL,'0','备注','2026-06-12 08:48:53','2026-06-12 08:48:53');
/*!40000 ALTER TABLE `sys_ui_field` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_upload_audit`
--

DROP TABLE IF EXISTS `sys_upload_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_upload_audit` (
  `audit_id` varchar(32) NOT NULL COMMENT '审计ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `access_type` char(10) NOT NULL COMMENT '访问类型：public/private',
  `storage_id` varchar(32) DEFAULT NULL COMMENT '存储配置ID',
  `storage_type` varchar(30) DEFAULT NULL COMMENT '存储类型：minio/aliyun_oss/aws_s3/local等',
  `bucket_name` varchar(100) DEFAULT NULL COMMENT '存储桶名称',
  `object_name` varchar(500) DEFAULT NULL COMMENT '对象名',
  `original_name` varchar(255) NOT NULL COMMENT '原始文件名',
  `safe_name` varchar(255) NOT NULL COMMENT '清洗后文件名',
  `file_ext` varchar(20) DEFAULT NULL COMMENT '文件后缀',
  `mime_type` varchar(100) DEFAULT NULL COMMENT 'MIME类型',
  `file_size` bigint NOT NULL COMMENT '文件大小(字节)',
  `max_upload_bytes` bigint DEFAULT NULL COMMENT '上传限制(字节)',
  `upload_status` char(1) NOT NULL DEFAULT '1' COMMENT '上传状态：1成功 0失败',
  `fail_reason` varchar(1000) DEFAULT NULL COMMENT '失败原因',
  `client_ip` varchar(45) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id` varchar(64) DEFAULT NULL COMMENT '请求追踪ID',
  `file_id` varchar(32) DEFAULT NULL COMMENT '文件ID',
  `file_url` varchar(1000) DEFAULT NULL COMMENT '文件URL',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`audit_id`),
  KEY `idx_upload_audit_tenant_time` (`tenant_id`,`create_time`),
  KEY `idx_upload_audit_user_time` (`user_id`,`create_time`),
  KEY `idx_upload_audit_status` (`upload_status`),
  KEY `idx_upload_audit_storage` (`storage_id`),
  KEY `idx_upload_audit_request_id` (`request_id`),
  KEY `idx_upload_audit_file_id` (`file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件上传审计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_upload_audit`
--

LOCK TABLES `sys_upload_audit` WRITE;
/*!40000 ALTER TABLE `sys_upload_audit` DISABLE KEYS */;
INSERT INTO `sys_upload_audit` VALUES ('325441925152903168','000000',NULL,NULL,'头像','private','000001','minio','private-assets','头像/1781658600976_jaihao@2x.png','jaihao@2x.png','jaihao@2x.png','.png','image/png',190,20971520,'1',NULL,NULL,NULL,NULL,'325441924779610112',NULL,'2026-06-17 01:10:01');
INSERT INTO `sys_upload_audit` VALUES ('325442039732899840','000000',NULL,NULL,'头像','public','000001','minio','public-assets','头像/1781658628415_sanjiao@2x.png','sanjiao@2x.png','sanjiao@2x.png','.png','image/png',454,20971520,'1',NULL,NULL,NULL,NULL,'325442039544156160','https://s3.minion.xlcig.cn/public-assets/头像/1781658628415_sanjiao@2x.png','2026-06-17 01:10:29');
INSERT INTO `sys_upload_audit` VALUES ('325452100395995136','000000',NULL,NULL,'头像','public','000001','minio','public-assets','头像/1781661026961_jian@2x.png','jian@2x.png','jian@2x.png','.png','image/png',702,20971520,'1',NULL,NULL,NULL,NULL,'325452100014313472','https://s3.minion.xlcig.cn/public-assets/头像/1781661026961_jian@2x.png','2026-06-17 01:50:27');
INSERT INTO `sys_upload_audit` VALUES ('325456137048690688','000000',NULL,NULL,'avatar','public','000001','minio','public-assets','avatar/1781661989382_images.jpg','images.jpg','images.jpg','.jpg','image/jpeg',5354,20971520,'1',NULL,NULL,NULL,NULL,'325456136671203328','https://s3.minion.xlcig.cn/public-assets/avatar/1781661989382_images.jpg','2026-06-17 02:06:30');
INSERT INTO `sys_upload_audit` VALUES ('325456180069666816','000000',NULL,NULL,'avatar','public','000001','minio','public-assets','avatar/1781661999673_images.jpg','images.jpg','images.jpg','.jpg','image/jpeg',5354,20971520,'1',NULL,NULL,NULL,NULL,'325456179692179456','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg','2026-06-17 02:06:40');
/*!40000 ALTER TABLE `sys_upload_audit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'MD5密码',
  `nickname` varchar(50) NOT NULL COMMENT '用户昵称',
  `real_name` varchar(50) DEFAULT NULL COMMENT '真实姓名',
  `avatar` varchar(500) DEFAULT NULL COMMENT '头像地址',
  `gender` char(1) NOT NULL DEFAULT '2' COMMENT '性别：0男 1女 2未知',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(30) DEFAULT NULL COMMENT '手机号',
  `dept_id` varchar(32) DEFAULT NULL COMMENT '部门ID',
  `is_admin` char(1) NOT NULL DEFAULT '0' COMMENT '是否管理员：0否 1是',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '状态：0正常 1停用',
  `last_login_ip` varchar(45) DEFAULT NULL COMMENT '最后登录IP',
  `last_login_time` datetime DEFAULT NULL COMMENT '最后登录时间',
  `password_update_time` datetime DEFAULT NULL COMMENT '密码更新时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除：0未删除 1已删除',
  `create_by` varchar(32) DEFAULT NULL COMMENT '创建人ID',
  `update_by` varchar(32) DEFAULT NULL COMMENT '更新人ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_tenant_username` (`tenant_id`,`username`),
  KEY `idx_user_tenant` (`tenant_id`),
  KEY `idx_user_phone` (`phone`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_dept` (`dept_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES ('000001','000000','superadmin','e10adc3949ba59abbe56e057f20f883e','超级管理员','暴龙神','https://s3.minion.xlcig.cn/public-assets/avatar/1781661999673_images.jpg','0','18569795073@163.com','15866669999','000001','1','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 00:58:56','2026-06-17 02:07:05');
INSERT INTO `sys_user` VALUES ('100001','100000','admin','e10adc3949ba59abbe56e057f20f883e','租户管理员','租户管理员',NULL,'2',NULL,NULL,'100001','1','0',NULL,NULL,NULL,'默认租户管理员',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 03:12:44');
INSERT INTO `sys_user` VALUES ('100002','100000','user','e10adc3949ba59abbe56e057f20f883e','普通用户',NULL,NULL,'2',NULL,NULL,NULL,'0','0',NULL,NULL,NULL,'默认租户普通用户',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 07:47:37');
INSERT INTO `sys_user` VALUES ('323300735171301376','000000','usera','e10adc3949ba59abbe56e057f20f883e','用户A',NULL,NULL,'2',NULL,NULL,'323381860459745280','0','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 03:21:41','2026-06-12 08:19:50');
INSERT INTO `sys_user` VALUES ('323367925727760384','100000','user2','e10adc3949ba59abbe56e057f20f883e','用户2',NULL,NULL,'2',NULL,NULL,NULL,'1','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 07:48:41','2026-06-11 07:48:41');
INSERT INTO `sys_user` VALUES ('323736538880020480','000000','testUser2','e10adc3949ba59abbe56e057f20f883e','c测试用户',NULL,NULL,'2',NULL,NULL,'323719748447768576','1','0',NULL,NULL,NULL,'test',0,NULL,NULL,'2026-06-12 08:13:26','2026-06-12 08:16:31');
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`,`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES ('000001','000001');
INSERT INTO `sys_user_role` VALUES ('000001','323304627162451968');
INSERT INTO `sys_user_role` VALUES ('000001','323642966914764800');
INSERT INTO `sys_user_role` VALUES ('100001','100001');
INSERT INTO `sys_user_role` VALUES ('323300735171301376','323642966914764800');
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-17  2:14:21
