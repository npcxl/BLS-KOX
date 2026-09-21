/**
 * 测试辅助：用官方 ALTCHA 库求解 challenge，产出与官方 widget 完全一致的 payload。
 *
 * 官方 widget 的做法是：`btoa(JSON.stringify({ challenge: { parameters, signature }, solution }))`。
 * 这里刻意复刻同一格式，保证测试验证的是真实契约。
 */
import { deriveKeyFor, loadAltchaLib } from '../altcha';

export interface AltchaChallengeLike {
  parameters: Record<string, any>;
  signature: string;
}

/** 求解 challenge 并返回 base64(JSON) payload */
export async function solveAltcha(challenge: AltchaChallengeLike): Promise<string> {
  const { solveChallenge } = await loadAltchaLib();
  const deriveKey = await deriveKeyFor(String(challenge.parameters.algorithm));
  if (!deriveKey) throw new Error('unsupported algorithm');
  const solution = await solveChallenge({ challenge: challenge as any, deriveKey });
  if (!solution) throw new Error('failed to solve challenge');
  return encodePayload({
    challenge: { parameters: challenge.parameters, signature: challenge.signature },
    solution,
  });
}

/** 把 payload 对象编码为官方 widget 的 base64 形式 */
export function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/** 解码 payload（测试断言用） */
export function decodePayload(raw: string): any {
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}
