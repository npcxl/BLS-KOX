
CREATE DATABASE IF NOT EXISTS `bls` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bls`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS sys_tenant (
  tenant_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_name VARCHAR(100) NOT NULL,
  contact_user VARCHAR(50) NULL,
  contact_phone VARCHAR(30) NULL,
  status CHAR(1) NOT NULL DEFAULT '0',
  remark VARCHAR(500) NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_dept (
  dept_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '部门ID',
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
  parent_id BIGINT DEFAULT 0 COMMENT '父部门ID',
  dept_name VARCHAR(50) NOT NULL COMMENT '部门名称',
  sort_num INT DEFAULT 0 COMMENT '排序',
  status CHAR(1) DEFAULT '0' COMMENT '0正常 1停用',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0未删除 1已删除',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dept_tenant (tenant_id),
  KEY idx_dept_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

CREATE TABLE IF NOT EXISTS sys_user (
  user_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID，0表示平台租户',
  username VARCHAR(50) NOT NULL COMMENT '登录账号',
  password VARCHAR(100) NOT NULL COMMENT '密码哈希',
  nickname VARCHAR(50) NOT NULL COMMENT '用户昵称',
  real_name VARCHAR(50) NULL COMMENT '真实姓名',
  avatar VARCHAR(500) NULL COMMENT '头像地址',
  gender CHAR(1) NOT NULL DEFAULT '2' COMMENT '性别：0男 1女 2未知',
  email VARCHAR(100) NULL COMMENT '邮箱',
  phone VARCHAR(30) NULL COMMENT '手机号',
  dept_id BIGINT NULL COMMENT '部门ID',
  is_admin CHAR(1) NOT NULL DEFAULT '0' COMMENT '是否管理员：0否 1是',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '状态：0正常 1停用',
  last_login_ip VARCHAR(45) NULL COMMENT '最后登录IP',
  last_login_time DATETIME NULL COMMENT '最后登录时间',
  password_update_time DATETIME NULL COMMENT '密码更新时间',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0未删除 1已删除',
  create_by BIGINT NULL COMMENT '创建人ID',
  update_by BIGINT NULL COMMENT '更新人ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_user_tenant_username (tenant_id, username),
  KEY idx_user_tenant (tenant_id),
  KEY idx_user_phone (phone),
  KEY idx_user_email (email),
  KEY idx_user_dept (dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

CREATE TABLE IF NOT EXISTS sys_role (
  role_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 0,
  role_name VARCHAR(50) NOT NULL,
  role_key VARCHAR(50) NOT NULL,
  sort_num INT NOT NULL DEFAULT 0,
  status CHAR(1) NOT NULL DEFAULT '0',
  remark VARCHAR(500) NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_role_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_menu (
  menu_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parent_id BIGINT NOT NULL DEFAULT 0,
  menu_name VARCHAR(50) NOT NULL,
  path VARCHAR(200) NULL,
  component VARCHAR(200) NULL,
  perms VARCHAR(100) NULL,
  menu_type CHAR(1) NOT NULL DEFAULT '1',
  sort_num INT NOT NULL DEFAULT 0,
  status CHAR(1) NOT NULL DEFAULT '0',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_menu_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_user_role (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_role_menu (
  role_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_dict_type (
  dict_type_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dict_name VARCHAR(100) NOT NULL COMMENT '字典名称',
  dict_type VARCHAR(100) NOT NULL COMMENT '字典类型',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dict_type_tenant (tenant_id, dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表';

CREATE TABLE IF NOT EXISTS sys_dict_data (
  dict_data_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dict_type_id BIGINT NOT NULL COMMENT '字典类型ID',
  dict_label VARCHAR(100) NOT NULL COMMENT '字典标签',
  dict_value VARCHAR(100) NOT NULL COMMENT '字典值',
  dict_sort INT NOT NULL DEFAULT 0 COMMENT '排序',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dict_data_type (dict_type_id),
  KEY idx_dict_data_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典数据表';

CREATE TABLE IF NOT EXISTS sys_config (
  config_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
  config_key VARCHAR(100) NOT NULL COMMENT '参数键名',
  config_value TEXT NOT NULL COMMENT '参数键值',
  config_name VARCHAR(100) NOT NULL COMMENT '参数名称',
  config_type VARCHAR(20) NOT NULL DEFAULT 'sys' COMMENT 'sys/theme/dict',
  status CHAR(1) NOT NULL DEFAULT '0' COMMENT '0正常 1停用',
  remark VARCHAR(500) NULL COMMENT '备注',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_config_tenant_key (tenant_id, config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数表';

CREATE TABLE IF NOT EXISTS sys_theme_config (
  theme_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
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

-- 基础租户数据
INSERT INTO sys_tenant (tenant_id, tenant_name, contact_user, contact_phone, status, remark)
VALUES
  (0, '平台租户', '系统管理员', '00000000000', '0', '平台默认租户'),
  (1, '默认租户', '张三', '13800000000', '0', '默认示例租户'),
  (2, '奶龙集团', '李四', '13900000001', '0', '奶龙大王'),
  (3, '暴龙神有限公司', '王五', '13900000002', '0', '暴龙神')
ON DUPLICATE KEY UPDATE
  tenant_name = VALUES(tenant_name),
  contact_user = VALUES(contact_user),
  contact_phone = VALUES(contact_phone),
  status = VALUES(status),
  remark = VALUES(remark);

-- 基础部门数据
INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status, deleted)
VALUES
  (1, 0, 0, '平台总部', 1, '0', 0),
  (2, 1, 0, '默认租户总部', 1, '0', 0),
  (3, 1, 2, '技术部', 2, '0', 0),
  (4, 1, 2, '运营部', 3, '0', 0)
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  parent_id = VALUES(parent_id),
  dept_name = VALUES(dept_name),
  sort_num = VALUES(sort_num),
  status = VALUES(status),
  deleted = VALUES(deleted);

-- 基础角色数据
INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, sort_num, status, remark, deleted)
VALUES
  (1, 0, '超级管理员', 'admin', 1, '0', '平台超级管理员角色', 0),
  (2, 1, '租户管理员', 'tenant_admin', 1, '0', '默认租户管理员角色', 0),
  (3, 1, '普通用户', 'user', 2, '0', '默认租户普通用户角色', 0)
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  role_name = VALUES(role_name),
  role_key = VALUES(role_key),
  sort_num = VALUES(sort_num),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

-- 基础用户数据（密码统一为 123456 的哈希值）
INSERT INTO sys_user (
  user_id, tenant_id, username, password, nickname, real_name, avatar, gender, email, phone,
  dept_id, is_admin, status, remark, deleted
)
VALUES
  (1, 0, 'admin', '$2a$10$6s7Qwz8wXQ4lQe1R6hQkOe9i1hR7eLx4nN7f6tQm1v1Wc7v1j1o3e', '平台管理员', '平台管理员', NULL, '2', NULL, NULL, 1, '1', '0', '平台管理员', 0),
  (2, 1, 'admin', '$2a$10$6s7Qwz8wXQ4lQe1R6hQkOe9i1hR7eLx4nN7f6tQm1v1Wc7v1j1o3e', '租户管理员', '租户管理员', NULL, '2', NULL, NULL, 2, '0', '0', '默认租户管理员', 0),
  (3, 1, 'user', '$2a$10$6s7Qwz8wXQ4lQe1R6hQkOe9i1hR7eLx4nN7f6tQm1v1Wc7v1j1o3e', '普通用户', '普通用户', NULL, '2', NULL, NULL, 3, '0', '0', '默认租户普通用户', 0)
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  username = VALUES(username),
  password = VALUES(password),
  nickname = VALUES(nickname),
  real_name = VALUES(real_name),
  avatar = VALUES(avatar),
  gender = VALUES(gender),
  email = VALUES(email),
  phone = VALUES(phone),
  dept_id = VALUES(dept_id),
  is_admin = VALUES(is_admin),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

-- 用户角色关联
INSERT INTO sys_user_role (user_id, role_id)
VALUES
  (1, 1),
  (2, 2),
  (3, 3)
ON DUPLICATE KEY UPDATE
  role_id = VALUES(role_id);

-- 基础菜单数据
INSERT INTO sys_menu (
  menu_id, parent_id, menu_name, path, component, perms, menu_type, sort_num, status
)
VALUES
  (1, 0, '系统管理', '/system', NULL, NULL, '0', 1, '0'),
  (2, 1, '租户管理', '/system/tenant', 'system/tenant', 'system:tenant:list', '1', 1, '0'),
  (3, 1, '部门管理', '/system/dept', 'system/dept', 'system:dept:list', '1', 2, '0'),
  (4, 1, '用户管理', '/system/user', 'system/user', 'system:user:list', '1', 3, '0'),
  (5, 1, '角色管理', '/system/role', 'system/role', 'system:role:list', '1', 4, '0'),
  (6, 1, '菜单管理', '/system/menu', 'system/menu', 'system:menu:list', '1', 5, '0'),
  (7, 1, '系统参数', '/system/config', 'system/config', 'system:config:list', '1', 6, '0'),
  (8, 1, '字典管理', '/system/dict', 'system/dict', 'system:dict:list', '1', 7, '0'),
  (9, 1, '主题配置', '/system/theme', 'system/theme', 'system:theme:list', '1', 8, '0'),
  (11, 2, '查询', NULL, NULL, 'system:tenant:list', '2', 1, '0'),
  (12, 2, '新增', NULL, NULL, 'system:tenant:add', '2', 2, '0'),
  (13, 2, '修改', NULL, NULL, 'system:tenant:edit', '2', 3, '0'),
  (14, 2, '删除', NULL, NULL, 'system:tenant:remove', '2', 4, '0'),
  (21, 3, '查询', NULL, NULL, 'system:dept:list', '2', 1, '0'),
  (22, 3, '新增', NULL, NULL, 'system:dept:add', '2', 2, '0'),
  (23, 3, '修改', NULL, NULL, 'system:dept:edit', '2', 3, '0'),
  (24, 3, '删除', NULL, NULL, 'system:dept:remove', '2', 4, '0'),
  (31, 4, '查询', NULL, NULL, 'system:user:list', '2', 1, '0'),
  (32, 4, '新增', NULL, NULL, 'system:user:add', '2', 2, '0'),
  (33, 4, '修改', NULL, NULL, 'system:user:edit', '2', 3, '0'),
  (34, 4, '删除', NULL, NULL, 'system:user:remove', '2', 4, '0'),
  (35, 4, '重置密码', NULL, NULL, 'system:user:resetPwd', '2', 5, '0'),
  (41, 5, '查询', NULL, NULL, 'system:role:list', '2', 1, '0'),
  (42, 5, '新增', NULL, NULL, 'system:role:add', '2', 2, '0'),
  (43, 5, '修改', NULL, NULL, 'system:role:edit', '2', 3, '0'),
  (44, 5, '删除', NULL, NULL, 'system:role:remove', '2', 4, '0'),
  (45, 5, '分配菜单', NULL, NULL, 'system:role:assignMenu', '2', 5, '0'),
  (51, 6, '查询', NULL, NULL, 'system:menu:list', '2', 1, '0'),
  (52, 6, '新增', NULL, NULL, 'system:menu:add', '2', 2, '0'),
  (53, 6, '修改', NULL, NULL, 'system:menu:edit', '2', 3, '0'),
  (54, 6, '删除', NULL, NULL, 'system:menu:remove', '2', 4, '0'),
  (71, 7, '查询', NULL, NULL, 'system:config:list', '2', 1, '0'),
  (72, 7, '新增', NULL, NULL, 'system:config:add', '2', 2, '0'),
  (73, 7, '修改', NULL, NULL, 'system:config:edit', '2', 3, '0'),
  (81, 8, '查询', NULL, NULL, 'system:dict:list', '2', 1, '0'),
  (82, 8, '新增', NULL, NULL, 'system:dict:add', '2', 2, '0'),
  (83, 8, '修改', NULL, NULL, 'system:dict:edit', '2', 3, '0'),
  (84, 8, '删除', NULL, NULL, 'system:dict:remove', '2', 4, '0'),
  (91, 9, '查询', NULL, NULL, 'system:theme:list', '2', 1, '0'),
  (92, 9, '修改', NULL, NULL, 'system:theme:edit', '2', 2, '0')
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  menu_name = VALUES(menu_name),
  path = VALUES(path),
  component = VALUES(component),
  perms = VALUES(perms),
  menu_type = VALUES(menu_type),
  sort_num = VALUES(sort_num),
  status = VALUES(status);

-- 角色菜单关联
INSERT INTO sys_role_menu (role_id, menu_id)
VALUES
  (1, 1), (1, 2), (1, 11), (1, 12), (1, 13), (1, 14),
  (1, 3), (1, 21), (1, 22), (1, 23), (1, 24),
  (1, 4), (1, 31), (1, 32), (1, 33), (1, 34), (1, 35),
  (1, 5), (1, 41), (1, 42), (1, 43), (1, 44), (1, 45),
  (1, 6), (1, 51), (1, 52), (1, 53), (1, 54),
  (1, 7), (1, 71), (1, 72), (1, 73),
  (1, 8), (1, 81), (1, 82), (1, 83), (1, 84),
  (1, 9), (1, 91), (1, 92),
  (2, 1), (2, 2), (2, 11), (2, 21), (2, 31), (2, 41), (2, 51), (2, 71), (2, 81), (2, 91),
  (2, 7), (2, 8), (2, 9)
ON DUPLICATE KEY UPDATE
  menu_id = VALUES(menu_id);

-- 字典类型
INSERT INTO sys_dict_type (dict_type_id, dict_name, dict_type, status, remark, tenant_id, deleted)
VALUES
  (1, '性别', 'sys_gender', '0', '用户性别字典', 0, 0),
  (2, '状态', 'sys_status', '0', '通用状态字典', 0, 0),
  (3, '菜单类型', 'sys_menu_type', '0', '菜单类型字典', 0, 0),
  (4, '是否', 'sys_yes_no', '0', '是否字典', 0, 0),
  (5, '配置类型', 'sys_config_type', '0', '系统配置类型', 0, 0)
ON DUPLICATE KEY UPDATE
  dict_name = VALUES(dict_name),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

-- 字典数据
INSERT INTO sys_dict_data (
  dict_data_id, dict_type_id, dict_label, dict_value, dict_sort, status, remark, tenant_id, deleted
)
VALUES
  (1, 1, '男', '0', 1, '0', '男', 0, 0),
  (2, 1, '女', '1', 2, '0', '女', 0, 0),
  (3, 1, '未知', '2', 3, '0', '未知', 0, 0),
  (4, 2, '正常', '0', 1, '0', '正常', 0, 0),
  (5, 2, '停用', '1', 2, '0', '停用', 0, 0),
  (6, 3, '目录', '0', 1, '0', '目录', 0, 0),
  (7, 3, '菜单', '1', 2, '0', '菜单', 0, 0),
  (8, 3, '按钮', '2', 3, '0', '按钮', 0, 0),
  (9, 4, '是', '1', 1, '0', '是', 0, 0),
  (10, 4, '否', '0', 2, '0', '否', 0, 0),
  (11, 5, '系统参数', 'sys', 1, '0', '系统参数', 0, 0),
  (12, 5, '主题配置', 'theme', 2, '0', '主题配置', 0, 0),
  (13, 5, '字典数据', 'dict', 3, '0', '字典数据', 0, 0)
ON DUPLICATE KEY UPDATE
  dict_type_id = VALUES(dict_type_id),
  dict_label = VALUES(dict_label),
  dict_value = VALUES(dict_value),
  dict_sort = VALUES(dict_sort),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

-- 系统参数
INSERT INTO sys_config (
  config_id, tenant_id, config_key, config_value, config_name, config_type, status, remark, deleted
)
VALUES
  (1, 0, 'sys.user.defaultPassword', '123456', '默认密码', 'sys', '0', '新用户默认密码', 0),
  (2, 0, 'sys.app.name', 'BLS Admin', '系统名称', 'sys', '0', '前后端展示名称', 0),
  (3, 0, 'sys.demo.enabled', 'true', '演示模式开关', 'sys', '0', '是否开启演示数据', 0),
  (4, 0, 'sys.upload.maxSize', '20', '文件上传限制(MB)', 'sys', '0', '文件上传大小限制', 0),
  (5, 0, 'sys.version', '1.0.0', '版本号', 'sys', '0', '系统版本', 0)
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  config_name = VALUES(config_name),
  config_type = VALUES(config_type),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

-- 系统主题配置
INSERT INTO sys_theme_config (
  theme_id, tenant_id, nav_theme, color_primary, layout, content_width, fixed_header, fix_siderbar,
  color_weak, title, logo, iconfont_url, token_json, status, remark, deleted
)
VALUES
  (1, 0, 'light', '#1677ff', 'mix', 'Fluid', 0, 1, 0, 'BLS Admin', NULL, '', JSON_OBJECT(), '0', '默认主题配置', 0)
ON DUPLICATE KEY UPDATE
  nav_theme = VALUES(nav_theme),
  color_primary = VALUES(color_primary),
  layout = VALUES(layout),
  content_width = VALUES(content_width),
  fixed_header = VALUES(fixed_header),
  fix_siderbar = VALUES(fix_siderbar),
  color_weak = VALUES(color_weak),
  title = VALUES(title),
  logo = VALUES(logo),
  iconfont_url = VALUES(iconfont_url),
  token_json = VALUES(token_json),
  status = VALUES(status),
  remark = VALUES(remark),
  deleted = VALUES(deleted);

SET FOREIGN_KEY_CHECKS = 1;

SET FOREIGN_KEY_CHECKS = 1;