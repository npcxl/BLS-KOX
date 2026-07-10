-- P9: sys_role 添加 data_scope 字段
ALTER TABLE `sys_role` ADD COLUMN IF NOT EXISTS `data_scope` varchar(20) NOT NULL DEFAULT 'TENANT'
  COMMENT '数据权限范围: ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF/CUSTOM'
  AFTER `role_key`;
