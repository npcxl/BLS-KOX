-- ============================================================
-- CRUD 完整性修复（2026-09-20）
--
-- 1) sys_theme_config 增加 remark 列（前端主题表单会提交 remark）
-- 2) 补齐后端 hasPerm 使用但数据库未种子的按钮权限
-- 3) 将新增按钮权限授予平台管理员（000001）与租户管理员（100001）
-- 4) 将新增按钮权限纳入套餐（P001 / P100）
--
-- 说明：ALTER TABLE 属于 DDL，MySQL 会隐式提交，无法随事务回滚。
-- ============================================================

ALTER TABLE `sys_theme_config`
  ADD COLUMN `remark` varchar(500) DEFAULT NULL COMMENT '备注' AFTER `status`;

INSERT IGNORE INTO `sys_menu`
  (`menu_id`, `parent_id`, `menu_name`, `path`, `component`, `perms`, `icon`, `menu_type`, `sort_num`, `status`, `create_time`, `update_time`)
VALUES
  ('000132','000130','新增',NULL,NULL,'system:user:add',NULL,'2',2,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('theme_add_0001','000180','新增',NULL,NULL,'system:theme:add',NULL,'2',3,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('theme_remove_0001','000180','删除',NULL,NULL,'system:theme:remove',NULL,'2',4,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('role_status_0001','000140','状态',NULL,NULL,'system:role:status',NULL,'2',6,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('package_status_0001','000112','状态',NULL,NULL,'system:package:status',NULL,'2',5,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('tenant_status_0001','000111','状态',NULL,NULL,'system:tenant:status',NULL,'2',5,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('pageconfig_list_0001','325883052729438208','查询',NULL,NULL,'system:pageconfig:list',NULL,'2',1,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('pageconfig_edit_0001','325883052729438208','编辑',NULL,NULL,'system:pageconfig:edit',NULL,'2',2,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('pageconfig_remove_0001','325883052729438208','删除',NULL,NULL,'system:pageconfig:remove',NULL,'2',3,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('ai_model_list_0001','ai_model_0001','查询',NULL,NULL,'system:ai-model:list',NULL,'2',1,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('ai_model_add_0001','ai_model_0001','新增',NULL,NULL,'system:ai-model:add',NULL,'2',2,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('ai_model_edit_0001','ai_model_0001','修改',NULL,NULL,'system:ai-model:edit',NULL,'2',3,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('ai_model_remove_0001','ai_model_0001','删除',NULL,NULL,'system:ai-model:remove',NULL,'2',4,'0','2026-09-20 00:00:00','2026-09-20 00:00:00'),
  ('ai_model_status_0001','ai_model_0001','状态',NULL,NULL,'system:ai-model:status',NULL,'2',5,'0','2026-09-20 00:00:00','2026-09-20 00:00:00');

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
  ('000001','000132'),('000001','theme_add_0001'),('000001','theme_remove_0001'),
  ('000001','role_status_0001'),('000001','package_status_0001'),('000001','tenant_status_0001'),
  ('000001','pageconfig_list_0001'),('000001','pageconfig_edit_0001'),('000001','pageconfig_remove_0001'),
  ('000001','ai_model_list_0001'),('000001','ai_model_add_0001'),('000001','ai_model_edit_0001'),
  ('000001','ai_model_remove_0001'),('000001','ai_model_status_0001'),
  ('100001','000132'),('100001','theme_add_0001'),('100001','theme_remove_0001'),('100001','role_status_0001'),
  ('100001','ai_model_list_0001'),('100001','ai_model_add_0001'),('100001','ai_model_edit_0001'),
  ('100001','ai_model_remove_0001'),('100001','ai_model_status_0001');

INSERT IGNORE INTO `sys_package_menu` (`package_id`, `menu_id`) VALUES
  ('P001','000132'),('P100','000132'),
  ('P001','theme_add_0001'),('P100','theme_add_0001'),
  ('P001','theme_remove_0001'),('P100','theme_remove_0001'),
  ('P001','role_status_0001'),('P100','role_status_0001'),
  ('P001','package_status_0001'),('P001','tenant_status_0001'),
  ('P001','pageconfig_list_0001'),('P001','pageconfig_edit_0001'),('P001','pageconfig_remove_0001'),
  ('P001','ai_model_list_0001'),('P100','ai_model_list_0001'),
  ('P001','ai_model_add_0001'),('P100','ai_model_add_0001'),
  ('P001','ai_model_edit_0001'),('P100','ai_model_edit_0001'),
  ('P001','ai_model_remove_0001'),('P100','ai_model_remove_0001'),
  ('P001','ai_model_status_0001'),('P100','ai_model_status_0001');
