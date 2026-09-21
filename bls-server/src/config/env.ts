import dotenv from 'dotenv';

dotenv.config();

function numberEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 生产环境必须配置的变量，缺失则启动失败 */
function requiredEnv(name: string, defaultValue?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return defaultValue ?? '';
  }
  return value;
}

const isProduction = (process.env.NODE_ENV ?? '') === 'production';
const PLACEHOLDER_PREFIX = 'CHANGE_TO_';

/** 生产环境强校验 JWT_SECRET */
const jwtSecret = requiredEnv('JWT_SECRET', 'please_change_me_dev_only');
if (isProduction) {
  if (jwtSecret === 'please_change_me_dev_only') throw new Error('Production must set a strong JWT_SECRET');
  if (jwtSecret.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) throw new Error('JWT_SECRET must not be a CHANGE_TO_* placeholder');
}

/** 生产环境强校验 DB_PASSWORD */
const dbPassword = requiredEnv('DB_PASSWORD', '');
if (isProduction) {
  if (!dbPassword) throw new Error('Production must set DB_PASSWORD');
  if (dbPassword.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) throw new Error('DB_PASSWORD must not be a CHANGE_TO_* placeholder');
}

/** 生产环境强校验 CORS 白名单 */
const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (isProduction && corsOrigins.length === 0) throw new Error('Production must configure CORS_ORIGINS');
if (isProduction && corsOrigins.includes('*')) throw new Error('Wildcard CORS origin is not allowed in production');

/** API_SIGN_SECRET：生产环境 + Replay 启用时必填 */
const replayEnabled = (process.env.REPLAY_ENABLED ?? 'true') === 'true';
const apiSignSecret = process.env.API_SIGN_SECRET?.trim() ?? '';
if (isProduction && replayEnabled && !apiSignSecret) throw new Error('API_SIGN_SECRET is required when replay protection is enabled in production');
if (isProduction && replayEnabled && apiSignSecret.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) throw new Error('API_SIGN_SECRET must not be a CHANGE_TO_* placeholder');

/**
 * 登录人机验证（ALTCHA）密钥与运行参数。
 * - 生产环境：ALTCHA_HMAC_KEY 缺失 / 过短 / CHANGE_TO_* 占位符 → 启动失败（fail closed）。
 * - CAPTCHA_DEV_BYPASS 只允许在非生产环境使用，生产环境出现该值直接阻止启动。
 * - ALTCHA_COST 为 Proof-of-Work 难度（PBKDF2 迭代次数），仅服务端使用，不下发前端。
 * - TIANAI_BASE_URL 仅在 sys.login.captcha.provider=tianai 时需要（独立验证码服务）。
 */
const altchaHmacKey = process.env.ALTCHA_HMAC_KEY?.trim() ?? '';
const captchaDevBypass = (process.env.CAPTCHA_DEV_BYPASS ?? 'false') === 'true';
const CAPTCHA_DEV_SECRET = 'dev_altcha_hmac_key_not_for_production_use';
if (isProduction) {
  if (captchaDevBypass) throw new Error('CAPTCHA_DEV_BYPASS must not be enabled in production');
  if (!altchaHmacKey) throw new Error('ALTCHA_HMAC_KEY is required in production');
  if (altchaHmacKey.length < 32) throw new Error('ALTCHA_HMAC_KEY must be at least 32 characters');
  if (altchaHmacKey.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) throw new Error('ALTCHA_HMAC_KEY must not be a CHANGE_TO_* placeholder');
}

/**
 * 阶段七：生产环境必须启用 Redis。
 * Session 中心、nonce 防重放、限流、幂等键、租户 provisioning 全部依赖 Redis；
 * 关闭 Redis 会让这些保护静默失效，因此在生产环境直接阻止启动。
 */
const redisEnabled = (process.env.REDIS_ENABLED ?? 'true') === 'true';
if (isProduction && !redisEnabled) {
  throw new Error('REDIS_ENABLED must be true in production (sessions, nonce, rate limiting and idempotency all require Redis)');
}

/**
 * 阶段七：/api/metrics、/api/docs、/api/openapi.json 的生产开关。
 * 生产环境默认**关闭**，需要显式打开（或改由反向代理 + 鉴权保护）。
 */
const metricsPublic = (process.env.METRICS_PUBLIC ?? (isProduction ? 'false' : 'true')) === 'true';
const apiDocsEnabled = (process.env.API_DOCS_ENABLED ?? (isProduction ? 'false' : 'true')) === 'true';

