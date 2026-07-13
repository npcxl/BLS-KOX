-- P10: Security Center — 菜单项
-- 安全中心页面 + 查看权限

INSERT IGNORE INTO `sys_menu` VALUES
('000200','000100','安全中心','/system/security','system/security',NULL,'SafetyCertificateOutlined','1',9,'0',NOW(),NOW()),
('000201','000200','查看',NULL,NULL,'system:security:stats',NULL,'2',1,'0',NOW(),NOW()),
('000202','000200','IP黑名单-添加',NULL,NULL,'system:security:blacklist:add',NULL,'2',2,'0',NOW(),NOW()),
('000203','000200','IP黑名单-移除',NULL,NULL,'system:security:blacklist:remove',NULL,'2',3,'0',NOW(),NOW());
