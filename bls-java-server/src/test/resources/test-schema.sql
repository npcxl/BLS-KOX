-- H2 test schema (aligned with Init.sql tables)
-- H2 doesn't support all MySQL types, so we adapt where needed

CREATE TABLE IF NOT EXISTS sys_tenant (
    tenant_id VARCHAR(32) PRIMARY KEY,
    tenant_name VARCHAR(100) NOT NULL,
    domain_name VARCHAR(200),
    package_id VARCHAR(32),
    contact_user VARCHAR(50),
    contact_phone VARCHAR(30),
    expire_time TIMESTAMP NULL,
    status VARCHAR(1) DEFAULT '0',
    remark VARCHAR(500),
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_user (
    user_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    password_algorithm VARCHAR(20) DEFAULT 'md5',
    nickname VARCHAR(50) NOT NULL,
    real_name VARCHAR(50),
    avatar VARCHAR(500),
    gender VARCHAR(1) DEFAULT '2',
    email VARCHAR(100),
    phone VARCHAR(30),
    dept_id VARCHAR(32),
    is_admin VARCHAR(1) DEFAULT '0',
    status VARCHAR(1) DEFAULT '0',
    last_login_ip VARCHAR(45),
    last_login_time TIMESTAMP NULL,
    password_update_time TIMESTAMP NULL,
    remark VARCHAR(500),
    deleted INT DEFAULT 0,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_role (
    role_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    role_key VARCHAR(50) NOT NULL,
    data_scope VARCHAR(20) DEFAULT 'TENANT',
    sort_num INT DEFAULT 0,
    status VARCHAR(1) DEFAULT '0',
    remark VARCHAR(500),
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_menu (
    menu_id VARCHAR(32) PRIMARY KEY,
    parent_id VARCHAR(32) DEFAULT '000000',
    menu_name VARCHAR(50) NOT NULL,
    path VARCHAR(200),
    component VARCHAR(200),
    perms VARCHAR(100),
    icon VARCHAR(100),
    menu_type VARCHAR(1) DEFAULT '1',
    sort_num INT DEFAULT 0,
    status VARCHAR(1) DEFAULT '0',
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_dept (
    dept_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    parent_id VARCHAR(32) DEFAULT '000000',
    dept_name VARCHAR(50) NOT NULL,
    sort_num INT DEFAULT 0,
    status VARCHAR(1) DEFAULT '0',
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id VARCHAR(32) NOT NULL,
    role_id VARCHAR(32) NOT NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sys_role_menu (
    role_id VARCHAR(32) NOT NULL,
    menu_id VARCHAR(32) NOT NULL,
    PRIMARY KEY (role_id, menu_id)
);

CREATE TABLE IF NOT EXISTS sys_login_log (
    log_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) DEFAULT '000000',
    user_id VARCHAR(32),
    username VARCHAR(50),
    login_type VARCHAR(20) DEFAULT 'password',
    login_status VARCHAR(1) DEFAULT '1',
    fail_reason VARCHAR(500),
    login_ip VARCHAR(45),
    user_agent VARCHAR(500),
    request_id VARCHAR(64),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
INSERT INTO sys_tenant (tenant_id, tenant_name, domain_name, status) VALUES ('000000', '平台租户', 'localhost', '0');
INSERT INTO sys_tenant (tenant_id, tenant_name, domain_name, status) VALUES ('100000', '默认租户', 'demo.example.com', '0');

INSERT INTO sys_user (user_id, tenant_id, username, password, password_algorithm, nickname, is_admin, status) VALUES
('000001', '000000', 'superadmin', 'e10adc3949ba59abbe56e057f20f883e', 'md5', '超级管理员', '1', '0');

INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, data_scope, sort_num, status) VALUES
('000001', '000000', '超级管理员', 'admin', 'ALL', 1, '0'),
('100001', '100000', '租户管理员', 'tenant_admin', 'TENANT', 1, '0');

INSERT INTO sys_menu (menu_id, parent_id, menu_name, menu_type, path, perms, sort_num, status) VALUES
('000100', '000000', '系统管理', '0', '/system', NULL, 1, '0'),
('000120', '000100', '部门管理', '1', '/system/dept', 'system:dept:list', 2, '0'),
('000121', '000120', '查询', '2', NULL, 'system:dept:list', 1, '0'),
('000130', '000100', '用户管理', '1', '/system/user', 'system:user:list', 3, '0'),
('000131', '000130', '查询', '2', NULL, 'system:user:list', 1, '0'),
('000133', '000130', '修改', '2', NULL, 'system:user:edit', 3, '0'),
('000134', '000130', '删除', '2', NULL, 'system:user:remove', 4, '0'),
('000140', '000100', '角色管理', '1', '/system/role', 'system:role:list', 4, '0'),
('000141', '000140', '查询', '2', NULL, 'system:role:list', 1, '0'),
('000142', '000140', '新增', '2', NULL, 'system:role:add', 2, '0'),
('000150', '000100', '菜单管理', '1', '/system/menu', 'system:menu:list', 5, '0'),
('000151', '000150', '查询', '2', NULL, 'system:menu:list', 1, '0'),
('000160', '000100', '系统参数', '1', '/system/config', 'system:config:list', 6, '0'),
('000161', '000160', '查询', '2', NULL, 'system:config:list', 1, '0'),
('000170', '000100', '字典管理', '1', '/system/dict', 'system:dict:list', 7, '0'),
('000171', '000170', '查询', '2', NULL, 'system:dict:list', 1, '0');

INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status) VALUES
('000001', '000000', '000000', '平台总部', 1, '0'),
('100001', '100000', '000000', '默认租户总部', 1, '0');

INSERT INTO sys_user_role (user_id, role_id) VALUES ('000001', '000001');

INSERT INTO sys_role_menu (role_id, menu_id) VALUES
('000001', '000100'), ('000001', '000120'), ('000001', '000121'),
('000001', '000130'), ('000001', '000131'), ('000001', '000133'), ('000001', '000134'),
('000001', '000140'), ('000001', '000141'), ('000001', '000142'),
('000001', '000150'), ('000001', '000151'),
('000001', '000160'), ('000001', '000161'),
('000001', '000170'), ('000001', '000171');
