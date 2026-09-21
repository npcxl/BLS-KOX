-- ============================================================
-- 阶段三：套餐权益（feature）与配额（quota）
--
-- 新增三张表：
--   sys_package_feature       套餐功能开关（全局表）
--   sys_package_quota         套餐配额上限（全局表，quota_limit < 0 = 不限）
--   sys_tenant_quota_usage    租户配额用量（多租户表，复合唯一键 tenant_id+quota_key+period_key）
--
-- 并初始化内置套餐 P001（平台版）/ P100（租户标准版）的权益与配额。
-- 全部语句可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_package_feature` (
  `id` varchar(32) NOT NULL COMMENT '主键ID',
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `feature_key` varchar(100) NOT NULL COMMENT '功能标识：feature.ai.chat 等',
  `enabled` char(1) NOT NULL DEFAULT '1' COMMENT '0关闭 1开启',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_package_feature` (`package_id`,`feature_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐功能权益表';

CREATE TABLE IF NOT EXISTS `sys_package_quota` (
  `id` varchar(32) NOT NULL COMMENT '主键ID',
  `package_id` varchar(32) NOT NULL COMMENT '套餐ID',
  `quota_key` varchar(64) NOT NULL COMMENT '配额标识：max_users 等',
  `quota_limit` bigint NOT NULL DEFAULT 0 COMMENT '配额上限，负数=不限',
  `period` varchar(20) NOT NULL DEFAULT 'total' COMMENT '计量周期：total/monthly/daily',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_package_quota` (`package_id`,`quota_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐配额定义表';

CREATE TABLE IF NOT EXISTS `sys_tenant_quota_usage` (
  `id` varchar(32) NOT NULL COMMENT '主键ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `quota_key` varchar(64) NOT NULL COMMENT '配额标识',
  `period_key` varchar(32) NOT NULL DEFAULT 'total' COMMENT '周期键：total / 2026-09 / 2026-09-21',
  `used` bigint NOT NULL DEFAULT 0 COMMENT '已使用量',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_quota` (`tenant_id`,`quota_key`,`period_key`),
  KEY `idx_tenant_quota_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户配额用量表';

-- ---------- 内置套餐功能权益 ----------
INSERT IGNORE INTO `sys_package_feature` (`id`, `package_id`, `feature_key`, `enabled`, `remark`) VALUES
  ('pf_p001_ai_chat',        'P001', 'feature.ai.chat',        '1', '平台版全部功能'),
  ('pf_p001_webhook',        'P001', 'feature.webhook',        '1', '平台版全部功能'),
  ('pf_p001_openapi',        'P001', 'feature.openapi',        '1', '平台版全部功能'),
  ('pf_p001_audit_export',   'P001', 'feature.audit.export',   '1', '平台版全部功能'),
  ('pf_p001_custom_domain',  'P001', 'feature.custom_domain',  '1', '平台版全部功能'),
  ('pf_p100_ai_chat',        'P100', 'feature.ai.chat',        '1', '标准版包含 AI 对话'),
  ('pf_p100_webhook',        'P100', 'feature.webhook',        '1', '标准版包含 Webhook'),
  ('pf_p100_openapi',        'P100', 'feature.openapi',        '1', '标准版包含开放 API'),
  ('pf_p100_audit_export',   'P100', 'feature.audit.export',   '0', '标准版不含审计导出'),
  ('pf_p100_custom_domain',  'P100', 'feature.custom_domain',  '0', '标准版不含自定义域名');

-- ---------- 内置套餐配额（quota_limit < 0 表示不限） ----------
INSERT IGNORE INTO `sys_package_quota` (`id`, `package_id`, `quota_key`, `quota_limit`, `period`, `remark`) VALUES
  ('pq_p001_users',      'P001', 'max_users',                 -1, 'total',   '平台版不限'),
  ('pq_p001_storage',    'P001', 'max_storage_bytes',         -1, 'total',   '平台版不限'),
  ('pq_p001_files',      'P001', 'max_files',                 -1, 'total',   '平台版不限'),
  ('pq_p001_apikeys',    'P001', 'max_api_keys',              -1, 'total',   '平台版不限'),
  ('pq_p001_webhooks',   'P001', 'max_webhooks',              -1, 'total',   '平台版不限'),
  ('pq_p001_ai_tokens',  'P001', 'max_ai_tokens_monthly',     -1, 'monthly', '平台版不限'),
  ('pq_p001_ai_cost',    'P001', 'max_ai_cost_monthly',       -1, 'monthly', '平台版不限'),
  ('pq_p001_jobs',       'P001', 'max_concurrent_jobs',       -1, 'total',   '平台版不限'),
  ('pq_p100_users',      'P100', 'max_users',                  50, 'total',   '标准版 50 个用户'),
  ('pq_p100_storage',    'P100', 'max_storage_bytes',  10737418240, 'total',   '标准版 10 GiB'),
  ('pq_p100_files',      'P100', 'max_files',               10000, 'total',   '标准版 1 万个文件'),
  ('pq_p100_apikeys',    'P100', 'max_api_keys',                5, 'total',   '标准版 5 个 API Key'),
  ('pq_p100_webhooks',   'P100', 'max_webhooks',               10, 'total',   '标准版 10 个 Webhook'),
  ('pq_p100_ai_tokens',  'P100', 'max_ai_tokens_monthly', 1000000, 'monthly', '标准版每月 100 万 tokens'),
  ('pq_p100_ai_cost',    'P100', 'max_ai_cost_monthly',     10000, 'monthly', '标准版每月 1 万元额度'),
  ('pq_p100_jobs',       'P100', 'max_concurrent_jobs',         5, 'total',   '标准版 5 个并发任务');

-- ---------- 菜单权限：配额查询 ----------
INSERT IGNORE INTO `sys_menu`
  (`menu_id`, `parent_id`, `menu_name`, `path`, `component`, `perms`, `icon`, `menu_type`, `sort_num`, `status`, `create_time`, `update_time`)
VALUES
  ('quota_list_0001', '000100', '套餐配额', NULL, NULL, 'system:quota:list', NULL, '2', 20, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00');

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
  ('000001', 'quota_list_0001'),
  ('100001', 'quota_list_0001');

INSERT IGNORE INTO `sys_package_menu` (`package_id`, `menu_id`) VALUES
  ('P001', 'quota_list_0001'),
  ('P100', 'quota_list_0001');
