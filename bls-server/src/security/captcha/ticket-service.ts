/**
 * CaptchaTicketService —— 登录接口唯一依赖的"人机验证通过凭证"
 *
 * 设计目的：登录接口**不再直接依赖任何 provider 的验证结果**。
 * 无论第一层 ALTCHA 还是第二层 TIANAI 通过，都由 Koa 统一签发一次性 ticket：
 *
 *   ticket  = crypto.randomBytes(32).toString('base64url')
 *   hash    = sha256(ticket)
 *   redis   = captcha:ticket:{hash}            ← 明文 ticket **永不**出现在 Redis key / 日志 / 审计
 *   内容     = { scene, provider, verified, createdAt }   ← 规范要求的最小集
 *              + 绑定字段（tenantId / usernameHash / ipHash / uaHash，存在则校验）
 *   TTL     = sys_config captcha_ticket_ttl（默认 120 秒）
 *
 * 一次性消费：`GETDEL` 原子取出并删除 → 天然防重放；并发登录只有一个能拿到内容。
 * Redis 不可用 → fail closed（50301 CAPTCHA_SERVICE_UNAVAILABLE），绝不放行。
 * （与 `CaptchaStore` 使用同一个错误码，前端只需要处理一套验证码错误码。）
 */
import { randomBytes } from 'node:crypto';
import { CaptchaUnavailableError } from '../../core/errors';
import { logger } from '../../core/logger';
import { getRedisClient } from '../../shared/utils/redis';
import { captchaTicketHash } from './crypto-utils';
import type { CaptchaProviderName, CaptchaScene } from './providers/types';

/** Redis key 前缀（规范：captcha:ticket:{sha256(ticket)}） */
export const TICKET_KEY_PREFIX = 'captcha:ticket:';
/** 「已消费」标记（key = sha256(ticket)，仅用于区分重放与过期，不保存任何业务数据） */
export const USED_KEY_PREFIX = 'captcha:ticket-used:';

/** ticket 内容：规范要求的四个字段 + 可选绑定字段 */
export interface CaptchaTicketPayload {
  scene: CaptchaScene;
  provider: CaptchaProviderName;
  verified: boolean;
  createdAt: number;
  /** 以下为可选的绑定信息（本系统补齐，用于防止跨账号/跨环境复用） */
  tenantId?: string;
  usernameHash?: string;
  ipHash?: string;
  uaHash?: string;
}

export interface CaptchaTicketIssueInput {
  scene: CaptchaScene;
  provider: CaptchaProviderName;
  ttlSeconds: number;
  tenantId?: string;
  usernameHash?: string;
  ipHash?: string;
  uaHash?: string;
}

export interface CaptchaTicketConsumeInput {
  ticket: string;
  scene: CaptchaScene;
  tenantId?: string;
  usernameHash?: string;
  ipHash?: string;
  uaHash?: string;
  /** 「已消费」标记的 TTL（秒），用于区分「重放」与「过期/不存在」 */
  markerTtlSeconds?: number;
}

export type CaptchaTicketConsumeResult =
  | { ok: true; payload: CaptchaTicketPayload }
  | { ok: false; reason: 'MISSING' | 'NOT_FOUND' | 'REPLAYED' | 'NOT_VERIFIED' | 'SCENE_MISMATCH' | 'BINDING_MISMATCH' | 'MALFORMED' };

