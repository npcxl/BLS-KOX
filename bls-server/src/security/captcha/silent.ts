/**
 * 第一层：静默人机验证（行为评分）
 *
 * 设计原则：
 *   1. 只接受**行为统计值**，任何轨迹 / 按键内容 / 隐私字段都会被 sanitize 丢弃；
 *   2. 「没有鼠标移动」不会直接判定为机器人 —— 触控、键盘（含无障碍用户）都能拿到足够分数；
 *   3. 命中自动化标识（navigator.webdriver / headless）才直接判失败；
 *   4. 分数不足时进入第二层可视化验证，而不是拒绝登录。
 */
import { createHash } from 'node:crypto';
import { clampNumber } from './crypto-utils';
import type { InteractionSummary, KeyboardSummary, PointerSummary, SilentReason, SilentScoreResult } from './types';

/** PoW 最低难度（前导 0 的十六进制位数）；低于该值视为无效 proof */
export const MIN_POW_DIFFICULTY = 4;

const MAX_COUNT = 100_000;
const MAX_MS = 30 * 60 * 1000;

/** 只保留白名单内的统计字段并做范围裁剪 */
function sanitizePointer(raw: any): PointerSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: PointerSummary = {};
  const num = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, n));
  };
  const count = num(raw.count, 0, MAX_COUNT); if (count !== undefined) out.count = count;
  const moves = num(raw.moves, 0, MAX_COUNT); if (moves !== undefined) out.moves = moves;
  const avgSpeed = num(raw.avgSpeed, 0, 1000); if (avgSpeed !== undefined) out.avgSpeed = avgSpeed;
  const maxSpeed = num(raw.maxSpeed, 0, 10000); if (maxSpeed !== undefined) out.maxSpeed = maxSpeed;
  const avgInterval = num(raw.avgInterval, 0, MAX_MS); if (avgInterval !== undefined) out.avgInterval = avgInterval;
  const stdInterval = num(raw.stdInterval, 0, MAX_MS); if (stdInterval !== undefined) out.stdInterval = stdInterval;
  const straightness = num(raw.straightness, 0, 1); if (straightness !== undefined) out.straightness = straightness;
  return out;
}

function sanitizeKeyboard(raw: any): KeyboardSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: KeyboardSummary = {};
  const count = clampNumber(raw.count, 0, MAX_COUNT, NaN);
  if (Number.isFinite(count)) out.count = count;
  const avgInterval = clampNumber(raw.avgInterval, 0, MAX_MS, NaN);
  if (Number.isFinite(avgInterval)) out.avgInterval = avgInterval;
  const stdInterval = clampNumber(raw.stdInterval, 0, MAX_MS, NaN);
  if (Number.isFinite(stdInterval)) out.stdInterval = stdInterval;
  return out;
}

/**
 * 白名单化前端上报的交互摘要。
 * 任何未声明的字段（轨迹数组、按键内容、文本等）都会被丢弃 ——
 * 从结构上保证「不保存完整鼠标轨迹、按键内容或隐私数据」。
 */
export function sanitizeInteractionSummary(raw: unknown): InteractionSummary {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, any>;
  const out: InteractionSummary = {};

  const dwellMs = clampNumber(src.dwellMs, 0, MAX_MS, NaN);
  if (Number.isFinite(dwellMs)) out.dwellMs = dwellMs;

  const mouse = sanitizePointer(src.mouse); if (mouse) out.mouse = mouse;
  const touch = sanitizePointer(src.touch); if (touch) out.touch = touch;
  const keyboard = sanitizeKeyboard(src.keyboard); if (keyboard) out.keyboard = keyboard;

  if (src.focus && typeof src.focus === 'object') {
    const f: any = {};
    const blurCount = clampNumber(src.focus.blurCount, 0, 1000, NaN);
    if (Number.isFinite(blurCount)) f.blurCount = blurCount;
    const visibilityChanges = clampNumber(src.focus.visibilityChanges, 0, 1000, NaN);
    if (Number.isFinite(visibilityChanges)) f.visibilityChanges = visibilityChanges;
    const hiddenMs = clampNumber(src.focus.hiddenMs, 0, MAX_MS, NaN);
    if (Number.isFinite(hiddenMs)) f.hiddenMs = hiddenMs;
    out.focus = f;
  }

  if (src.automation && typeof src.automation === 'object') {
    out.automation = {
      webdriver: src.automation.webdriver === true,
      headless: src.automation.headless === true,
      plugins: Number.isFinite(Number(src.automation.plugins)) ? clampNumber(src.automation.plugins, 0, 1000, 0) : undefined,
      languages: Number.isFinite(Number(src.automation.languages)) ? clampNumber(src.automation.languages, 0, 1000, 0) : undefined,
      suspicious: src.automation.suspicious === true,
    };
  }

  return out;
}

