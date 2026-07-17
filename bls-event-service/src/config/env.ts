import dotenv from 'dotenv';

dotenv.config();

const isProduction = (process.env.NODE_ENV ?? '') === 'production';
const PLACEHOLDER_PREFIX = 'CHANGE_TO_';

function numberEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (isProduction && value.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(`${name} must not be a CHANGE_TO_* placeholder in production`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  appName: process.env.APP_NAME ?? 'bls-event-service',
  host: process.env.APP_HOST ?? '0.0.0.0',
  port: numberEnv('APP_PORT', 7101),
  internalSecret: requiredEnv('INTERNAL_SECRET'),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: numberEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: requiredEnv('DB_PASSWORD'),
    database: process.env.DB_NAME ?? 'bls',
    connectionLimit: numberEnv('DB_CONNECTION_LIMIT', 5),
  },
};
