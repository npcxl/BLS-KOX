/**
 * 人机验证存储层（Redis）
 *
 * 全部数据都带 TTL，不创建永久数据；Redis 不可用时 fail closed（抛 CaptchaUnavailableError），
 * 绝不放行。一次性消费使用原子 `SET NX EX` + `GETDEL`（无 GETDEL 时回退 MULTI/EXEC）。
 *
 * Key 命名空间（详见 bls-memory/00-common/01-redis.md）：
 *   captcha:challenge:{challengeId}   JSON    challenge 记录（含答案）
 *   captcha:challenge-attempts:{id}   计数器  challenge 已尝试次数
 *   captcha:nonce:{nonce}             标记    nonce 是否已被使用（防重放）
 *   captcha:token:{sha256(token)}     JSON    captchaToken 记录（只存 hash）
 *   captcha:token-used:{sha256(token)}标记    已消费标记（区分 REPLAYED / EXPIRED）
 *   captcha:image:{imageId}           SVG     验证码图片（no-store 接口读取）
 *   captcha:fail:account:{scope}:{u}  计数器  账号维度登录失败次数
 *   captcha:fail:ip:{ipHash}          计数器  IP 维度登录失败次数
 *   captcha:ip-accounts:{ipHash}      集合    IP 近期尝试过的账号
 */
import { CaptchaUnavailableError } from '../../core/errors';
import { getRedisClient } from '../../shared/utils/redis';
import { logger } from '../../core/logger';
import type { CaptchaTokenRecord, ChallengeRecord } from './types';

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
  challenge: (id: string) => `captcha:challenge:${id}`,
  attempts: (id: string) => `captcha:challenge-attempts:${id}`,
  nonce: (nonce: string) => `captcha:nonce:${nonce}`,
  token: (hash: string) => `captcha:token:${hash}`,
  tokenUsed: (hash: string) => `captcha:token-used:${hash}`,
  image: (id: string) => `captcha:image:${id}`,
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
      if (typeof client.ping === 'function') {
        await client.ping();
      } else {
        await client.exists('captcha:health');
      }
      return true;
    } catch {
      return false;
    }
  }

  // ==================== challenge ====================

  async saveChallenge(record: ChallengeRecord, ttlSeconds: number): Promise<void> {
    await this.run('saveChallenge', (c) => c.set(CAPTCHA_KEY.challenge(record.challengeId), JSON.stringify(record), 'EX', ttlSeconds));
  }

  async getChallenge(challengeId: string): Promise<ChallengeRecord | null> {
    return this.run('getChallenge', async (c) => {
      const raw = await c.get(CAPTCHA_KEY.challenge(challengeId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as ChallengeRecord;
      } catch {
        logger.warn('[captcha] challenge record corrupted', { challengeId });
        return null;
      }
    });
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    await this.run('deleteChallenge', (c) => c.del(CAPTCHA_KEY.challenge(challengeId), CAPTCHA_KEY.attempts(challengeId)));
  }

  /** 原子递增尝试次数（INCR 本身原子），返回递增后的值 */
  async bumpAttempts(challengeId: string, ttlSeconds: number): Promise<number> {
    return this.run('bumpAttempts', async (c) => {
      const key = CAPTCHA_KEY.attempts(challengeId);
      const n = await c.incr(key);
      if (n === 1) await c.expire(key, ttlSeconds);
      return n;
    });
  }

  async getAttempts(challengeId: string): Promise<number> {
    return this.run('getAttempts', async (c) => {
      const raw = await c.get(CAPTCHA_KEY.attempts(challengeId));
      return raw ? Number(raw) || 0 : 0;
    });
  }

  // ==================== nonce（防重放） ====================

  /** 原子占用 nonce；返回 true 表示本次占用成功（首次出现） */
  async claimNonce(nonce: string, ttlSeconds: number): Promise<boolean> {
    return this.run('claimNonce', async (c) => {
      const res = await c.set(CAPTCHA_KEY.nonce(nonce), '1', 'EX', ttlSeconds, 'NX');
      return res !== null && res !== undefined && res !== false;
    });
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    return this.run('isNonceUsed', async (c) => (await c.exists(CAPTCHA_KEY.nonce(nonce))) > 0);
  }

  // ==================== captchaToken ====================

  async saveToken(tokenHash: string, record: CaptchaTokenRecord, ttlSeconds: number): Promise<void> {
    await this.run('saveToken', (c) => c.set(CAPTCHA_KEY.token(tokenHash), JSON.stringify(record), 'EX', ttlSeconds));
  }

  /**
   * 一次性消费 captchaToken。
   *  - 原子 SET NX EX 抢占「已消费」标记 → 并发请求只有一个能成功
   *  - 抢占成功后再 GETDEL 取出记录：取不到 = 已过期
   *  - 抢占失败 = 已被消费（重放）
   */
  async consumeToken(tokenHash: string, markerTtlSeconds: number): Promise<{ status: TokenConsumeStatus; record: CaptchaTokenRecord | null }> {
    return this.run('consumeToken', async (c) => {
      const claimed = await c.set(CAPTCHA_KEY.tokenUsed(tokenHash), '1', 'EX', markerTtlSeconds, 'NX');
      const isFirst = claimed !== null && claimed !== undefined && claimed !== false;
      if (!isFirst) return { status: 'replayed', record: null };

      const raw = await this.takeAndDelete(c, CAPTCHA_KEY.token(tokenHash));
      if (!raw) return { status: 'expired', record: null };
      try {
        return { status: 'ok', record: JSON.parse(raw) as CaptchaTokenRecord };
      } catch {
        logger.warn('[captcha] token record corrupted');
        return { status: 'expired', record: null };
      }
    });
  }

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

  // ==================== 图片（no-store 接口使用） ====================

  async saveImage(imageId: string, svg: string, ttlSeconds: number): Promise<void> {
    await this.run('saveImage', (c) => c.set(CAPTCHA_KEY.image(imageId), svg, 'EX', ttlSeconds));
  }

  async getImage(imageId: string): Promise<string | null> {
    return this.run('getImage', (c) => c.get(CAPTCHA_KEY.image(imageId)));
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

  async recordIpAccount(ipHash: string, usernameHash: string, ttlSeconds: number): Promise<void> {
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
   * 作为静默评分与强制策略的风险输入之一。
   */
  async getRateLimitPressure(ip: string): Promise<number> {
    return this.run('getRateLimitPressure', async (c) => {
      const raw = await c.get(`rate:ip:${ip}:/api/auth/login`);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    });
  }

  /** 读取当前登录 IP 的失败次数 */
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