/** 自动化 User-Agent 特征 */
const BOT_UA_PATTERNS: RegExp[] = [
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i, /playwright/i,
  /python-requests/i, /python-urllib/i, /curl\//i, /wget/i, /httpclient/i,
  /java\/\d/i, /okhttp/i, /go-http-client/i, /node-fetch/i, /axios\//i, /scrapy/i, /bot\b/i,
];

/** User-Agent / 设备特征是否明显异常 */
export function uaLooksAutomated(userAgent?: string | null): boolean {
  if (!userAgent) return true;
  const ua = userAgent.trim();
  if (ua.length < 10 || ua.length > 1024) return true;
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}

function pointerScore(p?: PointerSummary): number {
  const count = p?.count ?? 0;
  let base: number;
  if (count >= 15) base = 40;
  else if (count >= 8) base = 30;
  else if (count >= 4) base = 20;
  else if (count >= 2) base = 10;
  else if (count >= 1) base = 4;
  else base = 0;

  if (count >= 5 && p?.avgSpeed !== undefined) {
    // 人类鼠标平均速度大致 0.05 - 5 px/ms；过低=脚本匀速，过高=瞬移
    if (p.avgSpeed > 0 && p.avgSpeed < 0.01) base -= 6;
    if (p.avgSpeed > 20) base -= 6;
  }
  if (count >= 10 && p?.stdInterval !== undefined && p.stdInterval < 1) base -= 15;
  return Math.max(0, base);
}

function touchScore(p?: PointerSummary): number {
  const count = p?.count ?? 0;
  if (count >= 8) return 40;
  if (count >= 4) return 30;
  if (count >= 2) return 20;
  if (count >= 1) return 10;
  return 0;
}

function keyboardScore(k?: KeyboardSummary): number {
  const count = k?.count ?? 0;
  if (count >= 8) return 35;
  if (count >= 4) return 25;
  if (count >= 2) return 12;
  if (count >= 1) return 4;
  return 0;
}

/** 时间间隔的方差特征：过于规律（σ≈0）反而像脚本 */
function naturalnessScore(modalities: Array<PointerSummary | KeyboardSummary | undefined>): number {
  const candidates = modalities.filter((m): m is PointerSummary | KeyboardSummary =>
    !!m && (m.count ?? 0) >= 4 && typeof m.stdInterval === 'number');
  if (candidates.length === 0) return 0;
  const std = Math.max(...candidates.map((m) => m.stdInterval as number));
  if (std >= 3 && std <= 1500) return 15;
  if (std > 0) return 6;
  return 0;
}

/** 页面停留时长分 */
function dwellScore(dwellMs: number): number {
  if (dwellMs >= 1200) return 15;
  if (dwellMs >= 600) return 8;
  if (dwellMs >= 250) return 3;
  return -10;
}

/** focus / visibility 变化分 */
function focusScore(f?: InteractionSummary['focus']): number {
  if (!f) return 0;
  const blur = f.blurCount ?? 0;
  const vis = f.visibilityChanges ?? 0;
  const hidden = f.hiddenMs ?? 0;
  if (blur > 6 || vis > 8) return -5;
  if (hidden > 0 && hidden > 10 * 60 * 1000) return -5;
  return 5;
}

