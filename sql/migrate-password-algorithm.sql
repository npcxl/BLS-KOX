-- 密码算法升级迁移脚本
-- 为 sys_user 表添加 password_algorithm 字段
-- 现有用户的密码保持 MD5 不变，标记为 'md5'

ALTER TABLE `sys_user`
  ADD COLUMN `password_algorithm` varchar(20) NOT NULL DEFAULT 'md5' COMMENT '密码算法：md5 | argon2id'
  AFTER `password`;

-- 将已有用户的密码算法设置为 md5（兼容旧数据）
UPDATE `sys_user` SET `password_algorithm` = 'md5' WHERE `password_algorithm` IS NULL OR `password_algorithm` = '';
