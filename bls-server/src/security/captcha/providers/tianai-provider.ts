/**
 * Provider — TIANAI（第二层，独立 Java 微服务）
 *
 * 职责边界（严格遵守）：
 *   - **不实现任何验证码算法**：图片生成、行为轨迹匹配全部由 Java 服务完成；
 *   - 只做 HTTP 代理：Koa → `http://tianai-captcha:8083`（Docker 内网，**不对公网暴露**）；
 *   - **保留 Tianai Web SDK 原始请求/响应字段**：上游返回的渲染数据原样透传给前端，
 *     前端提交的答案结构也原样转发给上游校验（不做字段改名/裁剪）；
 *   - **超时**：请求带超时，避免拖垮登录接口；
 *   - **技术故障 ≠ 验证失败**：上游不可达 / 超时 / 5xx / 响应缺少必要字段 →
 *     `status:'technical_error'`（错误码 TECHNICAL_ERROR），绝不返回 `failed`。
 */
import { randomBytes } from 'node:crypto';
import { logger } from '../../../core/logger';
import {
  type CaptchaGenerateInput,
  type CaptchaChallengeResult,
  type CaptchaProviderAdapter,
  type CaptchaVerifyInput,
  type CaptchaVerifyResult,
} from './types';

export interface TianaiProviderOptions {
  /** Docker 内网地址，例如 http://tianai-captcha:8083；为空表示未部署 */
  baseUrl: string;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
  /** 上游路径（不同部署可覆盖） */
  paths?: { generate: string; verify: string; health: string };
}

const DEFAULT_PATHS = { generate: '/captcha/generate', verify: '/captcha/verify', health: '/health' } as const;

