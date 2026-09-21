-- ============================================================
-- 阶段四：认证闭环 —— 密码重置一次性令牌
--
-- sys_password_reset_token
--   - 数据库只保存 token 的 SHA-256，不保存明文
--   - 单次使用（used 0/1），消费时用条件 UPDATE 保证原子
--   - 带有效期（expire_time）
--   - 使用后由应用吊销该用户全部 Session
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_password_reset_token` (
  `token_id` varchar(32) NOT NULL COMMENT '令牌ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `user_id` varchar(32) NOT NULL COMMENT '用户ID',
  `token_hash` varchar(128) NOT NULL COMMENT '令牌 SHA-256（不保存明文）',
  `purpose` varchar(20) NOT NULL DEFAULT 'reset_password' COMMENT '用途：reset_password/verify_email/invite',
  `used` tinyint NOT NULL DEFAULT '0' COMMENT '0未使用 1已使用',
  `expire_time` datetime NOT NULL COMMENT '过期时间',
  `used_time` datetime DEFAULT NULL COMMENT '使用时间',
  `client_ip` varchar(45) DEFAULT NULL COMMENT '申请来源IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT 'User-Agent',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uk_reset_token_hash` (`token_hash`),
  KEY `idx_reset_token_user` (`user_id`,`used`),
  KEY `idx_reset_token_expire` (`expire_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='密码重置一次性令牌表';

-- 权限码：管理员重置用户密码
INSERT IGNORE INTO `sys_menu`
  (`menu_id`, `parent_id`, `menu_name`, `path`, `component`, `perms`, `icon`, `menu_type`, `sort_num`, `status`, `create_time`, `update_time`)
VALUES
  ('user_resetpwd_0001', '000130', '重置密码', NULL, NULL, 'system:user:resetPassword', NULL, '2', 7, '0', '2026-09-21 00:00:00', '2026-09-21 00:00:00');

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
  ('000001', 'user_resetpwd_0001'),
  ('100001', 'user_resetpwd_0001');

INSERT IGNORE INTO `sys_package_menu` (`package_id`, `menu_id`) VALUES
  ('P001', 'user_resetpwd_0001'),
  ('P100', 'user_resetpwd_0001');
