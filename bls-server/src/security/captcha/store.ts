/**
 * 人机验证存储层（Redis）
 *
 * 全部数据都带 TTL，不创建永久数据；Redis 不可用时 fail closed（抛 CaptchaUnavailableError），
 * 绝不放行。captchaToken 只以 sha256 形式落库，一次性消费使用原子 `SET NX EX` + `GETDEL`。
 *
 * Key 命名空间（详见 bls-memory/00-common/01-redis.md）：
 *   captcha:challenge:{nonce}         标记    ALTCHA challenge 一次性标记（官方要求 challenge 单次使用）
 *   captcha:token:{sha256(token)}     JSON    captchaToken 绑定记录（只存 hash）
 *   captcha:token-used:{sha256(token)}标记    已消费标记（区分 REPLAYED / EXPIRED）
 *   captcha:fail:account:{scope}:{u}  计数器  账号维度登录失败次数
 *   captcha:fail:ip:{ipHash}          计数器  IP 维度登录失败次数
 *   captcha:ip-accounts:{ipHash}      集合    IP 近期尝试过的账号
 */
import { CaptchaUnavailableError } from '../../core/errors';
import { getRedisClient } from '../../shared/utils/redis';
import { logger } from '../../core/logger';
import type { CaptchaSecondarySessionRecord } from './types';

export interface CaptchaRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  scard(key: string): Promise<number>;
  srem?(key: string, ...members: string[]): Promise<number>;
  getdel?(key: string): Promise<string | null>;
  ping?(): Promise<string>;
}

export type RedisFactory = () => CaptchaRedisLike | null;

export const CAPTCHA_KEY = {
  challenge: (nonce: string) => `captcha:challenge:${nonce}`,
  /** 第二层（Tianai）本地一次性会话 */
  secondarySession: (sessionId: string) => `captcha:secondary:${sessionId}`,
  failAccount: (scope: string, usernameHash: string) => `captcha:fail:account:${scope}:${usernameHash}`,
  failIp: (ipHash: string) => `captcha:fail:ip:${ipHash}`,
  ipAccounts: (ipHash: string) => `captcha:ip-accounts:${ipHash}`,
} as const;

export type TokenConsumeStatus = 'ok' | 'replayed' | 'expired';

export class CaptchaStore {
  constructor(private redisFn: RedisFactory = () => getRedisClient() as unknown as CaptchaRedisLike | null) {}