/** Koa 侧生成的一次性会话 id（禁止 Math.random） */
export function newTianaiSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export class TianaiProvider implements CaptchaProviderAdapter {
  readonly name = 'TIANAI' as const;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly paths: { generate: string; verify: string; health: string };

  constructor(options: TianaiProviderOptions) {
    this.baseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.paths = options.paths ?? { ...DEFAULT_PATHS };
  }

  /** 未配置内网地址 → 视为不可用（调用方决定降级还是 fail closed） */
  isAvailable(): boolean {
    return !!this.baseUrl;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * 健康检查：**只接受 2xx**，且响应体必须是可解析的 JSON 对象。
   *
   * 旧实现把「任何 < 500 的响应」都当成可达 —— 那会让 401/403/404（例如路径写错、
   * 被网关拦截）也算健康，运维在系统参数页保存后才发现第二层根本跑不起来。
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await this.fetchWithTimeout(this.url(this.paths.health), {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      if (res.status < 200 || res.status >= 300) {
        logger.warn('[captcha] tianai health check non-2xx', { status: res.status });
        return false;
      }
      const body = await res.json() as unknown;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        logger.warn('[captcha] tianai health check invalid body');
        return false;
      }
      return true;
    } catch (err) {
      logger.warn('[captcha] tianai health check failed', { error: String(err) });
      return false;
    }
  }

  /** 生成验证码：调用 Java 服务，返回其原始数据（含 challenge id 与图片等渲染字段） */
  async generate(input: CaptchaGenerateInput): Promise<CaptchaChallengeResult> {
    const ttlSeconds = input.ttlSeconds ?? 180;
    if (!this.isAvailable()) {
      return {
        provider: 'TIANAI',
        challenge: {},
        expiresAt: Date.now(),
      };
    }

    let data: Record<string, unknown>;
    try {
      const res = await this.fetchWithTimeout(this.url(this.paths.generate), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          type: input.secondaryType ?? 'blockPuzzle',
          // 与 Tianai Web SDK 对齐的原始字段名
          scene: input.scene,
        }),
      });
      if (!res.ok) throw new Error(`upstream status ${res.status}`);
      data = await res.json() as Record<string, unknown>;
    } catch (err) {
      logger.error('[captcha] tianai generate failed', { error: String(err) });
      // 交给调用方按 TECHNICAL_ERROR 处理（这里抛出，由 service 统一转换，便于审计）
      throw new TianaiTechnicalError('UPSTREAM_UNREACHABLE', String(err));
    }

    const payload = unwrap(data);
    const upstreamId = String(payload.id ?? payload.challengeId ?? payload.token ?? '');
    if (!upstreamId) {
      logger.error('[captcha] tianai generate response missing id');
      throw new TianaiTechnicalError('UPSTREAM_BAD_RESPONSE', 'missing id');
    }

    return {
      provider: 'TIANAI',
      challenge: payload,               // 原始字段原样透传（图片、尺寸、类型…）
      sessionId: newTianaiSessionId(),  // 本地一次性会话 id（浏览器只能看到这个）
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  }

  /**
   * 校验答案：转发给 Java 服务。
   * 上游 2xx 且判定通过 → passed；上游 2xx 但判定不通过 → failed；
   * 其它（网络 / 超时 / 5xx / 结构异常）→ technical_error。
   */
  async verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    if (!this.isAvailable()) {
      return { status: 'technical_error', provider: 'TIANAI', technicalReason: 'UPSTREAM_NOT_CONFIGURED' };
    }
    const upstreamId = String(input.upstreamId ?? '');
    if (!upstreamId) {
      // 会话已经损毁/过期，属于我方状态问题，不应算用户失败
      return { status: 'technical_error', provider: 'TIANAI', technicalReason: 'INTERNAL_ERROR' };
    }

    let raw: Record<string, unknown>;
    try {
      const res = await this.fetchWithTimeout(this.url(this.paths.verify), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        // 保留 Tianai 原始字段：{ id, data }
        body: JSON.stringify({ id: upstreamId, data: input.data ?? {} }),
      });
      if (res.status >= 500) throw new Error(`upstream status ${res.status}`);
      if (!res.ok) throw new Error(`upstream status ${res.status}`);
      raw = await res.json() as Record<string, unknown>;
    } catch (err) {
      logger.error('[captcha] tianai verify failed', { error: String(err) });
      return {
        status: 'technical_error',
        provider: 'TIANAI',
        technicalReason: isTimeoutLike(err) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
      };
    }

    const verdict = normalizeVerdict(raw);
    if (verdict === null) {
      return { status: 'technical_error', provider: 'TIANAI', technicalReason: 'UPSTREAM_BAD_RESPONSE' };
    }
    return verdict
      ? { status: 'passed', provider: 'TIANAI' }
      : { status: 'failed', provider: 'TIANAI', reason: 'SOLUTION_INVALID' };
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, { ...(init ?? {}), signal: AbortSignal.timeout(this.timeoutMs) });
  }
}

/** 上游技术故障（内部使用，由 service 转成统一的 TECHNICAL_ERROR / 审计） */
export class TianaiTechnicalError extends Error {
  constructor(readonly reason: string, readonly detail?: string) {
    super(`tianai technical error: ${reason}`);
    this.name = 'TianaiTechnicalError';
  }
}

function isTimeoutLike(err: unknown): boolean {
  const msg = String((err as any)?.name ?? '') + String((err as any)?.message ?? err);
  return /timeout|timed out|abort/i.test(msg);
}

/** 兼容上游 `{...}` / `{data:{...}}` 两种包裹形式（不改字段名） */
function unwrap(raw: Record<string, unknown>): Record<string, unknown> {
  const data = raw?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return raw ?? {};
}

/**
 * 归一化上游判定结果，**只判断"通过 / 不通过"，判定不了返回 null（→ 技术故障）**。
 * 兼容 Tianai 及其扩展返回的常见字段。
 */
function normalizeVerdict(raw: Record<string, unknown>): boolean | null {
  const direct = [raw.valid, raw.success, raw.passed, (raw.data as any)?.valid, (raw.data as any)?.success];
  if (direct.some((v) => v === true)) return true;
  if (direct.some((v) => v === false)) return false;
  if (typeof raw.data === 'boolean') return raw.data;

  const code = Number(raw.code);
  if (Number.isFinite(code)) {
    // 约定：非 0 的 code 中 200 视为通过，其余（400/500…）视为答案不通过
    if (code === 200 || code === 0) return true;
    if (code >= 400 && code < 600) return false;
  }
  return null;
}
