-- Migration: AI 用量统计表
-- Date: 2026-07-22
-- Description: 新增 sys_ai_usage 表用于记录 AI 调用 token 用量与费用估算

DROP TABLE IF EXISTS `sys_ai_usage`;
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
