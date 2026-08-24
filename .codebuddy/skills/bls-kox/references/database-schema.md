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
- **例外**: AI 对话表（`ai_conversation`/`ai_conversation_message`）和 `sys_ai_usage` 使用 `created_at`/`updated_at`、`BIGINT` 主键（非 varchar(32)），与主后端表规范不同

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面配置表';
```

## sys_page_column_config

```sql
CREATE TABLE `sys_page_column_config` (
  `column_id` varchar(32) NOT NULL COMMENT '列配置ID',
  `page_code` varchar(100) NOT NULL COMMENT '页面编码',
  `data_index` varchar(100) NOT NULL COMMENT '字段标识（camelCase，对应表字段名）',
  `title` varchar(100) NOT NULL COMMENT '列标题',
  `order_num` int NOT NULL DEFAULT '0' COMMENT '排序',
  `visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可见',
  `searchable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可搜索',
  `editable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可编辑',
  `copyable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可复制',
  `ellipsis` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否省略',
  `value_type` varchar(50) DEFAULT NULL COMMENT '值类型: text/select/date/digit/textarea/image/dateTime',
  `value_enum_code` varchar(100) DEFAULT NULL COMMENT '字典编码',
  `placeholder` varchar(200) DEFAULT NULL COMMENT '占位提示',
  `required` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否必填',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`column_id`),
  KEY `idx_col_page_code` (`page_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面列配置表';
```

> **注意**：这是新版 schema（字段为 `column_id`/`data_index`/`title`/`order_num`/`value_type`/`value_enum_code`/`required`）。前端 `usePageConfig()` hook 读取此表生成 ProTable 动态列。

## ai_model_config (AI 模型配置)

```sql
CREATE TABLE `ai_model_config` (
  `config_id`   VARCHAR(32)  NOT NULL COMMENT '配置ID',
  `tenant_id`   VARCHAR(32)  NOT NULL DEFAULT '000000',
  `model_name`  VARCHAR(100) NOT NULL COMMENT '模型显示名称',
  `model_type`  VARCHAR(20)  NOT NULL DEFAULT 'api' COMMENT 'api=API模型 local=本地模型',
  `provider`    VARCHAR(50)  NOT NULL COMMENT '提供商',
  `model_id`    VARCHAR(100) NOT NULL COMMENT '模型标识',
  `api_key`     VARCHAR(500) DEFAULT NULL,
  `base_url`    VARCHAR(500) DEFAULT NULL,
  `temperature` DECIMAL(3,2) NOT NULL DEFAULT 0.30,
  `max_tokens`  INT          NOT NULL DEFAULT 4096,
  `timeout_ms`  INT          NOT NULL DEFAULT 60000,
  `is_default`  CHAR(1)      NOT NULL DEFAULT '0',
  `status`      CHAR(1)      NOT NULL DEFAULT '0',
  `sort_num`    INT          NOT NULL DEFAULT 0,
  `remark`      VARCHAR(500) DEFAULT NULL,
  `deleted`     TINYINT      NOT NULL DEFAULT 0,
  `create_by`   VARCHAR(32)  DEFAULT NULL,
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_by`   VARCHAR(32)  DEFAULT NULL,
  `update_time` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`),
  INDEX `idx_tenant_status` (`tenant_id`, `status`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI模型配置';
```

**Seed data:**
| config_id | model_name | model_type | provider | model_id | api_key | base_url |
|-----------|-----------|-----------|----------|----------|---------|----------|
| ai_cfg_001 | Qwen2.5 | local | ollama | qwen2.5:7b | NULL | http://ollama:11434/v1 (is_default='1') |
| ai_cfg_002 | DeepSeek V4 | api | deepseek | deepseek-chat | CHANGE_TO_YOUR_API_KEY | https://api.deepseek.com/v1 |
| ai_cfg_003 | Unlimited-OCR 图片识别 | local | ollama | hf.co/vimalnakrani/unlimited-ocr-gguf:Q5_K_M | NULL | http://ollama:11434/v1 |

> **坑**：DECIMAL 字段（temperature）用 SQLx 读时需 `CAST(temperature AS DOUBLE)`；api_key 数据库存明文，前端掩码显示。Rust 后端读配置时 key 为空或 `CHANGE_TO_` 前缀则降级 `.env` 的 OPENAI_API_KEY。

## sys_ai_usage (AI 用量统计)

```sql
CREATE TABLE `sys_ai_usage` (
  `usage_id`    VARCHAR(32)  NOT NULL COMMENT '用量ID',
  `tenant_id`   VARCHAR(32)  NOT NULL DEFAULT '000000',
  `user_id`     VARCHAR(32)  DEFAULT NULL,
  `username`    VARCHAR(50)  DEFAULT NULL,
  `model_name`  VARCHAR(100) NOT NULL COMMENT '模型名称',
  `provider`    VARCHAR(50)  NOT NULL COMMENT '提供商',
  `endpoint`    VARCHAR(64)  NOT NULL DEFAULT 'chat' COMMENT '接口: chat/crud/sql/audit/config',
  `prompt_tokens`      INT NOT NULL DEFAULT 0,
  `completion_tokens`  INT NOT NULL DEFAULT 0,
  `total_tokens`       INT NOT NULL DEFAULT 0,
  `estimated_cost`     DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT '估算费用(USD)',
  `elapsed_ms`  INT NOT NULL DEFAULT 0,
  `success`     TINYINT NOT NULL DEFAULT 1,
  `error_msg`   VARCHAR(500) DEFAULT NULL,
  `stream_mode` TINYINT NOT NULL DEFAULT 0 COMMENT '0=非流式 1=流式(估算)',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`usage_id`),
  INDEX `idx_usage_tenant_time` (`tenant_id`, `created_at`),
  INDEX `idx_usage_user_time` (`user_id`, `created_at`),
  INDEX `idx_usage_model` (`model_name`),
  INDEX `idx_usage_endpoint` (`endpoint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 用量统计表';
```

## ai_conversation (AI 对话)

```sql
CREATE TABLE `ai_conversation` (
  `id`          BIGINT       NOT NULL,
  `user_id`     BIGINT       NOT NULL,
  `tenant_id`   VARCHAR(20)  NOT NULL DEFAULT '000000',
  `title`       VARCHAR(200) NOT NULL DEFAULT '新对话',
  `deleted`     TINYINT      NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL,
  `updated_at`  DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_user_tenant` (`user_id`, `tenant_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## ai_conversation_message (AI 对话消息)

```sql
CREATE TABLE `ai_conversation_message` (
  `id`              BIGINT        NOT NULL,
  `conversation_id` BIGINT        NOT NULL,
  `role`            VARCHAR(20)   NOT NULL,
  `content`         LONGTEXT      NOT NULL,
  `deleted`         TINYINT       NOT NULL DEFAULT 0,
  `created_at`      DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_conversation` (`conversation_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## sys_sql_audit (SQL 错误审计)

```sql
CREATE TABLE `sys_sql_audit` (
  `audit_id`    varchar(32)  NOT NULL COMMENT '审计ID',
  `tenant_id`   varchar(32)  NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id`     varchar(32)  DEFAULT NULL COMMENT '用户ID',
  `username`    varchar(50)  DEFAULT NULL COMMENT '用户名',
  `operation`   varchar(50)  NOT NULL COMMENT '操作类型(query/query_one/execute/transaction)',
  `sql_text`    longtext     NOT NULL COMMENT '报错的 SQL 语句',
  `error_code`  varchar(50)  DEFAULT NULL COMMENT '错误码',
  `error_number` int         DEFAULT NULL COMMENT 'MySQL 错误编号',
  `error_message` varchar(2000) DEFAULT NULL COMMENT '错误信息',
  `client_ip`   varchar(45)  DEFAULT NULL COMMENT '客户端IP',
  `user_agent`  varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `request_id`  varchar(64)  DEFAULT NULL COMMENT '请求追踪ID',
  `created_at`  datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`audit_id`),
  KEY `idx_sql_audit_tenant_time` (`tenant_id`, `created_at`),
  KEY `idx_sql_audit_operation` (`operation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='SQL 错误审计表';
```

> 由 `bls-server/src/core/sql-audit.ts` 的 `writeSqlError()` 写入（fire-and-forget），`core/database.ts` 的 `query`/`queryOne`/`execute` catch 块调用。注意 writeSqlError 内部必须用 `pool.execute` 直接执行，避免递归审计。

## sys_package (租户套餐)

```sql
CREATE TABLE `sys_package` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `package_name` varchar(100) NOT NULL COMMENT '套餐名称',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户套餐表';
```

**Seed:** `('P001','平台版','0',...)`, `('P100','租户标准版套餐','0',...)`

## sys_package_menu (套餐菜单关联)

```sql
CREATE TABLE `sys_package_menu` (
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `menu_id` varchar(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`package_id`,`menu_id`),
  KEY `idx_package_menu_menu` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐菜单关联表';
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
9. **AI 表例外**: `ai_conversation`/`ai_conversation_message` 使用 BIGINT 主键 + `created_at`/`updated_at` 命名，不遵循主表规范。`sys_ai_usage` 也使用 `created_at` 而非 `create_time`
10. **AI 模型配置(temperature)**: `DECIMAL(3,2)` 字段，用 SQLx 读时需 `CAST(temperature AS DOUBLE)` 避免 panic
11. **SQL 审计递归**: `writeSqlError()` 内部必须用 `pool.execute` 直接执行（绕过审计钩子），否则报错写入 SQL 会触发递归
12. **sys_page_config/sys_page_column_config 新版 schema**: 字段为 `page_config_id`/`page_code`/`data_index`/`title`/`order_num`/`value_type`/`value_enum_code`/`required`，前端 `usePageConfig()` hook 读取
13. **sys_migrations**: 数据库迁移版本记录表，`version` 为文件名，`checksum` 为 SHA256，`execution_time_ms` 为执行耗时。执行迁移时跳过已存在的 version