/** 校验可选 Proof of Work 结果 */
export function verifyPow(challengeId: string, proof: unknown): { provided: boolean; valid: boolean } {
  if (!proof || typeof proof !== 'object') return { provided: false, valid: false };
  const p = proof as Record<string, any>;
  const nonce = typeof p.nonce === 'string' ? p.nonce : '';
  const difficulty = Number(p.difficulty);
  if (!nonce || !Number.isFinite(difficulty) || nonce.length > 256) return { provided: true, valid: false };
  if (difficulty < MIN_POW_DIFFICULTY || difficulty > 8) return { provided: true, valid: false };
  const digest = createHash('sha256').update(`${challengeId}:${nonce}`, 'utf8').digest('hex');
  const prefix = '0'.repeat(Math.floor(difficulty));
  return { provided: true, valid: digest.startsWith(prefix) };
}

export interface SilentScoreInput {
  summary: InteractionSummary;
  /** 服务端观测到的 challenge → 本次验证耗时（ms），作为 dwell 的可信上界 */
  serverDwellMs: number;
  userAgent?: string | null;
  /** 通过阈值 */
  threshold: number;
  /** PoW 校验结果 */
  pow?: { provided: boolean; valid: boolean };
  /** 额外扣分原因（如 rate limit 压力） */
  extraPenalty?: { score: number; reason: SilentReason };
}

/**
 * 静默验证评分（0-100）。
 * 单模态（仅键盘 / 仅触控 / 仅鼠标）在自然行为下均可达到默认阈值 70。
 */
export function scoreSilent(input: SilentScoreInput): SilentScoreResult {
  const { summary, threshold } = input;
  const reasons: SilentReason[] = [];
  const modals: string[] = [];

  const automation = summary.automation;
  const automated =
    automation?.webdriver === true
    || automation?.headless === true
    || automation?.suspicious === true
    || uaLooksAutomated(input.userAgent);

  if (automation?.webdriver === true) modals.push('webdriver');
  if (automation?.headless === true) modals.push('headless');
  if (uaLooksAutomated(input.userAgent)) modals.push('bot-ua');

  // 硬失败：明确的自动化标识
  if (automated) {
    return {
      score: 0,
      passed: false,
      reasons: ['AUTOMATION_DETECTED'],
      signals: { humanInteractions: 0, modals },
    };
  }

  const mouse = summary.mouse;
  const touch = summary.touch;
  const keyboard = summary.keyboard;
  const humanInteractions = (mouse?.count ?? 0) + (touch?.count ?? 0) + (keyboard?.count ?? 0);

  let score = 0;
  score += Math.max(pointerScore(mouse), touchScore(touch));
  score += keyboardScore(keyboard);
  score += naturalnessScore([mouse, touch, keyboard]);

  const dwellMs = Math.min(input.serverDwellMs, summary.dwellMs ?? input.serverDwellMs);
  score += dwellScore(dwellMs);
  if (dwellMs < 250) reasons.push('TOO_FAST');

  score += focusScore(summary.focus);

  if (humanInteractions === 0) {
    // 注意：这不是「机器人」判定，只是缺少人类行为信号 → 交给第二层可视化验证
    reasons.push('NO_HUMAN_SIGNAL');
    score = Math.min(score, 20);
  }

  const stdCandidates = [mouse, touch, keyboard]
    .filter((m): m is PointerSummary | KeyboardSummary => !!m && (m.count ?? 0) >= 10 && typeof m.stdInterval === 'number');
  if (stdCandidates.length > 0 && stdCandidates.every((m) => (m.stdInterval as number) < 1)) {
    reasons.push('IRREGULAR_TIMING');
    score -= 10;
  }

  if (automation?.plugins === 0 && (automation?.languages ?? 0) <= 1) {
    modals.push('no-plugins-min-languages');
    score -= 10;
  }

  if (input.pow?.provided) {
    if (input.pow.valid) score += 20;
    else { reasons.push('POW_INVALID'); score -= 20; }
  }

  if (input.extraPenalty) {
    score += input.extraPenalty.score;
    reasons.push(input.extraPenalty.reason);
  }

  score = Math.round(Math.min(100, Math.max(0, score)));
  const passed = score >= threshold;
  if (!passed && !reasons.includes('LOW_SCORE')) reasons.push('LOW_SCORE');

  return { score, passed, reasons, signals: { humanInteractions, modals } };
}
