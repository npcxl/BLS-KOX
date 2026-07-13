-- P7: Outbox Stale Recovery 修复 (P0)
-- 为已从 002 创建但缺少 processing_at 字段的现有表做增量补齐
-- 幂等：重复执行安全

-- 加列
SET @db = DATABASE();
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'outbox_event' AND COLUMN_NAME = 'processing_at');
SET @sql = IF(@col = 0,
  'ALTER TABLE `outbox_event` ADD COLUMN `processing_at` DATETIME DEFAULT NULL COMMENT ''领取时间, 用于 stale recovery (P0 修复)'' AFTER `next_retry_at`;',
  'SELECT ''processing_at already exists, skip'' AS note;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 加索引
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'outbox_event' AND INDEX_NAME = 'idx_status_processing');
SET @idxsql = IF(@idx = 0,
  'ALTER TABLE `outbox_event` ADD KEY `idx_status_processing` (`status`, `processing_at`);',
  'SELECT ''idx_status_processing already exists, skip'' AS note;');
PREPARE stmt FROM @idxsql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
