import mysql from "mysql2/promise";
import { env } from "../config/env";
import { hashPassword } from "../shared/utils/password";

async function main() {
  const root = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.end();

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });

  await conn.query(`
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
`);

  await conn.query(
    `INSERT IGNORE INTO sys_tenant (tenant_id, tenant_name, contact_user, status, remark) VALUES (0, '平台管理', '平台管理员', '0', '系统内置平台租户')`,
  );

  const password = await hashPassword("admin123");
  await conn.query(
    `INSERT INTO sys_user (user_id, tenant_id, username, password, nickname, real_name, avatar, gender, email, phone, is_admin, status, password_update_time, remark)
     VALUES (1, 0, 'admin', ?, '超级管理员', '平台管理员', NULL, '2', 'admin@example.com', NULL, '1', '0', NOW(), '系统内置管理员')
     ON DUPLICATE KEY UPDATE password = VALUES(password), nickname = VALUES(nickname), real_name = VALUES(real_name),
     avatar = VALUES(avatar), gender = VALUES(gender), email = VALUES(email), phone = VALUES(phone),
     is_admin = VALUES(is_admin), status = VALUES(status), password_update_time = VALUES(password_update_time)`,
    [password],
  );

  const menus = [
    [1, 0, "系统管理", "/system", null, null, "0", 1],
    [
      2,
      1,
      "租户管理",
      "/system/tenant",
      "system/tenant/index",
      "system:tenant:list",
      "1",
      1,
    ],
    [
      3,
      1,
      "部门管理",
      "/system/dept",
      "system/dept/index",
      "system:dept:list",
      "1",
      2,
    ],
    [
      4,
      1,
      "用户管理",
      "/system/user",
      "system/user/index",
      "system:user:list",
      "1",
      3,
    ],
    [
      5,
      1,
      "角色管理",
      "/system/role",
      "system/role/index",
      "system:role:list",
      "1",
      4,
    ],
    [
      6,
      1,
      "菜单管理",
      "/system/menu",
      "system/menu/index",
      "system:menu:list",
      "1",
      5,
    ],
    [7, 2, "租户新增", null, null, "system:tenant:add", "2", 1],
    [8, 2, "租户编辑", null, null, "system:tenant:edit", "2", 2],
    [9, 2, "租户删除", null, null, "system:tenant:remove", "2", 3],
    [10, 3, "部门新增", null, null, "system:dept:add", "2", 1],
    [11, 3, "部门编辑", null, null, "system:dept:edit", "2", 2],
    [12, 3, "部门删除", null, null, "system:dept:remove", "2", 3],
    [13, 4, "用户新增", null, null, "system:user:add", "2", 1],
    [14, 4, "用户编辑", null, null, "system:user:edit", "2", 2],
    [15, 4, "用户删除", null, null, "system:user:remove", "2", 3],
    [16, 5, "角色新增", null, null, "system:role:add", "2", 1],
    [17, 5, "角色编辑", null, null, "system:role:edit", "2", 2],
    [18, 6, "菜单新增", null, null, "system:menu:add", "2", 1],
    [19, 6, "菜单编辑", null, null, "system:menu:edit", "2", 2],
  ];

  for (const menu of menus) {
    await conn.query(
      `INSERT INTO sys_menu (menu_id, parent_id, menu_name, path, component, perms, menu_type, sort_num, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '0')
       ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), menu_name = VALUES(menu_name), path = VALUES(path),
       component = VALUES(component), perms = VALUES(perms), menu_type = VALUES(menu_type), sort_num = VALUES(sort_num), status = '0'`,
      menu,
    );
  }

  await conn.end();
  console.log("Database initialized. admin/admin123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
