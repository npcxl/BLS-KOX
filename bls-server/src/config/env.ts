import dotenv from 'dotenv';

dotenv.config();

function numberEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appName: process.env.APP_NAME ?? 'bls-server',
  host: process.env.APP_HOST ?? '0.0.0.0',
  port: numberEnv('APP_PORT', numberEnv('PORT', 7001)),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'please_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: numberEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD ?? '',
    enabled: (process.env.REDIS_ENABLED ?? 'true') === 'true',
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'bls:',
  },
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: numberEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? process.env.DB_DATABASE ?? 'bls',
    connectionLimit: numberEnv('DB_CONNECTION_LIMIT', 10),
  },
};
