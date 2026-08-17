-- -------------------------------------------------------
-- sys_sql_audit (SQL 错误审计表)
-- 记录所有执行报错的 SQL 语句及其错误信息，用于排查数据库问题。
-- -------------------------------------------------------
DROP TABLE IF EXISTS `sys_sql_audit`;
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
