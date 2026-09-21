-- ============================================================
-- 阶段一：租户生命周期
--
-- 1) sys_tenant 增加 offboard_status（异步注销状态）
-- 2) 修复 sys_security_log 的 DDL 漂移：
--      列 `id`      → `log_id`（写入方 core/security-audit.ts 一直使用 log_id）
--      缺失列 `source`（写入方一直插入 source，导致安全日志写入失败）
--
-- 说明：ALTER TABLE 属于 DDL，MySQL 会隐式提交，无法随事务回滚。
--       全部语句通过 information_schema 判断后执行，可重复运行。
-- ============================================================

SET @db := DATABASE();

-- 1. sys_tenant.offboard_status + 索引
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_tenant' AND COLUMN_NAME = 'offboard_status');
SET @sql := IF(@exists = 0,
  'ALTER TABLE `sys_tenant` ADD COLUMN `offboard_status` varchar(20) NOT NULL DEFAULT ''none'' COMMENT ''注销状态：none/pending/completed'' AFTER `remark`, ADD INDEX `idx_tenant_offboard` (`offboard_status`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. sys_security_log: id → log_id
SET @hasId := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_security_log' AND COLUMN_NAME = 'id');
SET @hasLogId := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_security_log' AND COLUMN_NAME = 'log_id');
SET @sql := IF(@hasId = 1 AND @hasLogId = 0,
  'ALTER TABLE `sys_security_log` CHANGE COLUMN `id` `log_id` varchar(32) NOT NULL COMMENT ''日志ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. sys_security_log.source
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_security_log' AND COLUMN_NAME = 'source');
SET @sql := IF(@exists = 0,
  'ALTER TABLE `sys_security_log` ADD COLUMN `source` varchar(50) NOT NULL DEFAULT ''system'' COMMENT ''事件来源模块'' AFTER `request_id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
