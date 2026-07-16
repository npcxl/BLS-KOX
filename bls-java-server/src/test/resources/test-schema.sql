-- H2 test schema (simplified subset of Init.sql)
CREATE TABLE IF NOT EXISTS sys_tenant (
    tenant_id VARCHAR(32) PRIMARY KEY,
    tenant_name VARCHAR(100) NOT NULL,
    domain_name VARCHAR(100),
    package_id VARCHAR(32),
    contact_name VARCHAR(50),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    status VARCHAR(1) DEFAULT '0',
    expire_time TIMESTAMP NULL,
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    remark VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS sys_dept (
    dept_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    parent_id VARCHAR(32) DEFAULT '0',
    ancestors VARCHAR(500) DEFAULT '0',
    dept_name VARCHAR(100) NOT NULL,
    sort_num INT DEFAULT 0,
    leader VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    status VARCHAR(1) DEFAULT '0',
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    remark VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS sys_user (
    user_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    username VARCHAR(64) NOT NULL,
    password VARCHAR(255) NOT NULL,
    password_algorithm VARCHAR(20) DEFAULT 'md5',
    nickname VARCHAR(64),
    real_name VARCHAR(64),
    avatar VARCHAR(255),
    gender VARCHAR(1) DEFAULT '0',
    email VARCHAR(100),
    phone VARCHAR(20),
    dept_id VARCHAR(32),
    is_admin INT DEFAULT 0,
    status VARCHAR(1) DEFAULT '0',
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    remark VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS sys_role (
    role_id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    role_name VARCHAR(64) NOT NULL,
    role_key VARCHAR(64) NOT NULL,
    data_scope VARCHAR(20) DEFAULT 'SELF',
    status VARCHAR(1) DEFAULT '0',
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    remark VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS sys_menu (
    menu_id VARCHAR(32) PRIMARY KEY,
    parent_id VARCHAR(32) DEFAULT '0',
    menu_name VARCHAR(64) NOT NULL,
    menu_type VARCHAR(1) DEFAULT '0',
    path VARCHAR(255),
    component VARCHAR(255),
    icon VARCHAR(100),
    perms VARCHAR(255),
    sort_num INT DEFAULT 0,
    status VARCHAR(1) DEFAULT '0',
    is_cache INT DEFAULT 0,
    is_frame INT DEFAULT 0,
    visible INT DEFAULT 1,
    deleted INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    create_by VARCHAR(32),
    update_by VARCHAR(32),
    remark VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS sys_user_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    role_id VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS sys_role_menu (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(32) NOT NULL,
    menu_id VARCHAR(32) NOT NULL
);

-- Seed data for tests
INSERT INTO sys_tenant (tenant_id, tenant_name, domain_name, status) VALUES ('000000', '平台租户', 'localhost', '0');
INSERT INTO sys_tenant (tenant_id, tenant_name, domain_name, status) VALUES ('100000', '默认租户', 'tenant1.localhost', '0');

INSERT INTO sys_user (user_id, tenant_id, username, password, password_algorithm, nickname, is_admin, status) VALUES
('u001', '000000', 'superadmin', 'e10adc3949ba59abbe56e057f20f883e', 'md5', '超级管理员', 1, '0');

INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, data_scope, status) VALUES
('r001', '000000', '超级管理员', 'admin', 'ALL', '0'),
('r002', '100000', '租户管理员', 'tenant_admin', 'TENANT', '0');

INSERT INTO sys_menu (menu_id, parent_id, menu_name, menu_type, path, perms, sort_num, status) VALUES
('m001', '0', '系统管理', '0', '/system', NULL, 1, '0'),
('m002', 'm001', '用户管理', '1', '/system/user', 'system:user:list', 1, '0'),
('m003', 'm001', '角色管理', '1', '/system/role', 'system:role:list', 2, '0'),
('m004', 'm001', '菜单管理', '1', '/system/menu', 'system:menu:list', 3, '0'),
('m005', 'm002', '用户新增', '2', NULL, 'system:user:add', 1, '0'),
('m006', 'm002', '用户编辑', '2', NULL, 'system:user:edit', 2, '0'),
('m007', 'm002', '用户删除', '2', NULL, 'system:user:remove', 3, '0'),
('m008', 'm003', '角色新增', '2', NULL, 'system:role:add', 1, '0'),
('m009', 'm003', '角色编辑', '2', NULL, 'system:role:edit', 2, '0'),
('m010', 'm003', '角色删除', '2', NULL, 'system:role:remove', 3, '0');

INSERT INTO sys_user_role (user_id, role_id) VALUES ('u001', 'r001');

INSERT INTO sys_role_menu (role_id, menu_id) VALUES
('r001', 'm001'), ('r001', 'm002'), ('r001', 'm003'), ('r001', 'm004'),
('r001', 'm005'), ('r001', 'm006'), ('r001', 'm007'),
('r001', 'm008'), ('r001', 'm009'), ('r001', 'm010');
