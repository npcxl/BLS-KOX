import dotenv from 'dotenv';

dotenv.config();

function numberEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

/** 生产环境强校验 AI API Key */
const aiApiKey = requiredEnv('OPENAI_API_KEY', '');
if (isProduction && aiApiKey.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
  throw new Error('OPENAI_API_KEY must not be a CHANGE_TO_* placeholder');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,

  host: process.env.APP_HOST ?? '0.0.0.0',
  port: numberEnv('APP_PORT', 7201),
  appName: process.env.APP_NAME ?? 'bls-ai-service',
  blsServerUrl: process.env.BLS_SERVER_URL ?? 'http://bls-server:7001',

  jwt: {
    secret: jwtSecret,
  },

  ai: {
    provider: (process.env.AI_PROVIDER ?? 'openai').toLowerCase(),
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
    apiKey: aiApiKey,
    baseUrl: process.env.AI_BASE_URL ?? '',
    timeoutMs: numberEnv('AI_TIMEOUT_MS', 60000),
    temperature: numberEnv('AI_TEMPERATURE', 0.3),
    modelOptions: (process.env.AI_MODEL_OPTIONS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  },

  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: numberEnv('REDIS_PORT', 6379),
    username: process.env.REDIS_USERNAME ?? '',
    password: process.env.REDIS_PASSWORD ?? '',
    enabled: (process.env.REDIS_ENABLED ?? 'true') === 'true',
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'bls-ai:',
  },

  rateLimit: {
    aiPerMinute: numberEnv('AI_RATE_LIMIT_PER_MINUTE', 10),
    sqlPerMinute: numberEnv('AI_SQL_RATE_LIMIT_PER_MINUTE', 5),
  },

  internalSecret: requiredEnv('INTERNAL_SECRET', 'dev-internal-secret'),

  sqlGuard: {
    enabled: (process.env.SQL_GUARD_ENABLED ?? 'true') === 'true',
  },
};
