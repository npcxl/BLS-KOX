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
    enabled: (process.env.REDIS_ENABLED ?? 'true') === 'true',
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'bls:',
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
};
