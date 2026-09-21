-- ============================================================
-- 认证安全闭环：登录人机验证（ALTCHA）
--
-- 在 sys_config 中增加 6 个默认参数（平台租户 000000）：
--   sys.login.captcha.enabled              是否开启登录人机验证        bool   默认 true
--   sys.login.captcha.mode                 off / adaptive / always     enum   默认 adaptive
--   sys.login.captcha.provider             altcha / tianai             enum   默认 altcha
--   sys.login.captcha.challengeTtlSeconds  ALTCHA challenge 有效期(秒) number 默认 180 (30-900)
--   sys.login.captcha.tokenTtlSeconds      captchaToken 有效期(秒)     number 默认 120 (30-600)
--   sys.login.captcha.forceAfterFailures   连续失败要求可见验证次数    number 默认 3   (1-100)
--
-- 本文件内容必须与 sql/Init.sql 中对应的 6 行保持逐字一致：
--   * sql/Init.sql                 —— 全新环境执行即完成初始化；
--   * bls-server/migrations/*.sql  —— 已部署库增量升级（npm run db:migrate up）。
--
-- 说明：
--   * 全部语句可重复执行（INSERT IGNORE + 唯一键 uk_config_tenant_key）。
--   * 无需 DDL 变更。
--   * 旧版本曾写入的 sys.login.captcha.silentThreshold / secondaryTypes / maxAttempts
--     行已不再使用（Dynamic Config 会忽略未知键），如需清理可手工 DELETE。
--   * 未配置这些行的租户使用代码内置默认值；需要按租户调整时在系统参数页面新增对应 tenant_id 的行。
-- ============================================================

INSERT IGNORE INTO `sys_config`
  (`config_id`, `tenant_id`, `config_key`, `config_value`, `config_name`, `config_type`, `status`, `remark`, `deleted`, `create_time`, `update_time`)
VALUES
('000406','000000','sys.login.captcha.enabled','true','登录人机验证开关','sys','0','是否开启登录人机验证（ALTCHA）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000407','000000','sys.login.captcha.mode','adaptive','登录人机验证模式','sys','0','off/adaptive/always；adaptive=静默优先',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000408','000000','sys.login.captcha.provider','altcha','人机验证提供方','sys','0','altcha=自托管 ALTCHA(默认)；tianai=独立验证码服务',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000409','000000','sys.login.captcha.challengeTtlSeconds','180','验证挑战有效期(秒)','sys','0','ALTCHA challenge 有效期 30-900',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000410','000000','sys.login.captcha.tokenTtlSeconds','120','登录验证凭证有效期(秒)','sys','0','一次性 captchaToken 有效期 30-600',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000411','000000','sys.login.captcha.forceAfterFailures','3','连续失败要求可见验证次数','sys','0','同账号近期连续登录失败达到该值后不再完全静默 1-100',0,'2026-09-21 00:00:00','2026-09-21 00:00:00');

-- ============ 修订（ALTCHA 化后的存量数据修正，可重复执行）============
-- 1) 早期版本写入的 provider='builtin' 已不在枚举内（现为 altcha / tianai），
--    会导致每次配置解析都告警并回退默认值，这里统一纠正为 altcha。
UPDATE `sys_config`
   SET `config_value` = 'altcha', `update_time` = NOW()
 WHERE `config_key` = 'sys.login.captcha.provider'
   AND `config_value` NOT IN ('altcha', 'tianai');

-- 2) 早期版本写入的 3 个参数已废弃（Dynamic Config 不再读取），软删除，
--    避免残留在系统参数页面造成误导；如需保留历史值请注释掉本段。
UPDATE `sys_config`
   SET `deleted` = 1, `update_time` = NOW()
 WHERE `deleted` = 0
   AND `config_key` IN (
     'sys.login.captcha.silentThreshold',
     'sys.login.captcha.secondaryTypes',
     'sys.login.captcha.maxAttempts'
   );
