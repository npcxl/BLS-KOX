-- P11: SQL 审计 — 菜单项
-- 日志中心下新增 SQL 审计页面 + 查询权限

INSERT IGNORE INTO `sys_menu` VALUES
('000204','000190','SQL审计','/system/log/sql-audit','system/log/sql-audit','system:log:sqlaudit:list','ConsoleSqlOutlined','1',4,'0',NOW(),NOW()),
('000205','000204','查询',NULL,NULL,'system:log:sqlaudit:list',NULL,'2',1,'0',NOW(),NOW());

INSERT IGNORE INTO `sys_role_menu` VALUES
('000001','000204'),
('000001','000205'),
('100001','000204'),
('100001','000205');

INSERT IGNORE INTO `sys_package_menu` VALUES
('P001','000204'),('P001','000205'),
('P100','000204'),('P100','000205');
