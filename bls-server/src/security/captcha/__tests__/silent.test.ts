/**
 * 静默人机验证评分 —— 单元测试
 *
 * 重点覆盖需求的可用性约束：
 *   - 不能仅凭「没有鼠标移动」判定为机器人
 *   - 触控 / 键盘 / 无障碍用户都能通过
 *   - 明确的自动化标识才硬失败
 *   - interactionSummary 只保留行为统计值
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sanitizeInteractionSummary, scoreSilent, uaLooksAutomated, verifyPow } from '../silent';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const base = { serverDwellMs: 2500, userAgent: CHROME_UA, threshold: 70 };

describe('silent — interactionSummary 白名单化', () => {
  it('丢弃轨迹数组 / 按键内容等未声明字段', () => {
    const out = sanitizeInteractionSummary({
      dwellMs: 3000,
      mouse: { count: 20, stdInterval: 40, path: [[1, 2], [3, 4]], rawEvents: ['x'] },
      keyboard: { count: 10, keys: 'my-secret-password', avgInterval: 120 },
      secret: 'p@ssw0rd',
      trajectory: [{ x: 1 }],
    });
    expect(Object.keys(out).sort()).toEqual(['dwellMs', 'keyboard', 'mouse']);
    expect(JSON.stringify(out)).not.toContain('my-secret-password');
    expect(JSON.stringify(out)).not.toContain('p@ssw0rd');
    expect((out.mouse as any).path).toBeUndefined();
    expect((out.keyboard as any).keys).toBeUndefined();
  });

  it('数值超出范围时被裁剪，非数字被忽略', () => {
    const out = sanitizeInteractionSummary({ dwellMs: -5, mouse: { count: 'abc', avgSpeed: 1e9 } });
    expect(out.dwellMs).toBe(0);
    expect(out.mouse?.count).toBeUndefined();
    expect(out.mouse?.avgSpeed).toBe(1000);
  });
});

describe('silent — 自动化标识', () => {
  it('navigator.webdriver=true → 硬失败 (AUTOMATION_DETECTED)', () => {
    const r = scoreSilent({
      ...base,
      summary: { dwellMs: 5000, automation: { webdriver: true }, mouse: { count: 40, stdInterval: 30 } },
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.reasons).toContain('AUTOMATION_DETECTED');
  });

  it('headless 标识 / 自动化 UA → 硬失败', () => {
    expect(scoreSilent({ ...base, summary: { automation: { headless: true } } }).passed).toBe(false);
    expect(scoreSilent({ ...base, userAgent: 'python-requests/2.31', summary: { mouse: { count: 50, stdInterval: 30 } } }).passed).toBe(false);
    expect(uaLooksAutomated('curl/8.0.1')).toBe(true);
    expect(uaLooksAutomated(CHROME_UA)).toBe(false);
  });
});

describe('silent — 单模态人类行为均可通过默认阈值 70', () => {
  it('仅鼠标', () => {
    const r = scoreSilent({
      ...base,
      summary: { dwellMs: 3000, mouse: { count: 24, avgSpeed: 0.8, stdInterval: 45 }, focus: { blurCount: 0, visibilityChanges: 0 } },
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.passed).toBe(true);
  });

  it('仅触控（移动端，无鼠标移动）', () => {
    const r = scoreSilent({
      ...base,
      userAgent: MOBILE_UA,
      summary: { dwellMs: 2600, touch: { count: 12, stdInterval: 60, avgSpeed: 0.4 }, focus: { blurCount: 0 } },
    });
    expect(r.passed).toBe(true);
  });

  it('仅键盘（无障碍 / 纯键盘用户）', () => {
    const r = scoreSilent({
      ...base,
      summary: { dwellMs: 2200, keyboard: { count: 12, avgInterval: 180, stdInterval: 70 }, focus: { blurCount: 1, visibilityChanges: 0 } },
    });
    expect(r.passed).toBe(true);
  });

  it('完全没有交互 → 不硬失败，但分数不足以静默通过（交给第二层）', () => {
    const r = scoreSilent({ ...base, summary: {} });
    expect(r.reasons).toContain('NO_HUMAN_SIGNAL');
    expect(r.passed).toBe(false);
  });
});

describe('silent — 异常特征扣分', () => {
  it('提交过快 → TOO_FAST', () => {
    const r = scoreSilent({ ...base, serverDwellMs: 120, summary: { dwellMs: 120, mouse: { count: 20, stdInterval: 40 } } });
    expect(r.reasons).toContain('TOO_FAST');
    expect(r.passed).toBe(false);
  });

  it('事件间隔完美规律（σ=0）→ IRREGULAR_TIMING 扣分', () => {
    const r = scoreSilent({
      ...base,
      summary: { dwellMs: 3000, mouse: { count: 30, stdInterval: 0, avgSpeed: 1 } },
    });
    expect(r.reasons).toContain('IRREGULAR_TIMING');
  });

  it('PoW 有效加分，无效扣分', () => {
    const summary = { dwellMs: 1500, mouse: { count: 4, stdInterval: 50 } };
    const withValid = scoreSilent({ ...base, summary, pow: { provided: true, valid: true } });
    const withInvalid = scoreSilent({ ...base, summary, pow: { provided: true, valid: false } });
    expect(withValid.score).toBeGreaterThan(withInvalid.score);
    expect(withInvalid.reasons).toContain('POW_INVALID');
  });
});

describe('silent — Proof of Work 校验', () => {
  it('难度不足 / 前缀不满足 → invalid', () => {
    expect(verifyPow('c1', { nonce: 'n', difficulty: 2 }).valid).toBe(false);
    expect(verifyPow('c1', { nonce: 'n', difficulty: 4 }).valid).toBe(false); // 极小概率真命中
    expect(verifyPow('c1', null).provided).toBe(false);
  });

  it('找到满足难度的 nonce → valid', () => {
    const challengeId = 'challenge-abc';
    let nonce = '';
    for (let i = 0; i < 5_000_000; i++) {
      const candidate = String(i);
      const digest = createHash('sha256').update(`${challengeId}:${candidate}`).digest('hex');
      if (digest.startsWith('0000')) { nonce = candidate; break; }
    }
    expect(nonce).not.toBe('');
    expect(verifyPow(challengeId, { nonce, difficulty: 4 })).toEqual({ provided: true, valid: true });
  });
});
