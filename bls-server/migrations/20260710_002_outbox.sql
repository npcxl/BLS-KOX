-- P7: Outbox Pattern (v2 — includes processing_at for stale recovery)
CREATE TABLE IF NOT EXISTS `outbox_event` (
  `event_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `event_type` varchar(64) NOT NULL COMMENT 'USER_CREATED/FILE_UPLOADED/...',
  `aggregate_type` varchar(64) DEFAULT NULL,
  `aggregate_id` varchar(32) DEFAULT NULL,
  `payload_json` json DEFAULT NULL,
  `status` enum('pending','processing','published','dead') NOT NULL DEFAULT 'pending',
  `retry_count` int NOT NULL DEFAULT '0',
  `next_retry_at` datetime DEFAULT NULL,
  `processing_at` datetime DEFAULT NULL COMMENT '领取时间, 用于 stale recovery (P0 修复)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published_at` datetime DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_status_retry` (`status`,`next_retry_at`),
  KEY `idx_status_processing` (`status`,`processing_at`),
  KEY `idx_tenant_type` (`tenant_id`,`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Outbox 事件表';
