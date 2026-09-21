-- ============================================================
-- 阶段六：外部 API（/openapi/v1）真正可用
--
-- 新增 sys_api_key：
--   - key_id            对外公开的 Key 标识（X-Api-Key 头）
--   - key_hash          完整 Key 的 SHA-256，二次校验，避免仅凭 key_id 通过
--   - encrypted_secret  AES-256-GCM 信封加密的 HMAC Secret（数据库不存明文）
--   - scopes            逗号分隔的授权范围（read / write / *）
--   - expire_at / revoked_at / last_used_at
--
-- 命名说明：本表沿用需求给出的 `created_at`（例外，见 bls-memory/00-common/07-database.md）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_api_key` (
  `api_key_id` varchar(32) NOT NULL COMMENT '主键ID',
  `tenant_id` varchar(32) NOT NULL COMMENT '租户ID',
  `name` varchar(100) NOT NULL COMMENT '名称',
  `key_id` varchar(64) NOT NULL COMMENT '对外公开的 Key 标识',
  `key_hash` varchar(128) NOT NULL COMMENT '完整 API Key 的 SHA-256',
  `encrypted_secret` text COMMENT 'AES-256-GCM 信封加密的 HMAC Secret',
  `secret_preview` varchar(32) DEFAULT NULL COMMENT '明文前缀提示（不可用于签名）',
  `scopes` varchar(500) NOT NULL DEFAULT 'read' COMMENT '授权范围，逗号分隔：read/write/*',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '0启用 1停用',
  `expire_at` datetime DEFAULT NULL COMMENT '过期时间，NULL 表示永不过期',
  `last_used_at` datetime DEFAULT NULL COMMENT '最近一次成功调用时间',
  `revoked_at` datetime DEFAULT NULL COMMENT '撤销时间',
  `created_by` varchar(32) DEFAULT NULL COMMENT '创建人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`api_key_id`),
  UNIQUE KEY `uk_api_key_key_id` (`key_id`),
  UNIQUE KEY `uk_api_key_key_hash` (`key_hash`),
  KEY `idx_api_key_tenant` (`tenant_id`),
  KEY `idx_api_key_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部 API Key';

-- 权限码：API Key 管理
INSERT IGNORE INTO `sys_menu`
  (`menu_id`, `parent_id`, `menu_name`, `path`, `component`, `perms`, `icon`, `menu_type`, `sort_num`, `status`, `create_time`, `update_time`)
VALUES
  ('apikey_list_0001',   '000100', '开放API密钥', NULL, NULL, 'system:apikey:list',   NULL, '2', 21, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00'),
  ('apikey_add_0001',    '000100', '新增密钥',    NULL, NULL, 'system:apikey:add',    NULL, '2', 22, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00'),
  ('apikey_remove_0001', '000100', '删除密钥',    NULL, NULL, 'system:apikey:remove', NULL, '2', 23, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00'),
  ('apikey_status_0001', '000100', '密钥状态',    NULL, NULL, 'system:apikey:status', NULL, '2', 24, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00');

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
  ('000001', 'apikey_list_0001'), ('000001', 'apikey_add_0001'),
  ('000001', 'apikey_remove_0001'), ('000001', 'apikey_status_0001'),
  ('100001', 'apikey_list_0001'), ('100001', 'apikey_add_0001'),
  ('100001', 'apikey_remove_0001'), ('100001', 'apikey_status_0001');

INSERT IGNORE INTO `sys_package_menu` (`package_id`, `menu_id`) VALUES
  ('P001', 'apikey_list_0001'), ('P001', 'apikey_add_0001'),
  ('P001', 'apikey_remove_0001'), ('P001', 'apikey_status_0001'),
  ('P100', 'apikey_list_0001'), ('P100', 'apikey_add_0001'),
  ('P100', 'apikey_remove_0001'), ('P100', 'apikey_status_0001');
