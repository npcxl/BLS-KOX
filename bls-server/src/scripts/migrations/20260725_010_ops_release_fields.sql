-- 迁移: 20260725_010_ops_release_fields
-- 描述: ops_release_task 新增 lock_token 和 source_task_id 字段
-- 幂等: ALTER TABLE 用存储过程检查列是否存在

SET @dbname = DATABASE();
SET @tbl = 'ops_release_task';

-- lock_token 列
SET @col = 'lock_token';
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tbl AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` varchar(64) DEFAULT NULL COMMENT ''环境锁 token'' AFTER `rollback_version`'),
  'SELECT 1'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- source_task_id 列
SET @col = 'source_task_id';
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tbl AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` varchar(32) DEFAULT NULL COMMENT ''关联源任务ID（回滚任务关联原发布任务）'' AFTER `lock_token`'),
  'SELECT 1'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
