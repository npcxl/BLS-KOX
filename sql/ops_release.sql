-- ============================================================
-- BLS-KOX 发布中心 — 手动执行 SQL（与迁移 20260725_009 内容一致）
-- 执行: docker exec -i bls-mysql mysql -uroot -p kox < sql/ops_release.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `ops_environment` (
  `env_id` varchar(32) NOT NULL,
  `env_key` varchar(50) NOT NULL,
  `env_name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `sort_num` int NOT NULL DEFAULT 0,
  `status` char(1) NOT NULL DEFAULT '0',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`env_id`),
  UNIQUE KEY `uk_env_key_tenant` (`tenant_id`, `env_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ops_release_version` (
  `version_id` varchar(32) NOT NULL,
  `version` varchar(20) NOT NULL,
  `commit_hash` varchar(64) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'building',
  `services` text DEFAULT NULL,
  `built_at` datetime DEFAULT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `deleted` tinyint NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uk_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ops_release_task` (
  `task_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000',
  `environment` varchar(50) NOT NULL,
  `action` varchar(20) NOT NULL DEFAULT 'deploy',
  `from_version` varchar(20) DEFAULT NULL,
  `target_version` varchar(20) NOT NULL,
  `services` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `current_stage` varchar(30) DEFAULT NULL,
  `progress` int NOT NULL DEFAULT 0,
  `reason` varchar(500) DEFAULT NULL,
  `github_run_id` varchar(50) DEFAULT NULL,
  `triggered_by` varchar(32) NOT NULL,
  `triggered_by_name` varchar(100) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `rollback_version` varchar(20) DEFAULT NULL,
  `lock_token` varchar(64) DEFAULT NULL COMMENT '环境锁 token',
  `source_task_id` varchar(32) DEFAULT NULL COMMENT '关联源任务ID（回滚任务关联原发布任务）',
  `deleted` tinyint NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_tenant` (`tenant_id`),
  KEY `idx_task_env_status` (`environment`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ops_release_step` (
  `step_id` varchar(32) NOT NULL,
  `task_id` varchar(32) NOT NULL,
  `step_key` varchar(30) NOT NULL,
  `step_name` varchar(100) NOT NULL,
  `step_order` int NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL DEFAULT 'waiting',
  `progress` int NOT NULL DEFAULT 0,
  `message` text DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `duration_ms` bigint DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`step_id`),
  KEY `idx_step_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ops_release_log` (
  `log_id` varchar(32) NOT NULL,
  `task_id` varchar(32) NOT NULL,
  `step_key` varchar(30) DEFAULT NULL,
  `level` varchar(10) NOT NULL DEFAULT 'info',
  `message` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_log_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 初始数据 ==========

INSERT IGNORE INTO `ops_environment` (`env_id`, `env_key`, `env_name`, `description`, `is_default`, `sort_num`, `status`, `tenant_id`, `deleted`) VALUES
('ops_env_001', 'production', '生产环境', '线上正式环境', 1, 1, '0', '000000', 0),
('ops_env_002', 'staging', '预发布环境', '测试验收环境', 0, 2, '0', '000000', 0);

INSERT IGNORE INTO `sys_menu` (`menu_id`, `parent_id`, `menu_name`, `path`, `component`, `perms`, `icon`, `menu_type`, `sort_num`, `status`) VALUES
('000900', '000000', '运维管理', '/ops', NULL, NULL, 'SettingOutlined', '0', 90, '0'),
('000910', '000900', '发布中心', '/ops/release', 'ops/release/index', 'ops:release:view', 'CloudUploadOutlined', '1', 1, '0'),
('000911', '000910', '创建发布', NULL, NULL, 'ops:release:create', NULL, '2', 1, '0'),
('000912', '000910', '审批发布', NULL, NULL, 'ops:release:approve', NULL, '2', 2, '0'),
('000913', '000910', '回滚', NULL, NULL, 'ops:release:rollback', NULL, '2', 3, '0'),
('000914', '000910', '查看日志', NULL, NULL, 'ops:release:logs', NULL, '2', 4, '0'),
('000915', '000910', '服务状态', NULL, NULL, 'ops:service:view', NULL, '2', 5, '0'),
('000916', '000910', '重启服务', NULL, NULL, 'ops:service:restart', NULL, '2', 6, '0');

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
('000001', '000900'), ('000001', '000910'), ('000001', '000911'),
('000001', '000912'), ('000001', '000913'), ('000001', '000914'),
('000001', '000915'), ('000001', '000916');

INSERT IGNORE INTO `sys_dict_type` (`dict_type_id`, `dict_name`, `dict_type`, `status`, `remark`, `tenant_id`, `deleted`) VALUES
('dict_type_ops_rel_status', '发布任务状态', 'ops_release_status', '0', '发布中心任务状态', '000000', 0);

INSERT IGNORE INTO `sys_dict_data` (`dict_data_id`, `dict_type_id`, `dict_label`, `dict_value`, `dict_sort`, `tag`, `status`, `remark`, `tenant_id`, `deleted`) VALUES
('dict_ops_rel_01', 'dict_type_ops_rel_status', '待执行', 'pending', 1, 'default', '0', NULL, '000000', 0),
('dict_ops_rel_02', 'dict_type_ops_rel_status', '校验中', 'checking', 2, 'processing', '0', NULL, '000000', 0),
('dict_ops_rel_03', 'dict_type_ops_rel_status', '待审批', 'waiting_approval', 3, 'warning', '0', NULL, '000000', 0),
('dict_ops_rel_04', 'dict_type_ops_rel_status', '执行中', 'running', 4, 'processing', '0', NULL, '000000', 0),
('dict_ops_rel_05', 'dict_type_ops_rel_status', '成功', 'success', 5, 'success', '0', NULL, '000000', 0),
('dict_ops_rel_06', 'dict_type_ops_rel_status', '失败', 'failed', 6, 'error', '0', NULL, '000000', 0),
('dict_ops_rel_07', 'dict_type_ops_rel_status', '回滚中', 'rolling_back', 7, 'warning', '0', NULL, '000000', 0),
('dict_ops_rel_08', 'dict_type_ops_rel_status', '已回滚', 'rolled_back', 8, 'default', '0', NULL, '000000', 0),
('dict_ops_rel_09', 'dict_type_ops_rel_status', '已取消', 'cancelled', 9, 'default', '0', NULL, '000000', 0);
