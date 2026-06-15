CREATE DATABASE IF NOT EXISTS `bls` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bls`;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS sys_package (
  package_id VARCHAR(32) PRIMARY KEY COMMENT '套餐ID',
  package_name VARCHAR(100) NOT NULL COMMENT '套餐名称',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户套餐表';

CREATE TABLE IF NOT EXISTS sys_package_menu (
  package_id VARCHAR(32) NOT NULL COMMENT '套餐ID',
  menu_id VARCHAR(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (package_id, menu_id),
  KEY idx_package_menu_menu (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐菜单关联表';

CREATE TABLE IF NOT EXISTS sys_tenant (
  tenant_id VARCHAR(32) PRIMARY KEY COMMENT '租户ID，000000为平台租户，其他租户使用雪花ID字符串',
  tenant_name VARCHAR(100) NOT NULL COMMENT '租户名称',
  package_id VARCHAR(32) NULL COMMENT '绑定套餐ID',
  expire_time DATETIME NULL COMMENT '套餐到期时间，000000平台租户可为空表示永久有效',
  domain_name VARCHAR(100) NULL COMMENT '绑定域名，如：admin.xxx.com',
  contact_user VARCHAR(50) NULL COMMENT '联系人',
  contact_phone VARCHAR(30) NULL COMMENT '联系电话',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_tenant_package (package_id),
  UNIQUE KEY uk_tenant_domain (domain_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

SET @schema_name = DATABASE();
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_tenant ADD COLUMN package_id VARCHAR(32) NULL COMMENT ''绑定套餐ID'' AFTER tenant_name',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'sys_tenant' AND COLUMN_NAME = 'package_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_tenant ADD COLUMN expire_time DATETIME NULL COMMENT ''套餐到期时间，000000平台租户可为空表示永久有效'' AFTER package_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'sys_tenant' AND COLUMN_NAME = 'expire_time'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_tenant ADD COLUMN domain_name VARCHAR(100) NULL COMMENT ''绑定域名，如：admin.xxx.com'' AFTER expire_time',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'sys_tenant' AND COLUMN_NAME = 'domain_name'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS sys_dept (
  dept_id VARCHAR(32) PRIMARY KEY COMMENT '部门ID',
  tenant_id VARCHAR(32) NOT NULL COMMENT '租户ID',
  parent_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '父部门ID，000000表示根节点',
  dept_name VARCHAR(50) NOT NULL COMMENT '部门名称',
  sort_num INT DEFAULT 0 COMMENT '排序',
  status CHAR(1) DEFAULT '0' COMMENT '0正常 1停用',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0未删除 1已删除',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_dept_tenant (tenant_id),
  KEY idx_dept_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

CREATE TABLE IF NOT EXISTS sys_user (
  user_id VARCHAR(32) PRIMARY KEY COMMENT '用户ID',
  tenant_id VARCHAR(32) NOT NULL COMMENT '租户ID',
  username VARCHAR(50) NOT NULL COMMENT '登录账号',
  password VARCHAR(100) NOT NULL COMMENT '密码哈希',
  nickname VARCHAR(50) NOT NULL COMMENT '用户昵称',
  real_name VARCHAR(50) NULL COMMENT '真实姓名',
  avatar VARCHAR(500) NULL COMMENT '头像地址',
  gender CHAR(1) NOT NULL DEFAULT '2' COMMENT '性别：0男 1女 2未知',
  email VARCHAR(100) NULL COMMENT '邮箱',
  phone VARCHAR(30) NULL COMMENT '手机号',
  dept_id VARCHAR(32) NULL COMMENT '部门ID',
  is_admin CHAR(1) NOT NULL DEFAULT '0' COMMENT '是否管理员：0否 1是',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '状态：0正常 1停用',
  last_login_ip VARCHAR(45) NULL COMMENT '最后登录IP',
  last_login_time DATETIME NULL COMMENT '最后登录时间',
  password_update_time DATETIME NULL COMMENT '密码更新时间',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0未删除 1已删除',
  create_by VARCHAR(32) NULL COMMENT '创建人ID',
  update_by VARCHAR(32) NULL COMMENT '更新人ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_user_tenant_username (tenant_id, username),
  KEY idx_user_tenant (tenant_id),
  KEY idx_user_phone (phone),
  KEY idx_user_email (email),
  KEY idx_user_dept (dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

CREATE TABLE IF NOT EXISTS sys_role (
  role_id VARCHAR(32) PRIMARY KEY COMMENT '角色ID',
  tenant_id VARCHAR(32) NOT NULL COMMENT '租户ID',
  role_name VARCHAR(50) NOT NULL COMMENT '角色名称',
  role_key VARCHAR(50) NOT NULL COMMENT '角色标识',
  sort_num INT NOT NULL DEFAULT 0 COMMENT '排序',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_role_tenant_key (tenant_id, role_key),
  KEY idx_role_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

CREATE TABLE IF NOT EXISTS sys_menu (
  menu_id VARCHAR(32) PRIMARY KEY COMMENT '菜单ID，全局菜单',
  parent_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '父菜单ID，000000表示根节点',
  menu_name VARCHAR(50) NOT NULL COMMENT '菜单名称',
  icon VARCHAR(100) NULL COMMENT '菜单图标（Ant Design 图标名称）',
  path VARCHAR(200) NULL COMMENT '路由路径',
  component VARCHAR(200) NULL COMMENT '组件路径',
  perms VARCHAR(100) NULL COMMENT '权限标识',
  menu_type CHAR(1) NOT NULL DEFAULT '1' COMMENT '0目录 1菜单 2按钮',
  sort_num INT NOT NULL DEFAULT 0 COMMENT '排序',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_menu_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局菜单表';

CREATE TABLE IF NOT EXISTS sys_user_role (
  user_id VARCHAR(32) NOT NULL COMMENT '用户ID',
  role_id VARCHAR(32) NOT NULL COMMENT '角色ID',
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

CREATE TABLE IF NOT EXISTS sys_role_menu (
  role_id VARCHAR(32) NOT NULL COMMENT '角色ID',
  menu_id VARCHAR(32) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色菜单关联表';

CREATE TABLE IF NOT EXISTS sys_dict_type (
  dict_type_id VARCHAR(32) PRIMARY KEY COMMENT '字典类型ID',
  dict_name VARCHAR(100) NOT NULL COMMENT '字典名称',
  dict_type VARCHAR(100) NOT NULL COMMENT '字典类型',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  tenant_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dict_type_tenant (tenant_id, dict_type),
  KEY idx_dict_type_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表';

CREATE TABLE IF NOT EXISTS sys_dict_data (
  dict_data_id VARCHAR(32) PRIMARY KEY COMMENT '字典数据ID',
  dict_type_id VARCHAR(32) NOT NULL COMMENT '字典类型ID',
  dict_label VARCHAR(100) NOT NULL COMMENT '字典标签',
  dict_value VARCHAR(100) NOT NULL COMMENT '字典值',
  dict_sort INT NOT NULL DEFAULT 0 COMMENT '排序',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  tenant_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dict_data_type (dict_type_id),
  KEY idx_dict_data_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典数据表';

CREATE TABLE IF NOT EXISTS sys_config (
  config_id VARCHAR(32) PRIMARY KEY COMMENT '参数ID',
  tenant_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  config_key VARCHAR(100) NOT NULL COMMENT '参数键名',
  config_value TEXT NOT NULL COMMENT '参数键值',
  config_name VARCHAR(100) NOT NULL COMMENT '参数名称',
  config_type VARCHAR(20) NOT NULL DEFAULT 'sys' COMMENT 'sys/theme/dict',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_config_tenant_key (tenant_id, config_key),
  KEY idx_config_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数表';

CREATE TABLE IF NOT EXISTS sys_theme_config (
  theme_id VARCHAR(32) PRIMARY KEY COMMENT '主题配置ID',
  tenant_id VARCHAR(32) NOT NULL DEFAULT '000000' COMMENT '租户ID',
  nav_theme VARCHAR(20) NOT NULL DEFAULT 'light' COMMENT '导航主题',
  color_primary VARCHAR(20) NOT NULL DEFAULT '#1677ff' COMMENT '主色',
  layout VARCHAR(20) NOT NULL DEFAULT 'mix' COMMENT '布局',
  content_width VARCHAR(20) NOT NULL DEFAULT 'Fluid' COMMENT '内容宽度',
  fixed_header TINYINT NOT NULL DEFAULT 0 COMMENT '固定头部',
  fix_siderbar TINYINT NOT NULL DEFAULT 1 COMMENT '固定侧栏',
  color_weak TINYINT NOT NULL DEFAULT 0 COMMENT '色弱模式',
  title VARCHAR(100) NOT NULL DEFAULT 'BLS Admin' COMMENT '标题',
  logo VARCHAR(500) NULL COMMENT 'Logo',
  iconfont_url VARCHAR(500) NULL COMMENT 'iconfont地址',
  token_json TEXT NULL COMMENT '主题Token(JSON字符串)',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_theme_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统主题配置表';

-- 初始化套餐
INSERT INTO sys_package (package_id, package_name, status, remark)
VALUES
  ('P001', '平台全功能套餐', '0', '000000 平台租户使用，拥有全部菜单权限'),
  ('P100', '租户标准版套餐', '0', '普通租户标准版，默认不包含租户管理')
ON DUPLICATE KEY UPDATE package_name = VALUES(package_name), status = VALUES(status), remark = VALUES(remark);

-- 平台租户与默认租户
INSERT INTO sys_tenant (tenant_id, tenant_name, package_id, expire_time, domain_name, contact_user, contact_phone, status, remark)
VALUES
  ('000000', '平台租户', 'P001', NULL, 'admin.xxx.com', '系统管理员', '00000000000', '0', '平台默认租户，永久有效'),
  ('100000', '默认租户', 'P100', DATE_ADD(NOW(), INTERVAL 1 YEAR), 'test.xxx.com', '租户管理员', '13800000000', '0', '开箱即用默认租户，标准版套餐')
ON DUPLICATE KEY UPDATE tenant_name = VALUES(tenant_name), package_id = VALUES(package_id), expire_time = VALUES(expire_time), domain_name = VALUES(domain_name), contact_user = VALUES(contact_user), contact_phone = VALUES(contact_phone), status = VALUES(status), remark = VALUES(remark);

-- 默认部门
INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status, deleted)
VALUES
  ('000001', '000000', '000000', '平台总部', 1, '0', 0),
  ('100001', '100000', '000000', '默认租户总部', 1, '0', 0),
  ('100002', '100000', '100001', '技术部', 2, '0', 0),
  ('100003', '100000', '100001', '运营部', 3, '0', 0)
ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), parent_id = VALUES(parent_id), dept_name = VALUES(dept_name), sort_num = VALUES(sort_num), status = VALUES(status), deleted = VALUES(deleted);

-- 默认角色
INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, sort_num, status, remark, deleted)
VALUES
  ('000001', '000000', '超级管理员', 'admin', 1, '0', '平台超级管理员角色', 0),
  ('100001', '100000', '租户管理员', 'tenant_admin', 1, '0', '默认租户管理员角色', 0),
  ('100002', '100000', '普通用户', 'user', 2, '0', '默认租户普通用户角色', 0)
ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), role_name = VALUES(role_name), role_key = VALUES(role_key), sort_num = VALUES(sort_num), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

-- 默认用户，密码为 123456 的 MD5 哈希
INSERT INTO sys_user (user_id, tenant_id, username, password, nickname, real_name, avatar, gender, email, phone, dept_id, is_admin, status, remark, deleted)
VALUES
  ('000001', '000000', 'superadmin', 'e10adc3949ba59abbe56e057f20f883e', '平台管理员', '平台管理员', NULL, '2', NULL, NULL, '000001', '1', '0', '平台管理员', 0),
  ('100001', '100000', 'admin', 'e10adc3949ba59abbe56e057f20f883e', '租户管理员', '租户管理员', NULL, '2', NULL, NULL, '100001', '1', '0', '默认租户管理员', 0),
  ('100002', '100000', 'user', 'e10adc3949ba59abbe56e057f20f883e', '普通用户', '普通用户', NULL, '2', NULL, NULL, '100002', '0', '0', '默认租户普通用户', 0)
ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), username = VALUES(username), password = VALUES(password), nickname = VALUES(nickname), real_name = VALUES(real_name), avatar = VALUES(avatar), gender = VALUES(gender), email = VALUES(email), phone = VALUES(phone), dept_id = VALUES(dept_id), is_admin = VALUES(is_admin), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

INSERT IGNORE INTO sys_user_role (user_id, role_id)
VALUES ('000001', '000001'), ('100001', '100001'), ('100002', '100002');

-- 全局菜单与权限
INSERT INTO sys_menu (menu_id, parent_id, menu_name, icon, path, component, perms, menu_type, sort_num, status)
VALUES
  ('000100', '000000', '系统管理', 'SettingOutlined', '/system', NULL, NULL, '0', 1, '0'),
  ('000110', '000000', '租户管理', 'ApartmentOutlined', '/tenant', NULL, NULL, '0', 2, '0'),
  ('000111', '000110', '租户列表', 'ShopOutlined', '/tenant/list', 'system/tenant', 'system:tenant:list', '1', 1, '0'),
  ('000112', '000110', '租户套餐', 'AppstoreOutlined', '/tenant/package', 'system/package', 'system:package:list', '1', 2, '0'),
  ('000120', '000100', '部门管理', 'ApartmentOutlined', '/system/dept', 'system/dept', 'system:dept:list', '1', 1, '0'),
  ('000130', '000100', '用户管理', 'UserOutlined', '/system/user', 'system/user', 'system:user:list', '1', 2, '0'),
  ('000140', '000100', '角色管理', 'TeamOutlined', '/system/role', 'system/role', 'system:role:list', '1', 3, '0'),
  ('000150', '000100', '菜单管理', 'MenuOutlined', '/system/menu', 'system/menu', 'system:menu:list', '1', 4, '0'),
  ('000160', '000100', '系统参数', 'SettingOutlined', '/system/config', 'system/config', 'system:config:list', '1', 5, '0'),
  ('000170', '000100', '字典管理', 'DatabaseOutlined', '/system/dict', 'system/dict', 'system:dict:list', '1', 6, '0'),
  ('000180', '000100', '主题配置', 'SkinOutlined', '/system/theme', 'system/theme', 'system:theme:list', '1', 7, '0'),
  ('000113', '000111', '查询', NULL, NULL, 'system:tenant:list', '2', 1, '0'),
  ('000114', '000111', '新增', NULL, NULL, 'system:tenant:add', '2', 2, '0'),
  ('000115', '000111', '修改', NULL, NULL, 'system:tenant:edit', '2', 3, '0'),
  ('000116', '000111', '删除', NULL, NULL, 'system:tenant:remove', '2', 4, '0'),
  ('000117', '000112', '查询', NULL, NULL, 'system:package:list', '2', 1, '0'),
  ('000118', '000112', '新增', NULL, NULL, 'system:package:add', '2', 2, '0'),
  ('000119', '000112', '修改', NULL, NULL, 'system:package:edit', '2', 3, '0'),
  ('00011A', '000112', '删除', NULL, NULL, 'system:package:remove', '2', 4, '0'),
  ('000121', '000120', '查询', NULL, NULL, 'system:dept:list', '2', 1, '0'),
  ('000122', '000120', '新增', NULL, NULL, 'system:dept:add', '2', 2, '0'),
  ('000123', '000120', '修改', NULL, NULL, 'system:dept:edit', '2', 3, '0'),
  ('000124', '000120', '删除', NULL, NULL, 'system:dept:remove', '2', 4, '0'),
  ('000131', '000130', '查询', NULL, NULL, 'system:user:list', '2', 1, '0'),
  ('000132', '000130', '新增', NULL, NULL, 'system:user:add', '2', 2, '0'),
  ('000133', '000130', '修改', NULL, NULL, 'system:user:edit', '2', 3, '0'),
  ('000134', '000130', '删除', NULL, NULL, 'system:user:remove', '2', 4, '0'),
  ('000135', '000130', '重置密码', NULL, NULL, 'system:user:resetPwd', '2', 5, '0'),
  ('000141', '000140', '查询', NULL, NULL, 'system:role:list', '2', 1, '0'),
  ('000142', '000140', '新增', NULL, NULL, 'system:role:add', '2', 2, '0'),
  ('000143', '000140', '修改', NULL, NULL, 'system:role:edit', '2', 3, '0'),
  ('000144', '000140', '删除', NULL, NULL, 'system:role:remove', '2', 4, '0'),
  ('000145', '000140', '分配菜单', NULL, NULL, 'system:role:assignMenu', '2', 5, '0'),
  ('000151', '000150', '查询', NULL, NULL, 'system:menu:list', '2', 1, '0'),
  ('000152', '000150', '新增', NULL, NULL, 'system:menu:add', '2', 2, '0'),
  ('000153', '000150', '修改', NULL, NULL, 'system:menu:edit', '2', 3, '0'),
  ('000154', '000150', '删除', NULL, NULL, 'system:menu:remove', '2', 4, '0'),
  ('000161', '000160', '查询', NULL, NULL, 'system:config:list', '2', 1, '0'),
  ('000162', '000160', '新增', NULL, NULL, 'system:config:add', '2', 2, '0'),
  ('000163', '000160', '修改', NULL, NULL, 'system:config:edit', '2', 3, '0'),
  ('000171', '000170', '查询', NULL, NULL, 'system:dict:list', '2', 1, '0'),
  ('000172', '000170', '新增', NULL, NULL, 'system:dict:add', '2', 2, '0'),
  ('000173', '000170', '修改', NULL, NULL, 'system:dict:edit', '2', 3, '0'),
  ('000174', '000170', '删除', NULL, NULL, 'system:dict:remove', '2', 4, '0'),
  ('000181', '000180', '查询', NULL, NULL, 'system:theme:list', '2', 1, '0'),
  ('000182', '000180', '修改', NULL, NULL, 'system:theme:edit', '2', 2, '0')
ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), menu_name = VALUES(menu_name), path = VALUES(path), component = VALUES(component), perms = VALUES(perms), menu_type = VALUES(menu_type), sort_num = VALUES(sort_num), status = VALUES(status);

-- 套餐绑定菜单：平台套餐全部菜单，标准版不包含租户管理
INSERT IGNORE INTO sys_package_menu (package_id, menu_id)
SELECT 'P001', menu_id FROM sys_menu WHERE status = '0';

INSERT IGNORE INTO sys_package_menu (package_id, menu_id)
SELECT 'P100', menu_id FROM sys_menu
WHERE status = '0'
  AND menu_id NOT IN ('000110', '000111', '000112', '000113', '000114', '000115', '000116', '000117', '000118', '000119', '00011A');

-- 角色菜单必须是当前租户套餐菜单子集
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT '000001', menu_id FROM sys_package_menu WHERE package_id = 'P001';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT '100001', menu_id FROM sys_package_menu WHERE package_id = 'P100';

INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
VALUES
  ('100002', '000100'), ('100002', '000120'), ('100002', '000121'),
  ('100002', '000130'), ('100002', '000131'),
  ('100002', '000160'), ('100002', '000161');

-- 平台字典
INSERT INTO sys_dict_type (dict_type_id, dict_name, dict_type, status, remark, tenant_id, deleted)
VALUES
  ('000201', '性别', 'sys_gender', '0', '用户性别字典', '000000', 0),
  ('000202', '状态', 'sys_status', '0', '通用状态字典', '000000', 0),
  ('000203', '菜单类型', 'sys_menu_type', '0', '菜单类型字典', '000000', 0),
  ('000204', '是否', 'sys_yes_no', '0', '是否字典', '000000', 0),
  ('000205', '配置类型', 'sys_config_type', '0', '系统配置类型', '000000', 0)
ON DUPLICATE KEY UPDATE dict_name = VALUES(dict_name), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

INSERT INTO sys_dict_data (dict_data_id, dict_type_id, dict_label, dict_value, dict_sort, status, remark, tenant_id, deleted)
VALUES
  ('000301', '000201', '男', '0', 1, '0', '男', '000000', 0),
  ('000302', '000201', '女', '1', 2, '0', '女', '000000', 0),
  ('000303', '000201', '未知', '2', 3, '0', '未知', '000000', 0),
  ('000304', '000202', '正常', '0', 1, '0', '正常', '000000', 0),
  ('000305', '000202', '停用', '1', 2, '0', '停用', '000000', 0),
  ('000306', '000203', '目录', '0', 1, '0', '目录', '000000', 0),
  ('000307', '000203', '菜单', '1', 2, '0', '菜单', '000000', 0),
  ('000308', '000203', '按钮', '2', 3, '0', '按钮', '000000', 0),
  ('000309', '000204', '是', '1', 1, '0', '是', '000000', 0),
  ('000310', '000204', '否', '0', 2, '0', '否', '000000', 0),
  ('000311', '000205', '系统参数', 'sys', 1, '0', '系统参数', '000000', 0),
  ('000312', '000205', '主题配置', 'theme', 2, '0', '主题配置', '000000', 0),
  ('000313', '000205', '字典数据', 'dict', 3, '0', '字典数据', '000000', 0)
ON DUPLICATE KEY UPDATE dict_type_id = VALUES(dict_type_id), dict_label = VALUES(dict_label), dict_value = VALUES(dict_value), dict_sort = VALUES(dict_sort), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

-- 平台默认配置，可被租户配置覆盖，业务查询应优先租户配置并回退平台配置
INSERT INTO sys_config (config_id, tenant_id, config_key, config_value, config_name, config_type, status, remark, deleted)
VALUES
  ('000401', '000000', 'sys.user.defaultPassword', '123456', '默认密码', 'sys', '0', '新用户默认密码', 0),
  ('000402', '000000', 'sys.app.name', 'BLS Admin', '系统名称', 'sys', '0', '前后端展示名称', 0),
  ('000403', '000000', 'sys.demo.enabled', 'true', '演示模式开关', 'sys', '0', '是否开启演示数据', 0),
  ('000404', '000000', 'sys.upload.maxSize', '20', '文件上传限制(MB)', 'sys', '0', '文件上传大小限制', 0),
  ('000405', '000000', 'sys.version', '1.0.0', '版本号', 'sys', '0', '系统版本', 0),
  ('100401', '100000', 'sys.app.name', '默认租户工作台', '系统名称', 'sys', '0', '默认租户展示名称', 0)
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), config_name = VALUES(config_name), config_type = VALUES(config_type), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

INSERT INTO sys_theme_config (theme_id, tenant_id, nav_theme, color_primary, layout, content_width, fixed_header, fix_siderbar, color_weak, title, logo, iconfont_url, token_json, status, remark, deleted)
VALUES
  ('000501', '000000', 'light', '#1677ff', 'mix', 'Fluid', 0, 1, 0, 'BLS Admin', NULL, '', JSON_OBJECT(), '0', '平台默认主题配置', 0),
  ('100501', '100000', 'light', '#1677ff', 'mix', 'Fluid', 0, 1, 0, '默认租户工作台', NULL, '', JSON_OBJECT(), '0', '默认租户主题配置', 0)
ON DUPLICATE KEY UPDATE nav_theme = VALUES(nav_theme), color_primary = VALUES(color_primary), layout = VALUES(layout), content_width = VALUES(content_width), fixed_header = VALUES(fixed_header), fix_siderbar = VALUES(fix_siderbar), color_weak = VALUES(color_weak), title = VALUES(title), logo = VALUES(logo), iconfont_url = VALUES(iconfont_url), token_json = VALUES(token_json), status = VALUES(status), remark = VALUES(remark), deleted = VALUES(deleted);

CREATE TABLE IF NOT EXISTS sys_ui_field (
  field_id VARCHAR(32) PRIMARY KEY COMMENT '字段ID',
  page_code VARCHAR(100) NOT NULL COMMENT '页面编码，如 system_dept',
  field_key VARCHAR(100) NOT NULL COMMENT '字段名，如 deptName',
  field_label VARCHAR(100) NOT NULL COMMENT '字段标题，如 部门名称',

  field_scope CHAR(1) NOT NULL DEFAULT '2' COMMENT '字段范围：0表格 1表单 2两者都用',
  field_type VARCHAR(50) NOT NULL DEFAULT 'text' COMMENT '字段类型：text/select/digit/textarea/dateTime/treeSelect',
  value_enum_key VARCHAR(100) NULL COMMENT '字典类型，如 sys_status',

  is_search TINYINT NOT NULL DEFAULT 1 COMMENT '是否参与搜索：1是 0否',
  is_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否必填：1是 0否',
  is_copyable TINYINT NOT NULL DEFAULT 0 COMMENT '是否可复制：1是 0否',
  is_ellipsis TINYINT NOT NULL DEFAULT 0 COMMENT '是否省略显示：1是 0否',

  is_form_visible TINYINT NOT NULL DEFAULT 1 COMMENT '表单是否显示：1是 0否',
  is_table_visible TINYINT NOT NULL DEFAULT 1 COMMENT '表格是否显示：1是 0否',

  width INT NULL COMMENT '表格列宽',
  sort_num INT NOT NULL DEFAULT 0 COMMENT '排序号',
  default_value VARCHAR(200) NULL COMMENT '默认值',
  placeholder VARCHAR(200) NULL COMMENT '占位提示',

  props_json JSON NULL COMMENT '额外属性JSON，如 treeSelect / multiple 等',
  render_code VARCHAR(100) NULL COMMENT '特殊渲染标记，如 iconPicker/statusTag',
  before_submit_code VARCHAR(100) NULL COMMENT '提交前处理标记，如 joinComma/splitArray',

  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0启用 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_field_page_code (page_code),
  KEY idx_field_sort (page_code, sort_num),
  KEY idx_field_key (page_code, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态字段元数据表';

SET FOREIGN_KEY_CHECKS = 1;
