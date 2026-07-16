-- ============================================================
-- BLS-KOX 数据库初始化 SQL（精简版）
-- 仅包含表结构 + 最小种子数据（超级管理员/默认租户/核心菜单）
-- 演示数据请导入 Init-demo.sql
-- ============================================================

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

-- -------------------------------------------------------
-- outbox_event
-- -------------------------------------------------------
DROP TABLE IF EXISTS `outbox_event`;
CREATE TABLE `outbox_event` (
  `event_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `event_type` varchar(64) NOT NULL COMMENT 'USER_CREATED/FILE_UPLOADED/...',
  `aggregate_type` varchar(64) DEFAULT NULL,
  `aggregate_id` varchar(32) DEFAULT NULL,
  `payload_json` json DEFAULT NULL,
  `status` enum('pending','processing','published','failed','dead') NOT NULL DEFAULT 'pending',
  `retry_count` int NOT NULL DEFAULT '0',
  `next_retry_at` datetime DEFAULT NULL,
  `processing_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published_at` datetime DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_status_retry` (`status`,`next_retry_at`),
  KEY `idx_tenant_type` (`tenant_id`,`event_type`),
  KEY `idx_status_processing` (`status`,`processing_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Outbox 事件表';

-- -------------------------------------------------------
-- sys_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_config`;
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

INSERT INTO `sys_config` VALUES
('000401','000000','sys.user.defaultPassword','123456','默认密码','sys','0','新用户默认密码',0,'2026-06-11 00:58:56','2026-06-23 08:17:48'),
('000402','000000','sys.app.name','KOX Management System','系统名称','sys','0','前后端展示名称',0,'2026-06-11 00:58:56','2026-06-15 02:33:47'),
('000403','000000','sys.demo.enabled','true','演示模式开关','sys','0','是否开启演示数据',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000404','000000','sys.upload.maxSize','20','文件上传限制(MB)','sys','0','文件上传大小限制',0,'2026-06-11 00:58:56','2026-06-17 03:08:19'),
('000405','000000','sys.version','2.0.0','版本号','sys','0','系统版本',0,'2026-06-11 00:58:56','2026-07-09 09:26:33'),
('100401','100000','sys.app.name','默认租户工作台','系统名称','sys','0','默认租户展示名称',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');

-- -------------------------------------------------------
-- sys_dept
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_dept`;
CREATE TABLE `sys_dept` (
  `dept_id` varchar(32) NOT NULL COMMENT '部门ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父部门ID',
  `dept_name` varchar(50) NOT NULL COMMENT '部门名称',
  `sort_num` int DEFAULT '0' COMMENT '排序',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dept_id`),
  KEY `idx_dept_tenant` (`tenant_id`),
  KEY `idx_dept_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门表';

INSERT INTO `sys_dept` VALUES
('000001','000000','000000','平台总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('100001','100000','000000','默认租户总部',1,'0',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');

-- -------------------------------------------------------
-- sys_dict_data
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_dict_data`;
CREATE TABLE `sys_dict_data` (
  `dict_data_id` varchar(32) NOT NULL COMMENT '字典数据ID',
  `dict_type_id` varchar(32) NOT NULL COMMENT '字典类型ID',
  `dict_label` varchar(100) NOT NULL COMMENT '字典标签',
  `dict_value` varchar(100) NOT NULL COMMENT '字典值',
  `dict_sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `tag` varchar(30) DEFAULT 'default' COMMENT '标签颜色',
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

INSERT INTO `sys_dict_data` VALUES
('000310','000201','男','0',1,'blue','0','男性','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000311','000201','女','1',2,'pink','0','女性','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000312','000201','未知','2',3,'default','0','未设置性别','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000313','000202','正常','0',1,'green','0','正常状态','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000314','000206','密码登录','password',1,'blue','0','用户名密码登录','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16'),
('000315','000206','刷新令牌','refresh',2,'lime','0','refreshToken 刷新','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16'),
('000318','000202','停用','1',2,'red','0','停用状态','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000319','000204','是','1',1,'blue','0','是','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000320','000204','否','0',2,'default','0','否','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000321','000203','目录','0',1,'blue','0','目录类型菜单','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000322','000203','菜单','1',2,'green','0','页面类型菜单','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000323','000203','按钮','2',3,'default','0','按钮权限','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000324','000205','系统配置','sys',1,'blue','0','系统级参数','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000325','000205','主题配置','theme',2,'purple','0','主题相关参数','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000326','000205','字典配置','dict',3,'cyan','0','字典相关参数','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000327','000207','新增','ADD',1,'green','0','新增操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000328','000207','修改','UPDATE',2,'blue','0','修改操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000329','000207','删除','DELETE',3,'red','0','删除操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000330','000207','上传','UPLOAD',4,'purple','0','上传操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000331','000207','下载','DOWNLOAD',5,'cyan','0','下载操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000332','000207','导出','EXPORT',6,'orange','0','导出操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000333','000207','登录','LOGIN',7,'lime','0','登录操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000334','000207','退出','LOGOUT',8,'gold','0','退出操作','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000339','000208','成功','1',1,'green','0','上传/操作成功','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000340','000208','失败','0',2,'red','0','上传/操作失败','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000341','000209','公共访问','public',1,'cyan','0','公开可访问','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000342','000209','私有访问','private',2,'orange','0','需鉴权访问','000000',0,'2026-07-09 03:28:25','2026-07-09 03:28:25'),
('000350','DT001','亮色菜单风格','light',1,'blue','0','亮色主题导航','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000351','DT001','暗色菜单风格','dark',2,'volcano','0','暗色主题导航','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000352','DT001','暗黑模式','realDark',3,'red','0','纯暗黑模式','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000353','DT002','侧边菜单布局','side',1,'blue','0','侧边栏布局','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000354','DT002','顶部菜单布局','top',2,'green','0','顶部栏布局','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000355','DT002','混合布局','mix',3,'purple','0','混合布局模式','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000356','DT003','流式','Fluid',1,'cyan','0','自适应宽度','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('000357','DT003','定宽','Fixed',2,'orange','0','固定宽度','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00');

-- -------------------------------------------------------
-- sys_dict_type
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_dict_type`;
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

INSERT INTO `sys_dict_type` VALUES
('000201','性别','sys_gender','0','用户性别字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000202','状态','sys_status','0','通用状态字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000203','菜单类型','sys_menu_type','0','菜单类型字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000204','是否','sys_yes_no','0','是否字典','000000',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000205','配置类型','sys_config_type','0','系统配置类型','000000',0,'2026-06-11 00:58:56','2026-06-12 03:12:04'),
('000206','登录类型','sys_login_type','0','系统登录方式','000000',0,'2026-06-16 09:28:16','2026-06-16 09:28:16'),
('000207','业务类型','sys_business_type','0','系统操作业务类型','000000',0,'2026-06-16 09:28:20','2026-06-16 09:28:20'),
('000208','上传状态','sys_upload_status','0','文件上传结果状态','000000',0,'2026-06-16 09:28:24','2026-06-16 09:28:24'),
('000209','访问类型','sys_access_type','0','上传文件访问类型','000000',0,'2026-06-16 09:28:30','2026-06-16 09:28:30'),
('DT001','导航主题','sys_nav_theme','0','light/dark/realDark','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('DT002','布局类型','sys_layout_type','0','side/top/mix','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00'),
('DT003','内容宽度','sys_content_width','0','Fluid/Fixed','000000',0,'2026-07-09 09:00:00','2026-07-09 09:00:00');

-- -------------------------------------------------------
-- sys_file
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_file`;
CREATE TABLE `sys_file` (
  `file_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件ID',
  `tenant_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '租户ID',
  `storage_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储配置ID',
  `bucket_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '桶名称',
  `object_name` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对象路径',
  `original_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件名',
  `file_ext` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件后缀',
  `mime_type` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MIME类型',
  `file_size` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `access_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private' COMMENT 'public/private',
  `module_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务模块',
  `url` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '公共文件URL',
  `create_by` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_by` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`file_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_storage_id` (`storage_id`),
  KEY `idx_bucket_object` (`bucket_name`,`object_name`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_module_name` (`module_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件资源表';

-- -------------------------------------------------------
-- sys_global_search_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_global_search_config`;
CREATE TABLE `sys_global_search_config` (
  `search_id` varchar(32) NOT NULL COMMENT '搜索配置ID',
  `module_key` varchar(64) NOT NULL COMMENT '模块标识',
  `module_name` varchar(64) NOT NULL COMMENT '模块名称',
  `permission` varchar(128) NOT NULL COMMENT '全局搜索权限标识',
  `route_path` varchar(255) DEFAULT NULL COMMENT '前端跳转路径',
  `source_table` varchar(128) DEFAULT NULL COMMENT '来源业务表',
  `biz_id_field` varchar(128) DEFAULT NULL COMMENT '业务主键字段',
  `title_field` varchar(128) DEFAULT NULL COMMENT '标题字段',
  `subtitle_field` varchar(128) DEFAULT NULL COMMENT '副标题字段',
  `content_fields` varchar(1000) DEFAULT NULL COMMENT '内容字段',
  `tenant_field` varchar(64) DEFAULT 'tenant_id' COMMENT '租户字段',
  `owner_field` varchar(64) DEFAULT NULL COMMENT '负责人字段',
  `dept_field` varchar(64) DEFAULT NULL COMMENT '部门字段',
  `created_by_field` varchar(64) DEFAULT 'created_by' COMMENT '创建人字段',
  `status_field` varchar(64) DEFAULT 'status' COMMENT '状态字段',
  `deleted_field` varchar(64) DEFAULT 'deleted' COMMENT '删除字段',
  `enabled` tinyint DEFAULT '1' COMMENT '是否启用',
  `sort` int DEFAULT '0' COMMENT '排序',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`search_id`),
  UNIQUE KEY `uk_search_module` (`module_key`),
  KEY `idx_search_config_enabled` (`enabled`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局搜索配置表';

INSERT INTO `sys_global_search_config` VALUES
('GS_USER','user','用户管理','system:user:search','/system/user','sys_user','user_id','username','nickname','username,nickname,real_name,phone,email','tenant_id',NULL,'dept_id','create_by','status','deleted',1,10,'用户管理全局搜索',0,'2026-06-17 00:00:00','2026-06-17 00:00:00');

-- -------------------------------------------------------
-- sys_ip_blacklist
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_ip_blacklist`;
CREATE TABLE `sys_ip_blacklist` (
  `id` varchar(32) NOT NULL,
  `ip_address` varchar(45) NOT NULL COMMENT 'IPv4 或 IPv6 地址',
  `reason` varchar(500) DEFAULT NULL COMMENT '封禁原因',
  `source` varchar(50) NOT NULL DEFAULT 'manual' COMMENT '来源: auto/manual',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0=有效 1=已解封',
  `expire_at` datetime DEFAULT NULL COMMENT '过期时间',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `create_by` varchar(64) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_status` (`ip_address`,`status`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='IP 黑名单';

-- -------------------------------------------------------
-- sys_jobs
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_jobs`;
CREATE TABLE `sys_jobs` (
  `job_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `user_id` varchar(32) DEFAULT NULL,
  `job_type` varchar(64) NOT NULL,
  `job_data` json DEFAULT NULL,
  `status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  `attempt` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '3',
  `next_retry_at` datetime DEFAULT NULL,
  `error_message` text,
  `result` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_status_retry` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='异步任务表';

-- -------------------------------------------------------
-- sys_login_log
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_login_log`;
CREATE TABLE `sys_login_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `login_type` varchar(20) NOT NULL DEFAULT 'password' COMMENT '登录方式',
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

-- -------------------------------------------------------
-- sys_menu
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_menu`;
CREATE TABLE `sys_menu` (
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  `parent_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '父菜单ID',
  `menu_name` varchar(50) NOT NULL COMMENT '菜单名称',
  `path` varchar(200) DEFAULT NULL COMMENT '路由路径',
  `component` varchar(200) DEFAULT NULL COMMENT '组件路径',
  `perms` varchar(100) DEFAULT NULL COMMENT '权限标识',
  `icon` varchar(100) DEFAULT NULL COMMENT '图标',
  `menu_type` char(1) NOT NULL DEFAULT '1' COMMENT '0目录 1菜单 2按钮',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`menu_id`),
  KEY `idx_menu_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局菜单表';

INSERT INTO `sys_menu` VALUES
('000100','000000','系统管理','/system',NULL,NULL,'SettingOutlined','0',30,'0','2026-06-11 00:58:56','2026-06-17 08:05:37'),
('000110','000000','租户管理','/tenant',NULL,NULL,'UsergroupAddOutlined','0',40,'0','2026-06-11 00:58:56','2026-06-17 08:05:50'),
('000111','000110','租户列表','/tenant/list','system/tenant-package/tenant','system:tenant:list','UsergroupDeleteOutlined','1',1,'0','2026-06-11 00:58:56','2026-06-16 01:46:18'),
('000112','000110','租户套餐','/tenant/package','system/tenant-package/package','system:package:list','SketchOutlined','1',2,'0','2026-06-11 00:58:56','2026-06-16 01:46:18'),
('000113','000111','查询',NULL,NULL,'system:tenant:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 02:37:44'),
('000114','000111','新增',NULL,NULL,'system:tenant:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 02:37:44'),
('000115','000111','修改',NULL,NULL,'system:tenant:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('000116','000111','删除',NULL,NULL,'system:tenant:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('000117','000112','查询',NULL,NULL,'system:package:list',NULL,'2',1,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('000118','000112','新增',NULL,NULL,'system:package:add',NULL,'2',2,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('000119','000112','修改',NULL,NULL,'system:package:edit',NULL,'2',3,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('00011A','000112','删除',NULL,NULL,'system:package:remove',NULL,'2',4,'0','2026-06-11 02:37:44','2026-06-11 02:37:44'),
('000120','000100','部门管理','/system/dept','system/dept','system:dept:list',NULL,'1',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000121','000120','查询',NULL,NULL,'system:dept:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000122','000120','新增',NULL,NULL,'system:dept:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000123','000120','修改',NULL,NULL,'system:dept:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000124','000120','删除',NULL,NULL,'system:dept:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000130','000100','用户管理','/system/user','system/user','system:user:list',NULL,'1',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000131','000130','查询',NULL,NULL,'system:user:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000133','000130','修改',NULL,NULL,'system:user:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000134','000130','删除',NULL,NULL,'system:user:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000135','000130','重置密码',NULL,NULL,'system:user:resetPwd',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000140','000100','角色管理','/system/role','system/role','system:role:list',NULL,'1',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000141','000140','查询',NULL,NULL,'system:role:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000142','000140','新增',NULL,NULL,'system:role:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000143','000140','修改',NULL,NULL,'system:role:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000144','000140','删除',NULL,NULL,'system:role:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000145','000140','分配菜单',NULL,NULL,'system:role:assignMenu',NULL,'2',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000150','000100','菜单管理','/system/menu','system/menu','system:menu:list',NULL,'1',5,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000151','000150','查询',NULL,NULL,'system:menu:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000152','000150','新增',NULL,NULL,'system:menu:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000153','000150','修改',NULL,NULL,'system:menu:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000154','000150','删除',NULL,NULL,'system:menu:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000160','000100','系统参数','/system/config','system/config','system:config:list',NULL,'1',6,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000161','000160','查询',NULL,NULL,'system:config:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000162','000160','新增',NULL,NULL,'system:config:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000163','000160','修改',NULL,NULL,'system:config:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000170','000100','字典管理','/system/dict','system/dict','system:dict:list',NULL,'1',7,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000171','000170','查询',NULL,NULL,'system:dict:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000172','000170','新增',NULL,NULL,'system:dict:add',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000173','000170','修改',NULL,NULL,'system:dict:edit',NULL,'2',3,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000174','000170','删除',NULL,NULL,'system:dict:remove',NULL,'2',4,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000180','000100','主题配置','/system/theme','system/theme','system:theme:list',NULL,'1',8,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000181','000180','查询',NULL,NULL,'system:theme:list',NULL,'2',1,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000182','000180','修改',NULL,NULL,'system:theme:edit',NULL,'2',2,'0','2026-06-11 00:58:56','2026-06-11 00:58:56'),
('000190','000100','日志中心','/system/log',NULL,NULL,'FileSearchOutlined','0',8,'0','2026-06-16 09:05:28','2026-06-16 09:05:28'),
('000191','000190','登录日志','/system/log/login','system/log/login','system:log:login:list','LoginOutlined','1',1,'0','2026-06-16 09:05:35','2026-06-16 09:05:35'),
('000192','000190','操作审计','/system/log/audit','system/log/audit','system:log:audit:list','AuditOutlined','1',2,'0','2026-06-16 09:05:40','2026-06-16 09:05:40'),
('000193','000191','查询',NULL,NULL,'system:log:login:list',NULL,'2',1,'0','2026-06-16 09:05:45','2026-06-16 09:05:45'),
('000194','000191','导出',NULL,NULL,'system:log:login:export',NULL,'2',2,'0','2026-06-16 09:05:45','2026-06-16 09:05:45'),
('000195','000192','查询',NULL,NULL,'system:log:audit:list',NULL,'2',1,'0','2026-06-16 09:05:51','2026-06-16 09:05:51'),
('000196','000192','导出',NULL,NULL,'system:log:audit:export',NULL,'2',2,'0','2026-06-16 09:05:51','2026-06-16 09:05:51'),
('000197','000192','查看详情',NULL,NULL,'system:log:audit:detail',NULL,'2',3,'0','2026-06-16 09:05:51','2026-06-16 09:05:51'),
('000198','000192','清理',NULL,NULL,'system:log:audit:clean',NULL,'2',4,'0','2026-06-16 09:05:51','2026-06-16 09:05:51'),
('000199','000190','安全日志','/system/log/security','system/log/security','system:log:security:list','SecurityScanOutlined','1',3,'0','2026-07-10 03:09:00','2026-07-10 03:16:05'),
('00019A','000199','查询',NULL,NULL,'system:log:security:list',NULL,'2',1,'0','2026-07-10 03:09:00','2026-07-10 03:09:00'),
('000200','000100','安全中心','/system/security','system/security',NULL,'SafetyCertificateOutlined','1',9,'0','2026-07-13 09:37:07','2026-07-13 09:37:07'),
('000201','000200','查看',NULL,NULL,'system:security:stats',NULL,'2',1,'0','2026-07-13 09:37:07','2026-07-13 09:37:07'),
('000202','000200','IP黑名单-添加',NULL,NULL,'system:security:blacklist:add',NULL,'2',2,'0','2026-07-13 10:12:43','2026-07-13 10:12:43'),
('000203','000200','IP黑名单-移除',NULL,NULL,'system:security:blacklist:remove',NULL,'2',3,'0','2026-07-13 10:12:43','2026-07-13 10:12:43'),
('000210','000100','Webhook管理','/system/webhook','system/webhook',NULL,'LinkOutlined','1',10,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000211','000210','查看',NULL,NULL,'system:webhook:list',NULL,'2',1,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000212','000210','注册',NULL,NULL,'system:webhook:add',NULL,'2',2,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000213','000210','修改',NULL,NULL,'system:webhook:edit',NULL,'2',3,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000214','000210','删除',NULL,NULL,'system:webhook:remove',NULL,'2',4,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000215','000210','测试发送',NULL,NULL,'system:webhook:test',NULL,'2',5,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('000216','000210','重试/查看日志',NULL,NULL,'system:webhook:logs',NULL,'2',6,'0','2026-07-13 10:42:38','2026-07-13 10:42:38'),
('325518182582456320','000130','全局搜索',NULL,NULL,'system:user:search',NULL,'2',0,'0','2026-06-17 06:13:03','2026-06-17 06:13:03'),
('325518338505707520','000140','全局搜索',NULL,NULL,'system:role:search',NULL,'2',0,'0','2026-06-17 06:13:40','2026-06-17 06:13:40'),
('325518440133693440','000150','全局搜索',NULL,NULL,'system:menu:search',NULL,'1',0,'0','2026-06-17 06:14:04','2026-06-17 06:14:04'),
('325883052729438208','000100','页面配置','/system/page-config','system/page-config','system:pageconfig:list',NULL,'1',0,'0','2026-06-18 06:22:54','2026-07-09 08:12:01'),
('327266832077688832','000120','全局搜索',NULL,NULL,'system:dept:search',NULL,'2',0,'0','2026-06-22 02:01:34','2026-06-22 02:01:34'),
('327267036847804416','000160','全局搜索',NULL,NULL,'system:config:search',NULL,'2',0,'0','2026-06-22 02:02:23','2026-06-22 02:02:23'),
('327267207878938624','000170','全局搜索',NULL,NULL,'system:dict:search',NULL,'1',0,'0','2026-06-22 02:03:04','2026-06-22 02:03:04'),
('327267345460498432','000192','全局搜索',NULL,NULL,'system:log:search',NULL,'2',0,'0','2026-06-22 02:03:36','2026-06-22 02:03:36'),
('327267400540098560','000191','全局搜索',NULL,NULL,'system:log:search',NULL,'2',0,'0','2026-06-22 02:03:50','2026-06-22 02:03:50'),
('333910657307119616','000130','下线',NULL,NULL,'system:user:kick',NULL,'2',0,'0','2026-07-10 18:01:44','2026-07-10 18:07:16'),
('file_center_0001','000000','文件中心','/file-config',NULL,NULL,'FolderOutlined','0',30,'0','2026-06-15 08:40:58','2026-06-16 01:57:23'),
('file_manage_0001','file_center_0001','文件管理','/file-config/files','system/file-config/files','system:file:list','FileOutlined','1',2,'0','2026-06-15 08:41:06','2026-06-16 01:57:24'),
('file_manage_download_0001','file_manage_0001','下载',NULL,NULL,'system:file:download',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37'),
('file_manage_remove_0001','file_manage_0001','删除',NULL,NULL,'system:file:remove',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37'),
('file_manage_upload_0001','file_manage_0001','上传',NULL,NULL,'system:file:upload',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37'),
('storage_config_0001','file_center_0001','存储配置','/file-config/storage','system/file-config/storage','system:storage:list','DatabaseOutlined','1',1,'0','2026-06-15 08:41:06','2026-06-16 01:57:24'),
('storage_config_add_0001','storage_config_0001','新增',NULL,NULL,'system:storage:add',NULL,'2',1,'0','2026-06-15 08:41:37','2026-06-15 08:41:37'),
('storage_config_edit_0001','storage_config_0001','修改',NULL,NULL,'system:storage:edit',NULL,'2',2,'0','2026-06-15 08:41:37','2026-06-15 08:41:37'),
('storage_config_remove_0001','storage_config_0001','删除',NULL,NULL,'system:storage:remove',NULL,'2',3,'0','2026-06-15 08:41:37','2026-06-15 08:41:37');

-- -------------------------------------------------------
-- sys_migrations
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_migrations`;
CREATE TABLE `sys_migrations` (
  `version` varchar(64) NOT NULL COMMENT '版本号/文件名',
  `checksum` varchar(64) NOT NULL COMMENT 'SQL 文件 SHA256',
  `executed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time_ms` int NOT NULL DEFAULT '0' COMMENT '执行耗时(ms)',
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据库迁移版本记录';

INSERT INTO `sys_migrations` VALUES
('20260710_001_jobs.sql','0539f66d23b8f65972ad56a76bfab8d0606125de896dc174a917ab9fdc7b2a3e','2026-07-10 17:43:21',39),
('20260710_002_outbox.sql','59801a1eb205a9725e4b1c26fc149262c536c091764710fe442d63f27140a31d','2026-07-10 17:43:21',38),
('20260710_003_migrations.sql','a76711b845ba095b58b3d9dddec1221cff85f70c7982ed8ac5111709f3bc7a87','2026-07-10 17:43:21',40),
('20260713_004_outbox_processing_at.sql','096f807a054fc05aa3ca12c515a2d9c8fcc8867d3cabd7e1684ff2418b464b77','2026-07-13 10:42:57',147),
('20260713_005_ip_blacklist.sql','11cbb6562d31ed2338602a668cb97c60f041b8d5d28e52c2befa6b196401d5b8','2026-07-13 10:42:57',115),
('20260713_006_security_center_menu.sql','904bfb5ed7dac0d3c05e31e568c1615550a258623a82a5796e16e10dc65e9268','2026-07-13 10:42:57',110),
('20260713_007_webhook_delivery_log.sql','e098f58020fbb1d0433dd5a9bb361437a3c90062382150af5b2b4f86d3c71cf4','2026-07-13 10:42:57',118);

-- -------------------------------------------------------
-- sys_operation_log
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_operation_log`;
CREATE TABLE `sys_operation_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `business_type` varchar(30) NOT NULL COMMENT '业务类型',
  `title` varchar(200) NOT NULL COMMENT '操作标题',
  `request_method` varchar(10) DEFAULT NULL COMMENT '请求方法',
  `request_url` varchar(500) DEFAULT NULL COMMENT '请求URL',
  `request_params` longtext COMMENT '请求参数',
  `response_status` int DEFAULT NULL COMMENT '响应状态码',
  `success` tinyint NOT NULL DEFAULT '1' COMMENT '是否成功',
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

-- -------------------------------------------------------
-- sys_package
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_package`;
CREATE TABLE `sys_package` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `package_name` varchar(100) NOT NULL COMMENT '套餐名称',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐表';

INSERT INTO `sys_package` VALUES
('P001','平台版','0','000000 平台租户使用，拥有全部菜单权限','2026-06-11 00:58:56','2026-06-12 02:05:18'),
('P100','租户标准版套餐','0','普通租户标准版','2026-06-11 00:58:56','2026-06-11 00:58:56');

-- -------------------------------------------------------
-- sys_package_menu
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_package_menu`;
CREATE TABLE `sys_package_menu` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`package_id`,`menu_id`),
  KEY `idx_package_menu_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐菜单关联表';

INSERT INTO `sys_package_menu` VALUES
('P001','000100'),('P100','000100'),('P001','000110'),('P001','000111'),('P001','000112'),
('P001','000113'),('P001','000114'),('P001','000115'),('P001','000116'),('P001','000117'),
('P001','000118'),('P001','000119'),('P001','00011A'),('P001','000120'),('P100','000120'),
('P001','000121'),('P100','000121'),('P001','000122'),('P100','000122'),('P001','000123'),
('P100','000123'),('P001','000124'),('P100','000124'),('P001','000130'),('P100','000130'),
('P001','000131'),('P100','000131'),('P001','000133'),('P100','000133'),('P001','000134'),
('P100','000134'),('P001','000135'),('P100','000135'),('P001','000140'),('P100','000140'),
('P001','000141'),('P100','000141'),('P001','000142'),('P100','000142'),('P001','000143'),
('P100','000143'),('P001','000144'),('P100','000144'),('P001','000145'),('P100','000145'),
('P001','000150'),('P001','000151'),('P001','000152'),('P001','000153'),('P001','000154'),
('P001','000160'),('P100','000160'),('P001','000161'),('P100','000161'),('P001','000162'),
('P100','000162'),('P001','000163'),('P100','000163'),('P001','000170'),('P001','000171'),
('P001','000172'),('P001','000173'),('P001','000174'),('P001','000180'),('P100','000180'),
('P001','000181'),('P100','000181'),('P001','000182'),('P100','000182'),('P001','000190'),
('P100','000190'),('P001','000191'),('P100','000191'),('P001','000192'),('P100','000192'),
('P001','000193'),('P100','000193'),('P001','000194'),('P100','000194'),('P001','000195'),
('P100','000195'),('P001','000196'),('P100','000196'),('P001','000197'),('P100','000197'),
('P001','000198'),('P100','000198'),('P001','000199'),('P001','00019A'),('P001','000200'),
('P001','000201'),('P001','000202'),('P001','000203'),('P001','000210'),('P001','000211'),
('P001','000212'),('P001','000213'),('P001','000214'),('P001','000215'),('P001','000216'),
('P001','325518182582456320'),('P001','325518338505707520'),('P001','325518440133693440'),
('P001','325883052729438208'),('P001','327266832077688832'),('P001','327267036847804416'),
('P001','327267207878938624'),('P001','327267345460498432'),('P001','327267400540098560'),
('P001','333910657307119616'),('P001','file_center_0001'),('P100','file_center_0001'),
('P001','file_manage_0001'),('P100','file_manage_0001'),('P001','file_manage_download_0001'),
('P100','file_manage_download_0001'),('P001','file_manage_remove_0001'),('P100','file_manage_remove_0001'),
('P001','file_manage_upload_0001'),('P100','file_manage_upload_0001'),('P001','storage_config_0001'),
('P100','storage_config_0001'),('P001','storage_config_add_0001'),('P100','storage_config_add_0001'),
('P001','storage_config_edit_0001'),('P100','storage_config_edit_0001'),('P001','storage_config_remove_0001'),
('P100','storage_config_remove_0001');

-- -------------------------------------------------------
-- sys_page_column_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_page_column_config`;
CREATE TABLE `sys_page_column_config` (
  `column_id` varchar(32) NOT NULL COMMENT '列配置ID',
  `page_code` varchar(100) NOT NULL COMMENT '页面编码',
  `data_index` varchar(100) NOT NULL COMMENT '字段标识',
  `title` varchar(100) NOT NULL COMMENT '列标题',
  `order_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可见',
  `searchable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可搜索',
  `editable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可编辑',
  `copyable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可复制',
  `ellipsis` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否省略',
  `value_type` varchar(50) DEFAULT NULL COMMENT '值类型',
  `value_enum_code` varchar(100) DEFAULT NULL COMMENT '字典编码',
  `placeholder` varchar(200) DEFAULT NULL COMMENT '占位提示',
  `required` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否必填',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`column_id`),
  KEY `idx_col_page_code` (`page_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='页面列配置表';

INSERT INTO `sys_page_column_config` VALUES
('C001','system_user','username','用户名',1,1,1,1,1,1,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C002','system_user','nickname','昵称',2,1,0,1,0,0,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C003','system_user','realName','真实姓名',3,1,0,1,0,0,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C004','system_user','phone','手机号',4,1,0,1,0,0,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C005','system_user','email','邮箱',5,1,0,1,0,1,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C006','system_user','isAdmin','管理员',6,1,0,1,0,0,'select','sys_yes_no',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C007','system_user','status','状态',7,1,1,1,0,0,'select','sys_status',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('C008','system_user','createTime','创建时间',8,1,0,0,0,0,'dateTime',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT01','system_theme','title','系统标题',1,1,1,1,0,1,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT02','system_theme','navTheme','导航主题',2,1,0,1,0,0,'select','sys_nav_theme',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT03','system_theme','colorPrimary','主色',3,1,0,1,0,0,'text',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT04','system_theme','layout','布局',4,1,0,1,0,0,'select','sys_layout_type',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT05','system_theme','contentWidth','内容宽度',5,1,0,1,0,0,'select','sys_content_width',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT06','system_theme','fixedHeader','固定头部',6,1,0,1,0,0,'select','sys_yes_no',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT07','system_theme','fixSiderbar','固定侧栏',7,1,0,1,0,0,'select','sys_yes_no',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT08','system_theme','colorWeak','色弱模式',8,1,0,1,0,0,'select','sys_yes_no',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT09','system_theme','status','状态',9,1,1,1,0,0,'select','sys_status',NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('CT10','system_theme','createTime','创建时间',10,1,0,0,0,0,'dateTime',NULL,NULL,0,'000000',0,'2026-07-09 03:48:12','2026-07-09 03:48:12');

-- -------------------------------------------------------
-- sys_page_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_page_config`;
CREATE TABLE `sys_page_config` (
  `page_config_id` varchar(32) NOT NULL COMMENT '页面配置ID',
  `page_code` varchar(100) NOT NULL COMMENT '页面编码',
  `page_name` varchar(100) NOT NULL COMMENT '页面名称',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`page_config_id`),
  UNIQUE KEY `uk_page_code_tenant` (`tenant_id`,`page_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='页面配置表';

INSERT INTO `sys_page_config` VALUES
('P001','system_user','用户管理',1,10,'000000','用户管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P002','system_role','角色管理',1,20,'000000','角色管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P003','system_dept','部门管理',1,30,'000000','部门管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P004','system_menu','菜单管理',1,40,'000000','菜单管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P005','system_config','系统参数',1,50,'000000','系统参数页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P007','system_theme','主题配置',1,70,'000000','主题配置页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P009','system_tenant','租户管理',1,90,'000000','租户管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P010','system_package','套餐管理',1,100,'000000','套餐管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P011','system_storage','存储配置',1,110,'000000','存储配置页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P012','file_manager','文件管理',1,120,'000000','文件管理页面配置',0,'2026-07-09 03:48:12','2026-07-09 03:48:12'),
('P013','system_dict_type','字典类型管理',1,65,'000000','字典类型页面配置',0,'2026-07-09 08:27:08','2026-07-09 08:27:08'),
('P014','system_dict_data','字典数据管理',1,66,'000000','字典数据页面配置',0,'2026-07-09 08:27:08','2026-07-09 08:27:08'),
('P015','system_log_operation','操作审计',1,81,'000000','操作审计日志页面配置',0,'2026-07-09 08:27:08','2026-07-09 08:27:08'),
('P016','system_log_upload','上传审计',1,82,'000000','上传审计日志页面配置',0,'2026-07-09 08:27:08','2026-07-09 08:27:08'),
('P017','system_log_login','登录日志',1,83,'000000','登录日志页面配置',0,'2026-07-09 08:27:08','2026-07-09 08:27:08'),
('P018','system_log_security','安全日志',1,84,'000000','安全日志页面配置',0,'2026-07-10 03:07:18','2026-07-10 03:07:18'),
('PC_WEBHOOK','system:webhook:list','Webhook管理',1,10,'000000',NULL,0,'2026-07-13 11:42:37','2026-07-13 11:42:37');

-- -------------------------------------------------------
-- sys_role
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_role`;
CREATE TABLE `sys_role` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `role_name` varchar(50) NOT NULL COMMENT '角色名称',
  `role_key` varchar(50) NOT NULL COMMENT '角色标识',
  `data_scope` varchar(20) NOT NULL DEFAULT 'TENANT' COMMENT '数据权限范围',
  `sort_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uk_role_tenant_key` (`tenant_id`,`role_key`),
  KEY `idx_role_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色表';

INSERT INTO `sys_role` VALUES
('000001','000000','超级管理员','admin','TENANT',1,'0','平台超级管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('100001','100000','租户管理员','tenant_admin','TENANT',1,'0','默认租户管理员角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('100002','100000','普通用户','user','TENANT',2,'0','默认租户普通用户角色',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');

-- -------------------------------------------------------
-- sys_role_menu
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_role_menu`;
CREATE TABLE `sys_role_menu` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色菜单关联表';

INSERT INTO `sys_role_menu` VALUES
('000001','000100'),('000001','000110'),('000001','000111'),('000001','000112'),('000001','000113'),
('000001','000114'),('000001','000115'),('000001','000116'),('000001','000117'),('000001','000118'),
('000001','000119'),('000001','00011A'),('000001','000120'),('000001','000121'),('000001','000122'),
('000001','000123'),('000001','000124'),('000001','000130'),('000001','000131'),('000001','000133'),
('000001','000134'),('000001','000135'),('000001','000140'),('000001','000141'),('000001','000142'),
('000001','000143'),('000001','000144'),('000001','000145'),('000001','000150'),('000001','000151'),
('000001','000152'),('000001','000153'),('000001','000154'),('000001','000160'),('000001','000161'),
('000001','000162'),('000001','000163'),('000001','000170'),('000001','000171'),('000001','000172'),
('000001','000173'),('000001','000174'),('000001','000180'),('000001','000181'),('000001','000182'),
('000001','000190'),('000001','000191'),('000001','000192'),('000001','000193'),('000001','000194'),
('000001','000195'),('000001','000196'),('000001','000197'),('000001','000198'),('000001','000199'),
('000001','00019A'),('000001','000200'),('000001','000201'),('000001','000202'),('000001','000203'),
('000001','000210'),('000001','000211'),('000001','000212'),('000001','000213'),('000001','000214'),
('000001','000215'),('000001','000216'),('000001','325518182582456320'),('000001','325518338505707520'),
('000001','325518440133693440'),('000001','325883052729438208'),('000001','327266832077688832'),
('000001','327267036847804416'),('000001','327267207878938624'),('000001','327267345460498432'),
('000001','327267400540098560'),('000001','333910657307119616'),('000001','file_center_0001'),
('000001','file_manage_0001'),('000001','file_manage_download_0001'),('000001','file_manage_remove_0001'),
('000001','file_manage_upload_0001'),('000001','storage_config_0001'),('000001','storage_config_add_0001'),
('000001','storage_config_edit_0001'),('000001','storage_config_remove_0001'),
('100001','000100'),('100001','000120'),('100001','000121'),('100001','000122'),('100001','000123'),
('100001','000124'),('100001','000130'),('100001','000131'),('100001','000133'),('100001','000134'),
('100001','000135'),('100001','000140'),('100001','000141'),('100001','000142'),('100001','000143'),
('100001','000144'),('100001','000145'),('100001','000160'),('100001','000161'),('100001','000162'),
('100001','000163'),('100001','000180'),('100001','000181'),('100001','000182'),('100001','000190'),
('100001','000191'),('100001','000192'),('100001','000193'),('100001','000194'),('100001','000195'),
('100001','000196'),('100001','000197'),('100001','000198'),('100001','file_center_0001'),
('100001','file_manage_0001'),('100001','file_manage_download_0001'),('100001','file_manage_remove_0001'),
('100001','file_manage_upload_0001'),
('100002','000100'),('100002','000120'),('100002','000121'),('100002','000130'),('100002','000131'),
('100002','000160'),('100002','000161');

-- -------------------------------------------------------
-- sys_search_index
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_search_index`;
CREATE TABLE `sys_search_index` (
  `index_id` varchar(128) NOT NULL COMMENT '索引ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `module_key` varchar(64) NOT NULL COMMENT '模块标识',
  `module_name` varchar(64) NOT NULL COMMENT '模块名称',
  `biz_id` varchar(64) NOT NULL COMMENT '业务主键ID',
  `title` varchar(255) NOT NULL COMMENT '搜索标题',
  `subtitle` varchar(255) DEFAULT NULL COMMENT '搜索副标题',
  `content` text COMMENT '搜索内容',
  `permission` varchar(128) NOT NULL COMMENT '搜索权限标识',
  `route_path` varchar(255) DEFAULT NULL COMMENT '跳转路径',
  `owner_id` varchar(64) DEFAULT NULL COMMENT '负责人ID',
  `dept_id` varchar(64) DEFAULT NULL COMMENT '部门ID',
  `status` char(1) DEFAULT '0' COMMENT '状态',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`index_id`),
  KEY `idx_search_tenant_module` (`tenant_id`,`module_key`),
  KEY `idx_search_biz` (`biz_id`),
  FULLTEXT KEY `ft_search_content` (`title`,`subtitle`,`content`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局搜索索引表';

-- -------------------------------------------------------
-- sys_security_log
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_security_log`;
CREATE TABLE `sys_security_log` (
  `id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `event_type` varchar(64) NOT NULL COMMENT '事件类型',
  `risk_level` varchar(20) NOT NULL DEFAULT 'medium' COMMENT 'low/medium/high/critical',
  `title` varchar(200) NOT NULL COMMENT '事件标题',
  `detail` text COMMENT '事件详情',
  `username` varchar(50) DEFAULT NULL,
  `user_id` varchar(32) DEFAULT NULL,
  `route` varchar(500) DEFAULT NULL,
  `method` varchar(10) DEFAULT NULL,
  `client_ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_security_tenant_time` (`tenant_id`,`create_time`),
  KEY `idx_security_event_type` (`event_type`),
  KEY `idx_security_risk` (`risk_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='安全日志表';

-- -------------------------------------------------------
-- sys_storage_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_storage_config`;
CREATE TABLE `sys_storage_config` (
  `storage_id` varchar(32) NOT NULL COMMENT '存储配置ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `storage_name` varchar(100) NOT NULL COMMENT '存储名称',
  `storage_type` varchar(30) NOT NULL COMMENT '存储类型：minio/aliyun_oss/aws_s3/local等',
  `endpoint` varchar(500) DEFAULT NULL COMMENT 'Endpoint',
  `region` varchar(100) DEFAULT NULL COMMENT 'Region',
  `access_key` varchar(500) DEFAULT NULL COMMENT 'AccessKey',
  `secret_key` varchar(500) DEFAULT NULL COMMENT 'SecretKey',
  `port` int DEFAULT NULL COMMENT '端口',
  `use_ssl` tinyint DEFAULT '0' COMMENT '是否使用SSL',
  `public_bucket` varchar(100) DEFAULT NULL COMMENT '公共桶',
  `private_bucket` varchar(100) DEFAULT NULL COMMENT '私有桶',
  `public_base_url` varchar(1000) DEFAULT NULL COMMENT '公共访问基础URL',
  `is_default` tinyint NOT NULL DEFAULT '0' COMMENT '是否默认',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`storage_id`),
  KEY `idx_storage_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='存储配置表';

-- -------------------------------------------------------
-- sys_tenant
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_tenant`;
CREATE TABLE `sys_tenant` (
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `tenant_name` varchar(100) NOT NULL COMMENT '租户名称',
  `domain_name` varchar(200) DEFAULT NULL COMMENT '绑定域名',
  `package_id` varchar(32) DEFAULT NULL COMMENT '套餐ID',
  `contact_user` varchar(50) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(30) DEFAULT NULL COMMENT '联系电话',
  `expire_time` datetime DEFAULT NULL COMMENT '过期时间',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`),
  KEY `idx_tenant_domain` (`domain_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户表';

INSERT INTO `sys_tenant` VALUES
('000000','平台租户','platform.example.com','P001','超级管理员','13800000001',NULL,'0','平台管理租户',0,'2026-06-11 00:58:56','2026-06-11 00:58:56'),
('100000','默认租户','demo.example.com','P100','租户管理员',NULL,NULL,'0','默认演示租户',0,'2026-06-11 00:58:56','2026-06-11 00:58:56');

-- -------------------------------------------------------
-- sys_theme_config
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_theme_config`;
CREATE TABLE `sys_theme_config` (
  `theme_id` varchar(32) NOT NULL COMMENT '主题ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `nav_theme` varchar(20) NOT NULL DEFAULT 'light' COMMENT '导航主题',
  `color_primary` varchar(20) DEFAULT '#1677ff' COMMENT '主色',
  `layout` varchar(20) NOT NULL DEFAULT 'mix' COMMENT '布局类型',
  `content_width` varchar(20) NOT NULL DEFAULT 'Fluid' COMMENT '内容宽度',
  `fixed_header` tinyint NOT NULL DEFAULT '0' COMMENT '固定头部',
  `fix_siderbar` tinyint NOT NULL DEFAULT '1' COMMENT '固定侧栏',
  `color_weak` tinyint NOT NULL DEFAULT '0' COMMENT '色弱模式',
  `split_menus` tinyint NOT NULL DEFAULT '0' COMMENT '自动分割菜单',
  `sider_menu_type` varchar(20) NOT NULL DEFAULT 'sub' COMMENT '侧边菜单类型',
  `title` varchar(100) DEFAULT NULL COMMENT '标题',
  `logo` varchar(500) DEFAULT NULL COMMENT 'Logo URL',
  `iconfont_url` varchar(500) DEFAULT NULL COMMENT '图标字体URL',
  `token_json` text COMMENT 'Token JSON',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`theme_id`),
  KEY `idx_theme_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='主题配置表';

-- -------------------------------------------------------
-- sys_upload_audit
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_upload_audit`;
CREATE TABLE `sys_upload_audit` (
  `audit_id` varchar(32) NOT NULL COMMENT '审计ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `module_name` varchar(100) DEFAULT NULL COMMENT '模块名称',
  `access_type` char(10) NOT NULL COMMENT '访问类型：public/private',
  `storage_id` varchar(32) DEFAULT NULL COMMENT '存储配置ID',
  `storage_type` varchar(30) DEFAULT NULL COMMENT '存储类型',
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

-- -------------------------------------------------------
-- sys_user
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '密码',
  `password_algorithm` varchar(20) NOT NULL DEFAULT 'md5' COMMENT '密码算法：argon2id/md5',
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
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_by` varchar(32) DEFAULT NULL COMMENT '创建人ID',
  `update_by` varchar(32) DEFAULT NULL COMMENT '更新人ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_tenant_username` (`tenant_id`,`username`),
  KEY `idx_user_tenant` (`tenant_id`),
  KEY `idx_user_phone` (`phone`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_dept` (`dept_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户表';

INSERT INTO `sys_user` VALUES
('000001','000000','superadmin','$argon2id$v=19$m=65536,t=3,p=4$LHe+AVDV4wP/VbvaGI0+IA$jmibAFj1WxHX3wQcVWKy/P3VnRRuK781T/XNYjbQ87E','argon2id','超级管理员',NULL,NULL,'0','admin@example.com','13800000001','000001','1','0',NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-06-11 00:58:56','2026-06-22 08:30:06'),
('100001','100000','admin','e10adc3949ba59abbe56e057f20f883e','md5','租户管理员','租户管理员',NULL,'2',NULL,NULL,'100001','1','0',NULL,NULL,NULL,'默认租户管理员',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 03:12:44'),
('100002','100000','user','e10adc3949ba59abbe56e057f20f883e','md5','普通用户',NULL,NULL,'2',NULL,NULL,NULL,'0','0',NULL,NULL,NULL,'默认租户普通用户',0,NULL,NULL,'2026-06-11 00:58:56','2026-06-11 07:47:37');

-- -------------------------------------------------------
-- sys_user_role
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_user_role`;
CREATE TABLE `sys_user_role` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`,`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联表';

INSERT INTO `sys_user_role` VALUES
('000001','000001'),
('100001','100001'),
('100002','100002');

-- -------------------------------------------------------
-- sys_webhook
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_webhook`;
CREATE TABLE `sys_webhook` (
  `webhook_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'Webhook 名称',
  `url` varchar(500) NOT NULL COMMENT '回调 URL',
  `events` json DEFAULT NULL COMMENT '订阅事件列表',
  `secret` varchar(64) NOT NULL COMMENT 'HMAC 签名密钥',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`webhook_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Webhook 订阅表';

-- -------------------------------------------------------
-- sys_webhook_delivery
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_webhook_delivery`;
CREATE TABLE `sys_webhook_delivery` (
  `id` varchar(32) NOT NULL,
  `webhook_id` varchar(32) NOT NULL,
  `event` varchar(100) NOT NULL COMMENT '事件类型',
  `payload` text COMMENT '发送的 payload',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/success/failed',
  `response_code` int DEFAULT NULL COMMENT 'HTTP 响应码',
  `response_body` text COMMENT '响应内容',
  `error_message` varchar(500) DEFAULT NULL COMMENT '错误信息',
  `attempt` int NOT NULL DEFAULT '1',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhook_id` (`webhook_id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_event` (`event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Webhook 投递日志';

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
