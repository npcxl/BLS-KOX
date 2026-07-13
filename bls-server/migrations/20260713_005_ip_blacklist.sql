-- P10: Security Center — IP Blacklist
CREATE TABLE IF NOT EXISTS `sys_ip_blacklist` (
  `id`          VARCHAR(32)  NOT NULL,
  `ip_address`  VARCHAR(45)  NOT NULL COMMENT 'IPv4 或 IPv6 地址',
  `reason`      VARCHAR(500) DEFAULT NULL COMMENT '封禁原因',
  `source`      VARCHAR(50)  NOT NULL DEFAULT 'manual' COMMENT '来源: auto(事件中心自动封禁) / manual(人工添加)',
  `status`      CHAR(1)      NOT NULL DEFAULT '0' COMMENT '0=有效 1=已解封',
  `expire_at`   DATETIME     DEFAULT NULL COMMENT '过期时间，NULL=永久封禁',
  `tenant_id`   VARCHAR(32)  NOT NULL DEFAULT '000000',
  `create_by`   VARCHAR(64)  DEFAULT NULL,
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_status` (`ip_address`, `status`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='IP 黑名单';
