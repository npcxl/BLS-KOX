/**
 * 行为统计采集器（静默人机验证的第一层输入）
 *
 * 隐私约束（与后端一致）：
 *   - **不保存任何鼠标 / 触控轨迹坐标数组**，只累加计数、时间间隔与速度的统计量；
 *   - **不读取、不保存任何按键内容**（keydown 只计数与计时）；
 *   - 只上传计数、间隔均值/标准差、速度等统计值。
 *
 * 兼容性：无鼠标（移动端 / 触控 / 无障碍键盘用户）同样能产出有效信号。
 */
import type { InteractionSummary } from '@/services/auth/captcha';

interface PointerStats {
  count: number;
  moves: number;
  intervalSum: number;
  intervalSumSq: number;
  intervalCount: number;
  speedSum: number;
  speedCount: number;
  maxSpeed: number;
  lastTs: number;
  lastX: number;
  lastY: number;
  lastSampleTs: number;
  hasLast: boolean;
}

function emptyPointer(): PointerStats {
  return {
    count: 0, moves: 0,
    intervalSum: 0, intervalSumSq: 0, intervalCount: 0,
    speedSum: 0, speedCount: 0, maxSpeed: 0,
    lastTs: 0, lastX: 0, lastY: 0, lastSampleTs: 0, hasLast: false,
  };
}

/** 统计间隔（ms）并累加 */
function trackInterval(s: PointerStats, now: number): void {
  if (s.lastTs > 0) {
    const dt = now - s.lastTs;
    if (dt >= 0 && dt < 60_000) {
      s.intervalSum += dt;
      s.intervalSumSq += dt * dt;
      s.intervalCount += 1;
    }
  }
  s.lastTs = now;
}

function statsOf(s: PointerStats) {
  const stats: Record<string, number> = { count: s.count, moves: s.moves };
  if (s.intervalCount > 0) {
    const avg = s.intervalSum / s.intervalCount;
    const variance = Math.max(0, s.intervalSumSq / s.intervalCount - avg * avg);
    stats.avgInterval = Math.round(avg);
    stats.stdInterval = Math.round(Math.sqrt(variance));
  }
  if (s.speedCount > 0) {
    stats.avgSpeed = Number((s.speedSum / s.speedCount).toFixed(4));
    stats.maxSpeed = Number(s.maxSpeed.toFixed(4));
  }
  return stats;
}

export class BehaviorCollector {
  private startedAt = 0;
  private mouse = emptyPointer();
  private touch = emptyPointer();
  private keyCount = 0;
  private keyIntervalSum = 0;
  private keyIntervalSumSq = 0;
  private keyIntervalCount = 0;
  private keyLastTs = 0;
  private blurCount = 0;
  private visibilityChanges = 0;
  private hiddenSince = 0;
  private hiddenMs = 0;
  private attached = false;

