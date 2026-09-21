/**
 * 内存版 Redis 替身（只实现 CaptchaStore 用到的命令子集）
 * 支持 TTL、SET ... EX ... NX、GETDEL、INCR、集合，用于验证一次性消费 / 过期 / 重放语义。
 */
import type { CaptchaRedisLike } from '../store';

export class FakeRedis implements CaptchaRedisLike {
  private data = new Map<string, string>();
  private expiry = new Map<string, number>();
  private sets = new Map<string, Set<string>>();

  constructor(private clock: () => number = () => Date.now()) {}

  /** 便于测试直接检查 key */
  has(key: string): boolean {
    return this.alive(key) && this.data.has(key);
  }

  keys(): string[] {
    return [...this.data.keys()];
  }

  private alive(key: string): boolean {
    const exp = this.expiry.get(key);
    if (exp !== undefined && exp <= this.clock()) {
      this.data.delete(key);
      this.expiry.delete(key);
      this.sets.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.alive(key)) return null;
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<any> {
    const nx = args.map((a) => String(a).toUpperCase()).includes('NX');
    const exIdx = args.findIndex((a) => String(a).toUpperCase() === 'EX');
    const ttl = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;

    if (nx && this.alive(key) && this.data.has(key)) return null;

    this.data.set(key, value);
    if (ttl !== undefined && Number.isFinite(ttl)) this.expiry.set(key, this.clock() + ttl * 1000);
    else this.expiry.delete(key);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      if (this.data.delete(key)) n++;
      this.expiry.delete(key);
      this.sets.delete(key);
    }
    return n;
  }

  async incr(key: string): Promise<number> {
    this.alive(key);
    const current = Number(this.data.get(key) ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + 1;
    this.data.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.alive(key)) return 0;
    if (!this.data.has(key) && !this.sets.has(key)) return 0;
    this.expiry.set(key, this.clock() + seconds * 1000);
    return 1;
  }

  async exists(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      if (this.alive(key) && (this.data.has(key) || this.sets.has(key))) n++;
    }
    return n;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.alive(key);
    const set = this.sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) { set.add(m); added++; }
    }
    this.sets.set(key, set);
    return added;
  }

  async scard(key: string): Promise<number> {
    if (!this.alive(key)) return 0;
    return this.sets.get(key)?.size ?? 0;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.alive(key)) return 0;
    const set = this.sets.get(key);
    if (!set) return 0;
    let n = 0;
    for (const m of members) if (set.delete(m)) n++;
    return n;
  }

  async getdel(key: string): Promise<string | null> {
    const value = await this.get(key);
    await this.del(key);
    return value;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

/** 始终不可用的 Redis（用于 fail closed 测试） */
export const unavailableRedisFactory = () => null;
