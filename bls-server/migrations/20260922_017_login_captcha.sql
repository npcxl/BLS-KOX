-- ============================================================
-- 登录人机验证（Provider 抽象 + 统一 captchaTicket）
--
-- 新架构：Koa 作为唯一业务入口，统一 /api/captcha/generate | /api/captcha/verify；
--   * 第一层 ALTCHA（静默 Proof-of-Work，本地）
--   * 第二层 TIANAI（独立 Java 微服务，Docker 内网 http://tianai-captcha:8083，浏览器不可直连）
--   两层通过后均由 Koa 签发一次性 captchaTicket（Redis captcha:ticket:{ticket}，GETDEL 消费）。
--
-- 本次变更：
--   * 新增 8 个参数（替代原 sys.login.captcha.* 系列）：
--       login_captcha_enabled / captcha_primary_provider / captcha_fallback_provider /
--       captcha_ticket_ttl / captcha_tianai_enabled / captcha_challenge_ttl /
--       captcha_force_after_failures / captcha_secondary_type
--   * 软删除已被取代的旧键（sys.login.captcha.*）
--
-- 说明：全部语句可重复执行（INSERT IGNORE / 带条件 UPDATE），无需 DDL。
-- ============================================================

INSERT IGNORE INTO `sys_config`
  (`config_id`, `tenant_id`, `config_key`, `config_value`, `config_name`, `config_type`, `status`, `remark`, `deleted`, `create_time`, `update_time`)
VALUES
('000406','000000','login_captcha_enabled','true','登录人机验证开关','sys','0','是否开启登录人机验证（总开关）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000407','000000','captcha_primary_provider','ALTCHA','第一层验证提供方','sys','0','第一层（静默）ALTCHA Proof-of-Work',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000408','000000','captcha_fallback_provider','TIANAI','第二层验证提供方','sys','0','风控命中时的第二层：TIANAI 图形验证',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000409','000000','captcha_ticket_ttl','120','验证凭证有效期(秒)','sys','0','captchaTicket 有效期 30-600，默认 120',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000410','000000','captcha_tianai_enabled','true','是否启用 TIANAI','sys','0','未部署 TIANAI Java 服务时置 false（风控不再升级）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000411','000000','captcha_challenge_ttl','180','验证挑战有效期(秒)','sys','0','challenge / 二级会话有效期 30-900',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000412','000000','captcha_force_after_failures','3','连续失败要求第二层次数','sys','0','同账号连续登录失败达到该值后要求第二层 1-100',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000413','000000','captcha_secondary_type','blockPuzzle','第二层验证类型','sys','0','blockPuzzle=滑块拼图；clickWord=点选文字',0,'2026-09-21 00:00:00','2026-09-21 00:00:00');

-- 旧键软删除（不再被 Dynamic Config 读取）
UPDATE `sys_config`
   SET `deleted` = 1, `update_time` = NOW()
 WHERE `deleted` = 0
   AND `config_key` LIKE 'sys.login.captcha.%';
