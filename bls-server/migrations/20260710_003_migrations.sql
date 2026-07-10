-- P8: Migration version tracking (also auto-created by migrate.ts ensureTable)
CREATE TABLE IF NOT EXISTS `sys_migrations` (
  `version` varchar(64) NOT NULL COMMENT '版本号/文件名',
  `checksum` varchar(64) NOT NULL COMMENT 'SQL 文件 SHA256',
  `executed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time_ms` int NOT NULL DEFAULT '0' COMMENT '执行耗时(ms)',
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据库迁移版本记录';