/** 仅取本模块需要的 Redis 命令子集（便于测试注入） */
export interface TicketRedisLike {
  set(key: string, value: string, ...args: any[]): Promise<any>;
  getdel?(key: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  multi?(): any;
}

export type TicketRedisFactory = () => TicketRedisLike | null;

export class CaptchaTicketService {
  constructor(
    private readonly redisFn: TicketRedisFactory = () => getRedisClient() as unknown as TicketRedisLike | null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private client(): TicketRedisLike {
    let client: TicketRedisLike | null = null;
    try {
      client = this.redisFn();
    } catch (err) {
      logger.error('[captcha] ticket redis factory failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }
    if (!client) throw new CaptchaUnavailableError();
    return client;
  }

  /** 生成并写入 ticket（返回给登录接口使用的一次性凭证） */
  async issue(input: CaptchaTicketIssueInput): Promise<{ captchaTicket: string; expiresAt: number }> {
    const ticket = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const payload: CaptchaTicketPayload = {
      scene: input.scene,
      provider: input.provider,
      verified: true,
      createdAt,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.usernameHash ? { usernameHash: input.usernameHash } : {}),
      ...(input.ipHash ? { ipHash: input.ipHash } : {}),
      ...(input.uaHash ? { uaHash: input.uaHash } : {}),
    };

    try {
      await this.client().set(
        `${TICKET_KEY_PREFIX}${captchaTicketHash(ticket)}`,
        JSON.stringify(payload),
        'EX',
        input.ttlSeconds,
      );
    } catch (err) {
      if (err instanceof CaptchaUnavailableError) throw err;
      logger.error('[captcha] ticket write failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }

    return { captchaTicket: ticket, expiresAt: createdAt + input.ttlSeconds * 1000 };
  }

  /**
   * 一次性消费 ticket（GETDEL 原子）。
   * 注意：**只要取出就作废**——即使后续校验失败也不回写，避免被重放试探。
   */
  async consume(input: CaptchaTicketConsumeInput): Promise<CaptchaTicketConsumeResult> {
    const ticket = (input.ticket ?? '').trim();
    if (!ticket) return { ok: false, reason: 'MISSING' };

    // 明文 ticket 只在这里被哈希一次，后续 Redis 操作 / 日志 / 审计全部只用 hash
    const ticketHash = captchaTicketHash(ticket);

    // 先抢占「已消费」标记（SET NX EX）：并发登录只有一个能继续，其余判定为重放
    const markerTtl = input.markerTtlSeconds ?? 600;
    try {
      const claimed = await this.client().set(`${USED_KEY_PREFIX}${ticketHash}`, '1', 'EX', markerTtl, 'NX');
      const isFirst = claimed !== null && claimed !== undefined && claimed !== false;
      if (!isFirst) return { ok: false, reason: 'REPLAYED' };
    } catch (err) {
      if (err instanceof CaptchaUnavailableError) throw err;
      logger.error('[captcha] ticket claim failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }

    let raw: string | null;
    try {
      raw = await this.takeAndDelete(`${TICKET_KEY_PREFIX}${ticketHash}`);
    } catch (err) {
      if (err instanceof CaptchaUnavailableError) throw err;
      logger.error('[captcha] ticket read failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }
    if (!raw) return { ok: false, reason: 'NOT_FOUND' };

    let payload: CaptchaTicketPayload;
    try {
      payload = JSON.parse(raw) as CaptchaTicketPayload;
    } catch {
      return { ok: false, reason: 'MALFORMED' };
    }

    if (payload.verified !== true) return { ok: false, reason: 'NOT_VERIFIED' };
    if (payload.scene !== input.scene) return { ok: false, reason: 'SCENE_MISMATCH' };

    // 绑定字段「存在则校验」：兼容只写最小集（scene/provider/verified/createdAt）的调用方
    const mismatch =
      (!!payload.tenantId && !!input.tenantId && payload.tenantId !== input.tenantId)
      || (!!payload.usernameHash && !!input.usernameHash && payload.usernameHash !== input.usernameHash)
      || (!!payload.ipHash && !!input.ipHash && payload.ipHash !== input.ipHash)
      || (!!payload.uaHash && !!input.uaHash && payload.uaHash !== input.uaHash);
    if (mismatch) return { ok: false, reason: 'BINDING_MISMATCH' };

    return { ok: true, payload };
  }

  private async takeAndDelete(key: string): Promise<string | null> {
    const client = this.client();
    if (typeof client.getdel === 'function') return client.getdel(key);
    const multi = typeof client.multi === 'function' ? client.multi() : null;
    if (multi) {
      try {
        const res = await multi.get(key).del(key).exec();
        return (res?.[0]?.[1] ?? null) as string | null;
      } catch { /* fall through */ }
    }
    const value = await client.get(key);
    if (value !== null) await client.del(key);
    return value;
  }
}

export const captchaTicketService = new CaptchaTicketService();
