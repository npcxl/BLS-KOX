-- ============================================================
-- 登录人机验证：统一扁平配置键 + 第二层默认关闭（fail closed）
--
-- 背景（20260922_017 之后暴露的问题）：
--   * `captcha_tianai_enabled` 初始 seed 为 true，但多数部署并没有真正部署 Tianai Java 服务
--     （TIANAI_BASE_URL 为空）。旧实现把「未配置地址」也当成「不需要第二层」，
--     于是高风险账号被**静默降级**为「只做第一层 ALTCHA」并照常拿到 captchaTicket —— 安全漏洞。
--   * 修复后：`captcha_tianai_enabled=true` 表示「运维要求第二层」，
--     服务不可用（地址缺失 / 健康检查失败 / 上游超时）一律 fail closed（HTTP 503 / 50302）。
--     因此默认必须是 false，部署 Tianai 并配置 TIANAI_BASE_URL 后再显式开启。
--
-- 本次变更：
--   1. 补齐 8 个正式扁平键（幂等 INSERT IGNORE，兼容 017 之前的历史库）；
--   2. 把 captcha_tianai_enabled 的默认值纠正为 false（已有部署需重新显式开启）；
--   3. 幂等软删除历史旧键 sys.login.captcha.*（enabled / mode / provider / tokenTtlSeconds …）。
--
-- 全部语句可重复执行，无 DDL。
-- ============================================================

INSERT IGNORE INTO `sys_config`
  (`config_id`, `tenant_id`, `config_key`, `config_value`, `config_name`, `config_type`, `status`, `remark`, `deleted`, `create_time`, `update_time`)
VALUES
('000406','000000','login_captcha_enabled','true','登录人机验证开关','sys','0','是否开启登录人机验证（总开关；关闭后第一层也不再校验）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000407','000000','captcha_primary_provider','ALTCHA','第一层验证提供方','sys','0','第一层（静默）ALTCHA Proof-of-Work；取值 ALTCHA/TIANAI',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000408','000000','captcha_fallback_provider','TIANAI','第二层验证提供方','sys','0','风控命中时的第二层：TIANAI 图形验证（Koa 内网代理，浏览器不直连）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000409','000000','captcha_ticket_ttl','120','登录凭证有效期(秒)','sys','0','一次性 captchaTicket 有效期 30-600，默认 120',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000410','000000','captcha_tianai_enabled','false','是否启用第二层 Tianai','sys','0','默认 false：部署 Tianai 并配置 TIANAI_BASE_URL 后显式开启；开启后风控要求第二层时不可用即 fail closed',0,'2026-09-21 00:00:00','2026-09-22 00:00:00'),
('000411','000000','captcha_challenge_ttl','180','验证挑战有效期(秒)','sys','0','ALTCHA challenge / 第二层会话有效期 30-900',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000412','000000','captcha_force_after_failures','3','连续失败要求第二层次数','sys','0','同账号连续登录失败达到该值后要求第二层 1-100',0,'2026-09-21 00:00:00','2026-09-21 00:00:00'),
('000413','000000','captcha_secondary_type','blockPuzzle','第二层验证类型','sys','0','blockPuzzle=滑块拼图（官方 SLIDER）；clickWord=点选文字（官方 WORD_IMAGE_CLICK）',0,'2026-09-21 00:00:00','2026-09-21 00:00:00');

-- 已有部署（017 已插入 true）：纠正为默认关闭，避免「没部署 Tianai 却以为自己开了第二层」。
UPDATE `sys_config`
   SET `config_value` = 'false',
       `remark` = '默认 false：部署 Tianai 并配置 TIANAI_BASE_URL 后显式开启；开启后风控要求第二层时不可用即 fail closed',
       `update_time` = NOW()
 WHERE `deleted` = 0
   AND `config_key` = 'captcha_tianai_enabled'
   AND `config_value` = 'true';

-- 历史旧键：不再被 Dynamic Config 读取，软删除（幂等）。
UPDATE `sys_config`
   SET `deleted` = 1, `update_time` = NOW()
 WHERE `deleted` = 0
   AND `config_key` LIKE 'sys.login.captcha.%';
