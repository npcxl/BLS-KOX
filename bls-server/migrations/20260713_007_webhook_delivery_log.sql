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

-- ====== 页面配置 — 动态列 ======

INSERT IGNORE INTO `sys_page_config` (`page_config_id`, `page_code`, `page_name`, `enabled`, `sort`, `tenant_id`, `deleted`, `create_time`, `update_time`) VALUES
('PC_WEBHOOK', 'system:webhook:list', 'Webhook管理', 1, 10, '000000', 0, NOW(), NOW());

INSERT IGNORE INTO `sys_page_column_config` (`column_id`, `page_code`, `data_index`, `title`, `order_num`, `visible`, `searchable`, `editable`, `copyable`, `ellipsis`, `value_type`, `value_enum_code`, `required`, `tenant_id`, `deleted`, `create_time`, `update_time`) VALUES
('PCC_WH_01', 'system:webhook:list', 'name',        '名称',     1, 1, 1, 0, 0, 0, 'text',     NULL,          0, '000000', 0, NOW(), NOW()),
('PCC_WH_02', 'system:webhook:list', 'url',         '回调URL',  2, 1, 0, 0, 0, 1, 'text',     NULL,          0, '000000', 0, NOW(), NOW()),
('PCC_WH_03', 'system:webhook:list', 'events',      '订阅事件', 3, 1, 0, 0, 0, 0, 'text',     NULL,          0, '000000', 0, NOW(), NOW()),
('PCC_WH_04', 'system:webhook:list', 'status',      '状态',     4, 1, 0, 0, 0, 0, 'select',   'sys_status',  0, '000000', 0, NOW(), NOW()),
('PCC_WH_05', 'system:webhook:list', 'createdAt',   '创建时间', 5, 1, 0, 0, 0, 0, 'dateTime', NULL,          0, '000000', 0, NOW(), NOW());
