-- P12: Webhook 投递日志表
CREATE TABLE IF NOT EXISTS `sys_webhook_delivery` (
  `id`            VARCHAR(32)  NOT NULL,
  `webhook_id`    VARCHAR(32)  NOT NULL,
  `event`         VARCHAR(100) NOT NULL COMMENT '事件类型',
  `payload`       TEXT         DEFAULT NULL COMMENT '发送的 payload',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending/success/failed',
  `response_code` INT          DEFAULT NULL COMMENT 'HTTP 响应码',
  `response_body` TEXT         DEFAULT NULL COMMENT '响应内容',
  `error_message` VARCHAR(500) DEFAULT NULL COMMENT '错误信息',
  `attempt`       INT          NOT NULL DEFAULT 1,
  `tenant_id`     VARCHAR(32)  NOT NULL DEFAULT '000000',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhook_id` (`webhook_id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_event` (`event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Webhook 投递日志';

-- ====== 菜单权限 ======

-- Webhook管理 页面（挂载在 系统管理(000100) 下）
INSERT IGNORE INTO `sys_menu` VALUES
('000210','000100','Webhook管理','/system/webhook','system/webhook',NULL,'LinkOutlined','1',10,'0',NOW(),NOW()),

-- 按钮权限
('000211','000210','查看',NULL,NULL,'system:webhook:list',NULL,'2',1,'0',NOW(),NOW()),
('000212','000210','注册',NULL,NULL,'system:webhook:add',NULL,'2',2,'0',NOW(),NOW()),
('000213','000210','修改',NULL,NULL,'system:webhook:edit',NULL,'2',3,'0',NOW(),NOW()),
('000214','000210','删除',NULL,NULL,'system:webhook:remove',NULL,'2',4,'0',NOW(),NOW()),
('000215','000210','测试发送',NULL,NULL,'system:webhook:test',NULL,'2',5,'0',NOW(),NOW()),
('000216','000210','重试/查看日志',NULL,NULL,'system:webhook:logs',NULL,'2',6,'0',NOW(),NOW());
