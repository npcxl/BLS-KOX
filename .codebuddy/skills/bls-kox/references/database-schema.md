# BLS-KOX Database Schema Reference

All tables defined in `sql/Init.sql`. Charset: utf8mb4, Collation: utf8mb4_0900_ai_ci.

## Critical Conventions

- **Multi-tenant tables** have `tenant_id varchar(32)` column
- **Soft-delete tables** have `deleted tinyint NOT NULL DEFAULT '0'` (0=active, 1=deleted)
- `tenant_id = '000000'` = platform super-admin
- **Sort column**: `sort_num` (NOT `order_num`)
- **Timestamp columns**: `create_time` / `update_time` (NOT `created_at` / `updated_at`)
- **Status column**: `char(1)` type, `'0'` = normal, `'1'` = disabled
- **Menu type**: `char(1)`, `'0'` = directory, `'1'` = menu page, `'2'` = button

---

## sys_menu

```sql
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
);
```

**Insert template:**
```sql
INSERT INTO `sys_menu` (`menu_id`,`parent_id`,`menu_name`,`path`,`component`,`perms`,`icon`,`menu_type`,`sort_num`,`status`)
VALUES ('id','parent_id','Name','/path','component/path','perm:code','IconName','0',1,'0');
```

## sys_user

```sql
CREATE TABLE `sys_user` (
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `dept_id` varchar(32) DEFAULT NULL COMMENT '部门ID',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password` varchar(200) NOT NULL COMMENT '密码',
  `nickname` varchar(50) DEFAULT NULL COMMENT '昵称',
  `real_name` varchar(50) DEFAULT NULL COMMENT '真实姓名',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `avatar` varchar(200) DEFAULT NULL COMMENT '头像',
  `is_admin` char(1) NOT NULL DEFAULT '0' COMMENT '0否 1是',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_by` varchar(32) DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_username_tenant` (`tenant_id`,`username`),
  KEY `idx_user_dept` (`dept_id`)
);
```

## sys_role

```sql
CREATE TABLE `sys_role` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `role_name` varchar(50) NOT NULL COMMENT '角色名称',
  `role_code` varchar(50) NOT NULL COMMENT '角色标识',
  `role_type` varchar(20) DEFAULT 'TENANT' COMMENT 'PLATFORM/TENANT',
  `sort_num` int DEFAULT '0' COMMENT '排序',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  KEY `idx_role_tenant` (`tenant_id`)
);
```

**Seed roles:**
| role_id | role_name | role_code | tenant_id |
|---------|-----------|-----------|-----------|
| 000001 | 超级管理员 | admin | 000000 |
| 100001 | 租户管理员 | tenant_admin | 100000 |
| 100002 | 普通用户 | user | 100000 |

## sys_role_menu

```sql
CREATE TABLE `sys_role_menu` (
  `role_id` varchar(32) NOT NULL COMMENT '角色ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`role_id`,`menu_id`)
);
```

**Insert template:**
```sql
INSERT INTO `sys_role_menu` VALUES ('role_id','menu_id');
```

## sys_tenant

```sql
CREATE TABLE `sys_tenant` (
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `package_id` varchar(32) DEFAULT NULL COMMENT '套餐ID',
  `tenant_name` varchar(100) NOT NULL COMMENT '租户名称',
  `domain_name` varchar(100) DEFAULT NULL COMMENT '绑定域名',
  `contact_user` varchar(50) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(20) DEFAULT NULL COMMENT '联系电话',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`)
);
```

**Seed:** `('000000','000','平台','',...)`, `('100000','001','默认租户','local.kox.com',...)`

## sys_dept

```sql
CREATE TABLE `sys_dept` (
  `dept_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `parent_id` varchar(32) NOT NULL DEFAULT '000000',
  `dept_name` varchar(50) NOT NULL,
  `sort_num` int DEFAULT '0',
  `status` char(1) DEFAULT '0',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dept_id`)
);
```

## sys_config

```sql
CREATE TABLE `sys_config` (
  `config_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `config_key` varchar(100) NOT NULL,
  `config_value` text NOT NULL,
  `config_name` varchar(100) NOT NULL,
  `config_type` varchar(20) NOT NULL DEFAULT 'sys' COMMENT 'sys/theme/dict',
  `status` char(1) NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT NULL,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`),
  UNIQUE KEY `uk_config_tenant_key` (`tenant_id`,`config_key`)
);
```

## sys_dict_type

```sql
CREATE TABLE `sys_dict_type` (
  `dict_type_id` varchar(32) NOT NULL,
  `dict_name` varchar(100) NOT NULL,
  `dict_type` varchar(100) NOT NULL,
  `status` char(1) NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_type_id`)
);
```

## sys_dict_data

```sql
CREATE TABLE `sys_dict_data` (
  `dict_data_id` varchar(32) NOT NULL,
  `dict_type_id` varchar(32) NOT NULL,
  `dict_label` varchar(100) NOT NULL,
  `dict_value` varchar(100) NOT NULL,
  `dict_sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `tag` varchar(30) DEFAULT 'default',
  `status` char(1) NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dict_data_id`)
);
```

## sys_page_config

```sql
CREATE TABLE `sys_page_config` (
  `config_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `page_code` varchar(64) NOT NULL COMMENT '页面标识',
  `page_name` varchar(64) NOT NULL COMMENT '页面名称',
  `route_path` varchar(255) DEFAULT NULL,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`),
  UNIQUE KEY `uk_page_code_tenant` (`tenant_id`,`page_code`)
);
```

## sys_page_column_config

```sql
CREATE TABLE `sys_page_column_config` (
  `col_id` varchar(32) NOT NULL,
  `page_code` varchar(64) NOT NULL,
  `col_key` varchar(64) NOT NULL COMMENT '字段key（对应表字段名）',
  `col_label` varchar(64) NOT NULL COMMENT '列标题',
  `sort_order` int NOT NULL DEFAULT '0',
  `visible` tinyint NOT NULL DEFAULT '1' COMMENT '0隐藏 1显示',
  `searchable` tinyint NOT NULL DEFAULT '0',
  `sortable` tinyint NOT NULL DEFAULT '0',
  `editable` tinyint NOT NULL DEFAULT '0',
  `filterable` tinyint NOT NULL DEFAULT '0',
  `input_type` varchar(20) NOT NULL DEFAULT 'text',
  `dict_type` varchar(100) DEFAULT NULL,
  `width` int DEFAULT NULL,
  `fixed_side` char(10) DEFAULT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`col_id`),
  KEY `idx_col_page_code` (`page_code`)
);
```

## sys_operation_log

```sql
CREATE TABLE `sys_operation_log` (
  `log_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `username` varchar(50) DEFAULT NULL,
  `operation` varchar(100) DEFAULT NULL COMMENT '操作描述',
  `method` varchar(10) DEFAULT NULL COMMENT 'HTTP method',
  `url` varchar(500) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `params` text,
  `result` text,
  `duration` int DEFAULT NULL COMMENT '耗时ms',
  `success` char(1) DEFAULT '1',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_op_log_tenant` (`tenant_id`),
  KEY `idx_op_log_time` (`create_time`)
);
```

## sys_security_log

```sql
CREATE TABLE `sys_security_log` (
  `event_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `event_type` varchar(64) NOT NULL COMMENT '事件类型枚举',
  `risk_level` int DEFAULT 0 COMMENT '0信息 1低 2中 3高 4严重',
  `username` varchar(50) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `detail` text,
  `raw_data` json DEFAULT NULL,
  `status` char(1) DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_security_tenant` (`tenant_id`),
  KEY `idx_security_time` (`create_time`),
  KEY `idx_security_type` (`event_type`),
  KEY `idx_security_risk` (`risk_level`)
);
```

## sys_login_log

```sql
CREATE TABLE `sys_login_log` (
  `log_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `username` varchar(50) DEFAULT NULL,
  `login_status` char(1) NOT NULL DEFAULT '1' COMMENT '1成功 0失败',
  `fail_reason` varchar(500) DEFAULT NULL,
  `login_ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_login_log_tenant` (`tenant_id`),
  KEY `idx_login_log_time` (`create_time`)
);
```

## sys_ip_blacklist

```sql
CREATE TABLE `sys_ip_blacklist` (
  `ip_id` varchar(32) NOT NULL,
  `ip` varchar(45) NOT NULL COMMENT 'IP地址',
  `reason` varchar(200) DEFAULT NULL COMMENT '封禁原因',
  `ban_until` datetime DEFAULT NULL COMMENT '解封时间',
  `ban_count` int DEFAULT '0',
  `status` char(1) DEFAULT '0' COMMENT '0封禁中 1已解封',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ip_id`),
  KEY `idx_ip_tenant` (`tenant_id`)
);
```

## sys_job

```sql
CREATE TABLE `sys_job` (
  `job_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `job_name` varchar(100) NOT NULL,
  `job_group` varchar(100) DEFAULT 'DEFAULT',
  `cron_expression` varchar(100) DEFAULT NULL,
  `handler_class` varchar(200) DEFAULT NULL,
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`)
);
```

## sys_file

```sql
CREATE TABLE `sys_file` (
  `file_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `config_id` varchar(32) DEFAULT NULL,
  `original_name` varchar(500) NOT NULL,
  `stored_name` varchar(500) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` bigint DEFAULT '0',
  `mime_type` varchar(100) DEFAULT NULL,
  `file_ext` varchar(20) DEFAULT NULL,
  `md5_hash` varchar(64) DEFAULT NULL,
  `status` char(1) DEFAULT '0',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_by` varchar(32) DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`file_id`)
);
```

## sys_file_config

```sql
CREATE TABLE `sys_file_config` (
  `config_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `config_name` varchar(100) NOT NULL,
  `storage_type` varchar(20) NOT NULL COMMENT 'local/minio/s3',
  `endpoint` varchar(200) DEFAULT NULL,
  `bucket` varchar(200) DEFAULT NULL,
  `access_key` varchar(200) DEFAULT NULL,
  `secret_key` varchar(200) DEFAULT NULL,
  `base_path` varchar(500) DEFAULT '/',
  `max_size_mb` int DEFAULT '20',
  `allowed_ext` varchar(500) DEFAULT '*',
  `status` char(1) DEFAULT '0',
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`)
);
```

## Common Gotchas

1. **Column naming**: Use `sort_num` (NOT `order_num`), `create_time`/`update_time` (NOT `created_at`/`updated_at`)
2. **Status values**: `char(1)`, `'0'` = normal/active, `'1'` = disabled
3. **Deleted flag**: `tinyint`, `0` = active, `1` = deleted — ALWAYS filter with `deleted = 0`
4. **Tenant isolation**: All multi-tenant queries MUST include `tenant_id = ?` filter
5. **Menu type**: `'0'`=directory(folder), `'1'`=page, `'2'`=button
6. **sys_config key format**: `sys.app.name`, `sys.user.defaultPassword`, `sys.upload.maxSize` etc.
7. **ID format**: Varchar(32) Snowflake IDs, seed roles/users use shorter IDs like `000001`
8. **All IDs are strings**: Despite Snowflake being numeric, store as `varchar(32)`