/** 阶段五：敏感数据信封加密主密钥（生产必须显式配置，且不得写入数据库/日志） */
const secretEncryptionKey = process.env.SECRET_ENCRYPTION_KEY?.trim() ?? '';
if (isProduction) {
  if (!secretEncryptionKey) throw new Error('SECRET_ENCRYPTION_KEY is required in production');
  if (secretEncryptionKey.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error('SECRET_ENCRYPTION_KEY must not be a CHANGE_TO_* placeholder');
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  trustProxy: (process.env.TRUST_PROXY ?? 'false') === 'true',
  appName: process.env.APP_NAME ?? 'bls-server',
  host: process.env.APP_HOST ?? '0.0.0.0',
  port: numberEnv('APP_PORT', numberEnv('PORT', 6001)),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  corsOrigins,
  eventService: {
    url: (process.env.EVENT_SERVICE_URL ?? '').replace(/\/+$/, ''),
    enabled: !!(process.env.EVENT_SERVICE_URL ?? ''),
  },
  internalSecret: process.env.INTERNAL_SECRET ?? '',
  ws: {
    enabled: (process.env.WS_ENABLED ?? 'true') === 'true',
    path: process.env.WS_PATH ?? '/ws/realtime',
    host: process.env.WS_HOST ?? '',
    port: numberEnv('WS_PORT', numberEnv('APP_PORT', numberEnv('PORT', 6001))),
    url: process.env.WS_URL ?? '',
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: numberEnv('REDIS_PORT', 6379),
    username: process.env.REDIS_USERNAME ?? '',
    password: process.env.REDIS_PASSWORD ?? '',
    enabled: redisEnabled,
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'bls:',
  },
  security: {
    /** /api/metrics 是否匿名可访问 */
    metricsPublic,
    /** /api/docs 与 /api/openapi.json 是否对外开放 */
    apiDocsEnabled,
  },
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: numberEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: dbPassword,
    database: process.env.DB_NAME ?? process.env.DB_DATABASE ?? 'bls',
    connectionLimit: numberEnv('DB_CONNECTION_LIMIT', 10),
  },
  replay: {
    enabled: replayEnabled,
    signSecret: apiSignSecret,
    windowSeconds: numberEnv('REPLAY_WINDOW_SECONDS', 120),
    nonceTtlSeconds: numberEnv('REPLAY_NONCE_TTL_SECONDS', 180),
    defaultMode: (process.env.REPLAY_DEFAULT_MODE ?? 'nonce') as 'off' | 'timestamp' | 'nonce' | 'signature',
    protectedMethods: (process.env.REPLAY_PROTECTED_METHODS ?? 'POST,PUT,PATCH,DELETE').split(',').map((s) => s.trim().toUpperCase()),
  },
  captcha: {
    /** ALTCHA HMAC 密钥：生产环境必须显式配置；开发环境使用固定兜底值以便本地联调 */
    hmacKey: altchaHmacKey || CAPTCHA_DEV_SECRET,
    configured: !!altchaHmacKey,
    /** 仅开发环境允许：跳过人机验证（生产环境会阻止启动） */
    devBypass: captchaDevBypass && !isProduction,
    devSecret: CAPTCHA_DEV_SECRET,
    /** Proof-of-Work 难度（PBKDF2 迭代次数），默认 5 万 */
    cost: numberEnv('ALTCHA_COST', 50_000),
    /** provider=tianai 时使用的独立验证码服务地址 */
    tianaiUrl: process.env.TIANAI_BASE_URL?.trim() ?? '',
    /**
     * 第二层（Tianai）上游路径。不同部署/版本的接口路径可能不同，
     * 允许用环境变量覆盖，避免为了换个路径改代码。
     * 默认值与 bls-captcha-service 的桥接接口一致（见 CaptchaBridgeController）：
     *   TIANAI_GENERATE_PATH （默认 /captcha/generate，取图形验证 challenge）
     *   TIANAI_VERIFY_PATH   （默认 /captcha/verify，  校验答案）
     *   TIANAI_HEALTH_PATH   （默认 /health，          可用性预检）
     */
    tianaiPaths: {
      generate: process.env.TIANAI_GENERATE_PATH?.trim() || '/captcha/generate',
      verify: process.env.TIANAI_VERIFY_PATH?.trim() || '/captcha/verify',
      health: process.env.TIANAI_HEALTH_PATH?.trim() || '/health',
    },
  },
};
