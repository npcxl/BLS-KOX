-- P12: Webhook 订阅表
CREATE TABLE IF NOT EXISTS `sys_webhook` (
  `webhook_id` varchar(32) NOT NULL,
  `tenant_id` varchar(32) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'Webhook 名称',
  `url` varchar(500) NOT NULL COMMENT '回调 URL',
  `events` json DEFAULT NULL COMMENT '订阅事件列表',
  `secret` varchar(64) NOT NULL COMMENT 'HMAC 签名密钥',
  `status` char(1) DEFAULT '0' COMMENT '0正常 1停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`webhook_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Webhook 订阅表';