  private readonly onMouseMove = (e: MouseEvent) => {
    const s = this.mouse;
    const now = Date.now();
    s.count += 1;
    s.moves += 1;
    trackInterval(s, now);
    if (s.hasLast) {
      const dt = Math.max(1, now - (s.lastSampleTs ?? now));
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const speed = dist / dt;
        s.speedSum += speed;
        s.speedCount += 1;
        if (speed > s.maxSpeed) s.maxSpeed = speed;
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.lastSampleTs = now;
      }
    } else {
      s.hasLast = true;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastSampleTs = now;
    }
  };

  private readonly onMouseDown = () => { this.mouse.count += 1; };

  private readonly onTouchStart = () => { this.touch.count += 1; };

  private readonly onTouchMove = (e: TouchEvent) => {
    const s = this.touch;
    const now = Date.now();
    s.count += 1;
    s.moves += 1;
    trackInterval(s, now);
    const t = e.touches?.[0];
    if (!t) return;
    if (s.hasLast) {
      const dt = Math.max(1, now - (s.lastSampleTs ?? now));
      const dx = t.clientX - s.lastX;
      const dy = t.clientY - s.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const speed = dist / dt;
        s.speedSum += speed;
        s.speedCount += 1;
        if (speed > s.maxSpeed) s.maxSpeed = speed;
      }
    }
    s.hasLast = true;
    s.lastX = t.clientX;
    s.lastY = t.clientY;
    s.lastSampleTs = now;
  };

  // 只计数与计时，绝不读取 e.key / e.code（不上传按键内容）
  private readonly onKeyDown = () => {
    this.keyCount += 1;
    const now = Date.now();
    if (this.keyLastTs > 0) {
      const dt = now - this.keyLastTs;
      if (dt >= 0 && dt < 60_000) {
        this.keyIntervalSum += dt;
        this.keyIntervalSumSq += dt * dt;
        this.keyIntervalCount += 1;
      }
    }
    this.keyLastTs = now;
  };

  private readonly onBlur = () => { this.blurCount += 1; };

  private readonly onVisibility = () => {
    this.visibilityChanges += 1;
    if (document.visibilityState === 'hidden') {
      this.hiddenSince = Date.now();
    } else if (this.hiddenSince > 0) {
      this.hiddenMs += Date.now() - this.hiddenSince;
      this.hiddenSince = 0;
    }
  };

  start(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.startedAt = Date.now();
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('mousedown', this.onMouseDown, { passive: true });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('keydown', this.onKeyDown, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.attached = true;
  }

  stop(): void {
    if (!this.attached || typeof window === 'undefined') return;
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.attached = false;
  }

  /** 输出统计摘要（幂等，不产生副作用） */
  summary(): InteractionSummary {
    const dwellMs = this.startedAt > 0 ? Date.now() - this.startedAt : 0;
    const summary: InteractionSummary = { dwellMs };

    if (this.mouse.count > 0) summary.mouse = statsOf(this.mouse);
    if (this.touch.count > 0) summary.touch = statsOf(this.touch);

    if (this.keyCount > 0) {
      const keyboard: Record<string, number> = { count: this.keyCount };
      if (this.keyIntervalCount > 0) {
        const avg = this.keyIntervalSum / this.keyIntervalCount;
        const variance = Math.max(0, this.keyIntervalSumSq / this.keyIntervalCount - avg * avg);
        keyboard.avgInterval = Math.round(avg);
        keyboard.stdInterval = Math.round(Math.sqrt(variance));
      }
      summary.keyboard = keyboard;
    }

    const hiddenTotal = this.hiddenMs + (this.hiddenSince > 0 ? Date.now() - this.hiddenSince : 0);
    if (this.blurCount > 0 || this.visibilityChanges > 0 || hiddenTotal > 0) {
      summary.focus = {
        blurCount: this.blurCount,
        visibilityChanges: this.visibilityChanges,
        hiddenMs: hiddenTotal,
      };
    }

    summary.automation = detectAutomation();
    return summary;
  }

  /** 重置统计（重新开始一次 challenge 时调用） */
  reset(): void {
    this.startedAt = Date.now();
    this.mouse = emptyPointer();
    this.touch = emptyPointer();
    this.keyCount = 0;
    this.keyIntervalSum = 0;
    this.keyIntervalSumSq = 0;
    this.keyIntervalCount = 0;
    this.keyLastTs = 0;
    this.blurCount = 0;
    this.visibilityChanges = 0;
    this.hiddenSince = 0;
    this.hiddenMs = 0;
  }
}

/** 浏览器侧自动化标识（服务端还会独立校验 UA 与更多信号） */
export function detectAutomation(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return { webdriver: false };
  const nav: any = navigator;
  const ua = String(nav.userAgent ?? '');
  return {
    webdriver: nav.webdriver === true,
    headless: /headless/i.test(ua) || (nav.webdriver === true && Number(nav.plugins?.length ?? 0) === 0),
    plugins: Number(nav.plugins?.length ?? 0),
    languages: Number(nav.languages?.length ?? 0),
  };
}

/** 单例：登录页在挂载时 start()、提交时 summary()、卸载时 stop() */
export const loginBehaviorCollector = new BehaviorCollector();