  /** 拿不到客户端（Redis 未启用）→ 直接 fail closed */
  private client(): CaptchaRedisLike {
    let client: CaptchaRedisLike | null = null;
    try {
      client = this.redisFn();
    } catch (err) {
      logger.error('[captcha] redis factory failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }
    if (!client) throw new CaptchaUnavailableError();
    return client;
  }

  /** 统一把底层 Redis 异常转换为 503（fail closed） */
  private async run<T>(op: string, fn: (client: CaptchaRedisLike) => Promise<T>): Promise<T> {
    try {
      return await fn(this.client());
    } catch (err) {
      if (err instanceof CaptchaUnavailableError) throw err;
      logger.error('[captcha] redis operation failed', { op, error: String(err) });
      throw new CaptchaUnavailableError();
    }
  }

  /** Redis 健康检查（不抛错，仅返回布尔） */
  async healthy(): Promise<boolean> {
    try {
      const client = this.client();
      if (typeof client.ping === 'function') await client.ping();
      else await client.exists('captcha:health');
      return true;
    } catch {
      return false;
    }
  }

  // ==================== ALTCHA challenge（一次性） ====================

  /**
   * 注册 challenge nonce（官方要求：challenge 必须一次性）。
   * 返回 false 表示 nonce 已存在（重放 / 碰撞）。
   */
  async claimChallengeNonce(nonce: string, ttlSeconds: number): Promise<boolean> {
    return this.run('claimChallengeNonce', async (c) => {
      const res = await c.set(CAPTCHA_KEY.challenge(nonce), '1', 'EX', ttlSeconds, 'NX');
      return res !== null && res !== undefined && res !== false;
    });
  }

  /**
   * 消费 challenge nonce：原子取出并删除。
   * false = 该 challenge 从未签发 / 已过期 / 已被使用过（重放）。
   */
  async consumeChallengeNonce(nonce: string): Promise<boolean> {
    return this.run('consumeChallengeNonce', async (c) => {
      const raw = await this.takeAndDelete(c, CAPTCHA_KEY.challenge(nonce));
      return raw !== null;
    });
  }

  // ==================== 第二层（Tianai）本地会话 ====================

  /** 保存第二层会话（绑定租户 / 域名 / 账号 / IP / UA，TTL 与 Tianai challenge 同步） */
  async saveSecondarySession(record: CaptchaSecondarySessionRecord, ttlSeconds: number): Promise<void> {
    await this.run('saveSecondarySession', (c) =>
      c.set(CAPTCHA_KEY.secondarySession(record.sessionId), JSON.stringify(record), 'EX', ttlSeconds));
  }

  /**
   * 一次性消费第二层会话：原子取出并删除。
   * 返回 null = 会话不存在 / 已过期 / 已被使用（重放）。
   */
  async consumeSecondarySession(sessionId: string): Promise<CaptchaSecondarySessionRecord | null> {
    return this.run('consumeSecondarySession', async (c) => {
      const raw = await this.takeAndDelete(c, CAPTCHA_KEY.secondarySession(sessionId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as CaptchaSecondarySessionRecord;
      } catch {
        logger.warn('[captcha] secondary session corrupted');
        return null;
      }
    });
  }

  // ==================== 内部工具 ====================
  // 注：captchaToken 已由 CaptchaTicketService（captcha:ticket:*）取代，
  //     这里不再保留旧实现，避免两套一次性凭证逻辑并存。

  private async takeAndDelete(c: CaptchaRedisLike, key: string): Promise<string | null> {
    if (typeof c.getdel === 'function') return c.getdel(key);
    const multi = (c as any).multi?.bind(c);
    if (typeof multi === 'function') {
      try {
        const res = await multi().get(key).del(key).exec();
        return (res?.[0]?.[1] ?? null) as string | null;
      } catch {
        /* fall through */
      }
    }
    const value = await c.get(key);
    if (value !== null) await c.del(key);
    return value;
  }

  // ==================== 失败计数 / 风险信号 ====================

  async recordAccountFailure(scope: string, usernameHash: string, ttlSeconds: number): Promise<void> {
    await this.run('recordAccountFailure', async (c) => {
      const key = CAPTCHA_KEY.failAccount(scope, usernameHash);
      const n = await c.incr(key);
      if (n === 1) await c.expire(key, ttlSeconds);
    });
  }

  async getAccountFailures(scope: string, usernameHash: string): Promise<number> {
    return this.run('getAccountFailures', async (c) => {
      const raw = await c.get(CAPTCHA_KEY.failAccount(scope, usernameHash));
      return raw ? Number(raw) || 0 : 0;
    });
  }

  /** 登录成功后清零「连续失败」计数 */
  async resetAccountFailures(scope: string, usernameHash: string): Promise<void> {
    await this.run('resetAccountFailures', (c) => c.del(CAPTCHA_KEY.failAccount(scope, usernameHash)));
  }

  /**
   * 记录「该 IP 近期尝试过的账号」。
   * **必须传真实 usernameHash** —— 空字符串会把所有匿名 / 未带用户名的请求合并成同一个成员，
   * 让 IP 多账号统计失真（既可能误判风控，也可能掩盖真实的撞库行为）。
   */
  async recordIpAccount(ipHash: string, usernameHash: string, ttlSeconds: number): Promise<void> {
    if (!usernameHash) return;
    await this.run('recordIpAccount', async (c) => {
      const key = CAPTCHA_KEY.ipAccounts(ipHash);
      await c.sadd(key, usernameHash);
      await c.expire(key, ttlSeconds);
    });
  }

  async getIpAccountCount(ipHash: string): Promise<number> {
    return this.run('getIpAccountCount', (c) => c.scard(CAPTCHA_KEY.ipAccounts(ipHash)));
  }

  /**
   * 读取现有 Rate Limit 计数（RateLimitService 使用 `rate:ip:{ip}:/api/auth/login`），
   * 作为策略输入之一。
   */
  async getRateLimitPressure(ip: string): Promise<number> {
    return this.run('getRateLimitPressure', async (c) => {
      const raw = await c.get(`rate:ip:${ip}:/api/auth/login`);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    });
  }

  async getIpFailures(ipHash: string): Promise<number> {
    return this.run('getIpFailures', async (c) => {
      const raw = await c.get(CAPTCHA_KEY.failIp(ipHash));
      return raw ? Number(raw) || 0 : 0;
    });
  }

  async recordIpFailure(ipHash: string, ttlSeconds: number): Promise<void> {
    await this.run('recordIpFailure', async (c) => {
      const key = CAPTCHA_KEY.failIp(ipHash);
      const n = await c.incr(key);
      if (n === 1) await c.expire(key, ttlSeconds);
    });
  }
}

export const captchaStore = new CaptchaStore();
