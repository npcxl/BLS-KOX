-- ============================================================
-- BLS-KOX 发布中心 — 数据库表结构
-- 执行方式: docker exec -i bls-mysql mysql -uroot -p$DB_PASSWORD kox < sql/ops_release.sql
-- 或通过 phpMyAdmin / Navicat 执行
-- ============================================================

-- 发布环境表
CREATE TABLE IF NOT EXISTS `ops_environment` (
  `env_id` varchar(32) NOT NULL COMMENT '环境ID',
  `env_key` varchar(50) NOT NULL COMMENT '环境标识 (production/staging)',
  `env_name` varchar(100) NOT NULL COMMENT '环境名称',
  `description` varchar(500) DEFAULT NULL COMMENT '描述',
  `is_default` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否默认',
  `sort_num` int NOT NULL DEFAULT 0 COMMENT '排序',
  `status` char(1) NOT NULL DEFAULT '0' COMMENT '状态 (0=正常 1=停用)',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '软删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`env_id`),
  KEY `idx_env_tenant` (`tenant_id`),
  UNIQUE KEY `uk_env_key_tenant` (`tenant_id`, `env_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布环境表';

-- 版本构建记录表（GHCR 镜像状态联动）
CREATE TABLE IF NOT EXISTS `ops_release_version` (
  `version_id` varchar(32) NOT NULL COMMENT '记录ID',
  `version` varchar(20) NOT NULL COMMENT '版本号',
  `commit_hash` varchar(64) DEFAULT NULL COMMENT 'Commit SHA',
  `status` varchar(20) NOT NULL DEFAULT 'building' COMMENT '状态 (building/built/failed/unavailable)',
  `services` text DEFAULT NULL COMMENT '已构建的服务列表 (JSON)',
  `built_at` datetime DEFAULT NULL COMMENT '构建完成时间',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '软删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uk_version` (`version`),
  KEY `idx_version_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='版本构建记录表';

-- 发布任务表
CREATE TABLE IF NOT EXISTS `ops_release_task` (
  `task_id` varchar(32) NOT NULL COMMENT '任务ID',
  `tenant_id` varchar(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  `environment` varchar(50) NOT NULL COMMENT '发布环境',
  `action` varchar(20) NOT NULL DEFAULT 'deploy' COMMENT '操作 (deploy/rollback)',
  `from_version` varchar(20) DEFAULT NULL COMMENT '来源版本',
  `target_version` varchar(20) NOT NULL COMMENT '目标版本',
  `services` text NOT NULL COMMENT '发布服务列表 (逗号分隔)',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '任务状态',
  `current_stage` varchar(30) DEFAULT NULL COMMENT '当前阶段',
  `progress` int NOT NULL DEFAULT 0 COMMENT '进度 (0-100)',
  `reason` varchar(500) DEFAULT NULL COMMENT '发布原因',
  `github_run_id` varchar(50) DEFAULT NULL COMMENT 'GitHub Actions Run ID',
  `triggered_by` varchar(32) NOT NULL COMMENT '触发人ID',
  `triggered_by_name` varchar(100) DEFAULT NULL COMMENT '触发人名称',
  `started_at` datetime DEFAULT NULL COMMENT '开始时间',
  `finished_at` datetime DEFAULT NULL COMMENT '结束时间',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `rollback_version` varchar(20) DEFAULT NULL COMMENT '回滚版本',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '软删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`task_id`),
  KEY `idx_task_tenant` (`tenant_id`),
  KEY `idx_task_env_status` (`environment`, `status`),
  KEY `idx_task_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布任务表';

-- 发布步骤表
CREATE TABLE IF NOT EXISTS `ops_release_step` (
  `step_id` varchar(32) NOT NULL COMMENT '步骤ID',
  `task_id` varchar(32) NOT NULL COMMENT '任务ID',
  `step_key` varchar(30) NOT NULL COMMENT '步骤标识',
  `step_name` varchar(100) NOT NULL COMMENT '步骤名称',
  `step_order` int NOT NULL DEFAULT 0 COMMENT '步骤顺序',
  `status` varchar(20) NOT NULL DEFAULT 'waiting' COMMENT '步骤状态',
  `progress` int NOT NULL DEFAULT 0 COMMENT '进度 (0-100)',
  `message` text DEFAULT NULL COMMENT '消息',
  `started_at` datetime DEFAULT NULL COMMENT '开始时间',
  `finished_at` datetime DEFAULT NULL COMMENT '结束时间',
  `duration_ms` bigint DEFAULT NULL COMMENT '耗时(ms)',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`step_id`),
  KEY `idx_step_task` (`task_id`),
  KEY `idx_step_key` (`task_id`, `step_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布步骤表';

-- 发布日志表（完整日志存 MySQL，避免 Redis 不可用时丢失）
CREATE TABLE IF NOT EXISTS `ops_release_log` (
  `log_id` varchar(32) NOT NULL COMMENT '日志ID',
  `task_id` varchar(32) NOT NULL COMMENT '任务ID',
  `step_key` varchar(30) DEFAULT NULL COMMENT '步骤标识',
  `level` varchar(10) NOT NULL DEFAULT 'info' COMMENT '日志级别 (info/warn/error)',
  `message` text NOT NULL COMMENT '日志内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`log_id`),
  KEY `idx_log_task` (`task_id`),
  KEY `idx_log_task_step` (`task_id`, `step_key`),
  KEY `idx_log_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布日志表';

-- ========== 初始数据 ==========

-- 默认环境
INSERT INTO ops_environment (env_id, env_key, env_name, description, is_default, sort_num, status, tenant_id, deleted) VALUES
('ops_env_001', 'production', '生产环境', '线上正式环境', 1, 1, '0', '000000', 0),
('ops_env_002', 'staging', '预发布环境', '测试验收环境', 0, 2, '0', '000000', 0);

-- ========== 菜单 ==========
-- 运维管理目录
INSERT INTO sys_menu (menu_id, parent_id, menu_name, path, component, perms, icon, menu_type, sort_num, status) VALUES
('ops_menu_root', '000000', '运维管理', '/ops', NULL, NULL, 'SettingOutlined', '0', 90, '0');

-- 发布中心页面
INSERT INTO sys_menu (menu_id, parent_id, menu_name, path, component, perms, icon, menu_type, sort_num, status) VALUES
('ops_menu_release', 'ops_menu_root', '发布中心', '/ops/release', 'ops/release/index', 'ops:release:view', 'CloudUploadOutlined', '1', 1, '0');

-- 按钮权限
INSERT INTO sys_menu (menu_id, parent_id, menu_name, path, component, perms, icon, menu_type, sort_num, status) VALUES
('ops_btn_release_create', 'ops_menu_release', '创建发布', NULL, NULL, 'ops:release:create', NULL, '2', 1, '0'),
('ops_btn_release_approve', 'ops_menu_release', '审批发布', NULL, NULL, 'ops:release:approve', NULL, '2', 2, '0'),
('ops_btn_release_rollback', 'ops_menu_release', '回滚', NULL, NULL, 'ops:release:rollback', NULL, '2', 3, '0'),
('ops_btn_release_logs', 'ops_menu_release', '查看日志', NULL, NULL, 'ops:release:logs', NULL, '2', 4, '0'),
('ops_btn_service_view', 'ops_menu_release', '服务状态', NULL, NULL, 'ops:service:view', NULL, '2', 5, '0'),
('ops_btn_service_restart', 'ops_menu_release', '重启服务', NULL, NULL, 'ops:service:restart', NULL, '2', 6, '0');

-- ========== 角色权限分配 ==========
-- 管理员角色 (role_id = '000001') 获取全部运维权限
INSERT INTO sys_role_menu (role_id, menu_id) VALUES
('000001', 'ops_menu_root'),
('000001', 'ops_menu_release'),
('000001', 'ops_btn_release_create'),
('000001', 'ops_btn_release_approve'),
('000001', 'ops_btn_release_rollback'),
('000001', 'ops_btn_release_logs'),
('000001', 'ops_btn_service_view'),
('000001', 'ops_btn_service_restart');

-- ========== 字典数据（任务状态） ==========
INSERT INTO sys_dict_data (dict_data_id, dict_type_id, dict_label, dict_value, dict_sort, tag, status, remark, tenant_id, deleted) VALUES
('dict_release_status_01', 'ops_release_status', '待执行', 'pending', 1, 'default', '0', '发布任务状态', '000000', 0),
('dict_release_status_02', 'ops_release_status', '校验中', 'checking', 2, 'processing', '0', NULL, '000000', 0),
('dict_release_status_03', 'ops_release_status', '待审批', 'waiting_approval', 3, 'warning', '0', NULL, '000000', 0),
('dict_release_status_04', 'ops_release_status', '执行中', 'running', 4, 'processing', '0', NULL, '000000', 0),
('dict_release_status_05', 'ops_release_status', '成功', 'success', 5, 'success', '0', NULL, '000000', 0),
('dict_release_status_06', 'ops_release_status', '失败', 'failed', 6, 'error', '0', NULL, '000000', 0),
('dict_release_status_07', 'ops_release_status', '回滚中', 'rolling_back', 7, 'warning', '0', NULL, '000000', 0),
('dict_release_status_08', 'ops_release_status', '已回滚', 'rolled_back', 8, 'default', '0', NULL, '000000', 0),
('dict_release_status_09', 'ops_release_status', '已取消', 'cancelled', 9, 'default', '0', NULL, '000000', 0);

-- 字典类型
INSERT INTO sys_dict_type (dict_type_id, dict_name, dict_type, status, remark, tenant_id, deleted) VALUES
('ops_release_status_001', '发布任务状态', 'ops_release_status', '0', '发布中心任务状态字典', '000000', 0);
