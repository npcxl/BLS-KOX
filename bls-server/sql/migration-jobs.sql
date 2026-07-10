-- P6: Queue/Worker Job 表
CREATE TABLE IF NOT EXISTS `sys_jobs` (
  `job_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `user_id` varchar(32) DEFAULT NULL,
  `job_type` varchar(64) NOT NULL,
  `job_data` json DEFAULT NULL,
  `status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  `attempt` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '3',
  `next_retry_at` datetime DEFAULT NULL,
  `error_message` text,
  `result` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_status_retry` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异步任务表';
