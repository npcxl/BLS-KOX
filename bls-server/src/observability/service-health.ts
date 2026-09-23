/**
 * 服务依赖健康检查（启动自检 + 运行时就绪探针 + 周期巡检）
 *
 * 为什么需要：
 *   Koa 只是入口，真正干活的是 MySQL / Redis / bls-event-service / bls-ai-service /
 *   bls-captcha-service(Tianai)。任意一个没启动，症状往往出现在完全无关的地方：
 *     · Redis 没开   → 会话、防重放、限流全部静默失效（最危险：看起来一切正常）；
 *     · event-service 没开 → 审计事件进 outbox 死信，只有翻日志才发现；
 *     · Tianai 没开  → 高风险账号登录 fail closed 503，运维以为是"登录坏了"；
 *     · 后端整体没起 → 前端 dev proxy 统一表现成 **504 Gateway Timeout**，极难定位。
 *   所以「谁没开」必须在启动那一刻就说清楚，而不是等出问题再猜。
 *
 * 本文件把依赖清单收敛成**唯一一份注册表**，供四处复用：
 *   1. 启动自检（app.ts）：开放端口前打印带 [ OK ]/[FAIL]/[SKIP] 与启动命令的报告；
 *      严格模式下核心依赖不可用 → 直接退出（fail fast），不对外提供半残服务。
 *   2. 运行时探针：GET /api/ready（只给状态，不泄露内网地址）、
 *      GET /internal/services（内部鉴权，含地址 / 耗时 / 失败原因 / 启动提示）。
 *   3. 周期巡检（watchdog）：只在下线 / 上线状态**发生变化**时记日志，避免刷屏。
 *   4. 命令行：npm run services:check（部署后自检、排障时随手一跑）。
 *
 * 状态语义：
 *   up        探测通过
 *   down      期望它运行，但探测失败
 *   disabled  未配置或已显式关闭（**不计为故障**）
 *
 * kind 语义：
 *   core         不可用则 Koa 无法正常提供服务（MySQL / Redis）
 *   conditional  取决于配置或服务端策略（Koa 实时通道 / Tianai：只有开启时才必须可用）
 *   optional     不可用时功能降级，主体仍可服务（event-service / ai-service）
 *
 * 注意：Java / Rust 后端是 Koa 的**平替方案**（同时只有一个在跑），既不是 Koa 的依赖、
 * 也没有联动关系，因此**不纳入本注册表**。
 */
import { WebSocket } from 'ws';
import { env } from '../config/env';
import { logger } from '../core/logger';
import { TianaiProvider } from '../security/captcha/providers/tianai-provider';

export type ServiceDepStatus = 'up' | 'down' | 'disabled';
export type ServiceDepKind = 'core' | 'conditional' | 'optional';

export interface ServiceDependency {
  /** 稳定标识，会出现在 /api/ready 的 services 字段里（改名字等于改接口契约） */
  name: string;
  /** 人读标签 */
  label: string;
  kind: ServiceDepKind;
  /** 是否**期望**它在运行；false → 探测结果记 disabled，不计为故障 */
  enabled: () => boolean;
  /** 展示用地址（仅内部日志 / /internal/services 暴露，绝不出现在公开接口） */
  target: () => string;
  /**
   * 预热：探测**之前**执行、**不计入**探测超时。
   * 用于把动态 import（kysely / mysql2 / ioredis …）的模块编译耗时排除在外 ——
   * 否则冷启动时「模块编译慢」会被误判成「服务没开」，严格模式下直接拒绝启动一个健康实例。
   */
  warmup?: () => Promise<unknown>;
  /** 探测：resolve = 可用（返回说明信息）；reject = 不可用 */
  probe: () => Promise<string>;
  /** 没开时该执行什么命令 */
  startHint?: string;
}

export interface ServiceProbeResult {
  name: string;
  label: string;
  kind: ServiceDepKind;
  status: ServiceDepStatus;
  target: string;
  latencyMs: number;
  message: string;
  startHint?: string;
}

/**
 * 单次探测的默认超时。
 * 取值 5s：数据库 / Redis 常常跨网络部署，建连本身就可能有秒级抖动；
 * 预热（见 ServiceDependency.warmup）已经把模块编译与连接池初始化排除在计时之外，
 * 因此这里的耗时只反映「真实交互」。网络确实很慢时可调大 SERVICE_CHECK_TIMEOUT_MS。
 */
const DEFAULT_TIMEOUT_MS = 5_000;

/** 探测超时（毫秒）：优先取配置，兜底默认值 */
function probeTimeoutMs(): number {
  const configured = env.serviceCheck.timeoutMs;
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * 给探测加超时。注意：超时后原任务仍可能 reject，这里**始终**挂上处理器，
 * 避免产生 unhandled rejection 把进程打挂。
 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`探测超时（>${ms}ms）`)), ms);
    task.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** HTTP 探测：只接受 2xx；requireJson 时额外要求响应体是可解析的 JSON 对象 */
async function probeHttp(url: string, options: { requireJson?: boolean; timeoutMs?: number } = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs ?? probeTimeoutMs()),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  if (options.requireJson) {
    const body = await res.json().catch(() => null) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('响应体不是合法 JSON 对象');
    }
  }
  return `HTTP ${res.status}`;
}

/**
 * Koa 实时通道地址（规则与 `api/system/realtime/realtime.ws.ts` 的 `getWsEndpoint()` 一致）。
 * 监听 `0.0.0.0` / `::` 时探测要走回环地址，否则部分环境连不上。
 */
function realtimeWsTarget(): string {
  if (env.ws.url) return env.ws.url;
  const protocol = env.isProduction ? 'wss' : 'ws';
  const rawHost = env.ws.host || env.host;
  const host = rawHost === '0.0.0.0' || rawHost === '::' || rawHost === '' ? '127.0.0.1' : rawHost;
  return `${protocol}://${host}:${env.ws.port || env.port}${env.ws.path || '/ws/realtime'}`;
}

/**
 * WebSocket 握手探测。
 * 只握手一次、连上即断：握手成功就说明「WS 已挂载、路径与端口都正确」。
 * 该路径在握手阶段**不校验 token**（认证发生在连接后的 auth 消息里），所以未登录也能安全探测。
 */
export function probeWebSocket(url: string, timeoutMs: number = probeTimeoutMs()): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let socket: WebSocket | null = null;
    let settled = false;

    const timer = setTimeout(() => settle(new Error('探测超时')), timeoutMs);
    timer.unref?.();

    function settle(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.terminate(); } catch { /* 已关闭 */ }
      if (error) reject(error); else resolve('WebSocket 握手成功');
    }

    try {
      socket = new WebSocket(url);
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    socket.on('open', () => settle());
    socket.on('error', (error) => settle(error instanceof Error ? error : new Error(String(error))));
  });
}

/** 把各类底层错误翻译成运维能直接行动的短句 */
export function describeProbeError(error: unknown): string {
  const e = error as { code?: string; name?: string; message?: string; cause?: { code?: string } } | undefined;
  const code = String(e?.code ?? e?.cause?.code ?? '');
  switch (code) {
    case 'ECONNREFUSED': return '连接被拒绝（服务未启动）';
    case 'ENOTFOUND': return '域名解析失败';
    case 'EAI_AGAIN': return 'DNS 暂时不可用';
    case 'ETIMEDOUT': return '连接超时';
    case 'ECONNRESET': return '连接被重置';
    case 'EPIPE': return '连接被关闭';
    case 'ER_ACCESS_DENIED_ERROR': return '认证失败（账号或密码错误）';
    case 'ER_BAD_DB_ERROR': return '数据库不存在（检查 DB_NAME）';
    case 'ER_DBACCESS_DENIED_ERROR': return '账号无权访问该数据库';
    default: break;
  }
  if (code.startsWith('ER_')) return `MySQL 错误 ${code}`;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '探测超时';
  const message = String(e?.message ?? '');
  if (/fetch failed/i.test(message)) return '网络不可达（fetch failed）';
  if (/NOAUTH|WRONGPASS|invalid password/i.test(message)) return 'Redis 认证失败';
  return message ? message.slice(0, 140) : '未知错误';
}

/**
 * 依赖注册表 —— **唯一来源**。新增依赖 / 改地址只改这里。
 * 注意：所有地址都从 env 读取，不硬编码容器名（否则本地开发必然全红）。
 */
export const SERVICE_DEPS: ServiceDependency[] = [
  {
    name: 'mysql',
    label: 'MySQL 数据库',
    kind: 'core',
    enabled: () => true,
    target: () => `${env.db.host}:${env.db.port}/${env.db.database}`,
    startHint: '启动数据库（docker compose up -d mysql），并确认 DB_HOST/DB_PORT/DB_NAME/DB_PASSWORD',
    // 预热要连 getDb() 一起做完：它内部还有一次 import('kysely')，
    // 只 import 本模块的话，kysely 的编译耗时会落进计时区间
    warmup: async () => { await (await import('../core/database.js')).getDb(); },
    probe: async () => {
      const { getDb } = await import('../core/database.js');
      const db = await getDb();
      await db.selectFrom('sys_config').select('config_id').limit(1).execute();
      return `连接正常（${env.db.database}）`;
    },
  },
  {
    name: 'redis',
    label: 'Redis 缓存/会话',
    kind: 'core',
    enabled: () => env.redis.enabled,
    target: () => `${env.redis.host}:${env.redis.port}`,
    startHint: '启动 Redis（docker compose up -d redis）；未配置 Redis 时请设 REDIS_ENABLED=false（仅开发）',
    // 预热到「客户端已创建」为止（ioredis 为 lazyConnect，此时不会真正建连）
    warmup: async () => { (await import('../shared/utils/redis.js')).getRedisClient(); },
    probe: async () => {
      const { getRedisClient } = await import('../shared/utils/redis.js');
      const client = getRedisClient();
      if (!client) throw new Error('REDIS_ENABLED=false');
      // lazyConnect：PING 会触发真正的建连，连不上直接抛错
      await client.ping();
      return 'PONG';
    },
  },
  {
    name: 'bls-realtime-ws',
    label: 'Koa 实时通道',
    kind: 'conditional',
    enabled: () => env.ws.enabled,
    target: () => realtimeWsTarget(),
    startHint: '无需单独启动：它是 Koa 自身进程的一部分（WS_ENABLED=true 时随主服务启动）',
    // ⚠ 该探测要求 Koa 已经 listen（与 HTTP 共用端口），因此自检必须在 listen 之后执行 ——
    //    见 app.ts 的启动顺序说明；否则本行会被误报成「连接被拒绝（服务未启动）」。
    probe: () => probeWebSocket(realtimeWsTarget()),
  },
  {
    name: 'bls-event-service',
    label: '事件/审计微服务',
    kind: 'optional',
    enabled: () => env.eventService.enabled,
    target: () => env.eventService.url,
    startHint: 'cd bls-event-service && npm run dev（EVENT_SERVICE_URL 已配置，未启动时审计事件会进 outbox 死信）',
    probe: () => probeHttp(`${env.eventService.url}/health`),
  },
  {
    name: 'bls-ai-service',
    label: 'AI 微服务',
    kind: 'optional',
    enabled: () => !!env.aiService.url,
    target: () => env.aiService.url,
    startHint: 'cd bls-ai-service && npm run dev（AI 对话 / CRUD 生成 / OCR 等能力依赖它）',
    probe: () => probeHttp(`${env.aiService.url}/health`),
  },
  {
    name: 'bls-captcha-service',
    label: 'Tianai 图形验证码服务',
    kind: 'conditional',
    enabled: () => !!env.captcha.tianaiUrl,
    target: () => env.captcha.tianaiUrl,
    startHint: 'cd bls-captcha-service && mvn spring-boot:run（或 IntelliJ 启动，端口 8083）；'
      + '未部署时请把系统参数 captcha_tianai_enabled 置为 false —— '
      + '否则风控要求第二层时登录会 fail closed（HTTP 503 / 50302）',
    probe: async () => {
      const url = `${env.captcha.tianaiUrl}${env.captcha.tianaiPaths.health}`;

      // 第一跳：原样发一次请求，**连接层**的失败要如实抛出（服务没启动 = ECONNREFUSED）。
      // 否则 provider 会把任何异常都折叠成 false，运维只能看到一句「健康检查未通过」，
      // 分不清是「没启动」还是「路径/网关配错了」。
      await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(probeTimeoutMs()) });

      // 第二跳：复用 provider 的判定语义（只认 2xx + 合法 JSON 对象），
      // 保证自检结论与登录链路实际使用的健康检查完全一致。
      const provider = new TianaiProvider({
        baseUrl: env.captcha.tianaiUrl,
        paths: env.captcha.tianaiPaths,
        timeoutMs: probeTimeoutMs(),
      });
      const healthy = await provider.healthCheck();
      if (!healthy) throw new Error('健康检查未通过（非 2xx 或响应体不是合法 JSON）');
      return `HTTP 2xx（${env.captcha.tianaiPaths.health}）`;
    },
  },
];

/** 探测单个依赖（**永不抛错**，任何异常都折叠成 status='down'，避免自检把进程打挂） */
async function probeOne(dep: ServiceDependency, timeoutMs: number): Promise<ServiceProbeResult> {
  let target = '';
  try { target = dep.target(); } catch { /* 展示地址取不到不影响探测结论 */ }
  const base = {
    name: dep.name,
    label: dep.label,
    kind: dep.kind,
    target,
    startHint: dep.startHint,
  };

  let expected: boolean;
  try {
    expected = dep.enabled();
  } catch (error) {
    return { ...base, status: 'down', latencyMs: 0, message: `依赖配置不可用：${describeProbeError(error)}` };
  }
  if (!expected) {
    return { ...base, status: 'disabled', latencyMs: 0, message: '未配置或已关闭' };
  }

  const started = Date.now();
  try {
    const message = await withTimeout(dep.probe(), timeoutMs);
    return { ...base, status: 'up', latencyMs: Date.now() - started, message };
  } catch (error) {
    return { ...base, status: 'down', latencyMs: Date.now() - started, message: describeProbeError(error) };
  }
}

/**
 * 预热预算：动态 import 是本机文件加载，正常情况下几百毫秒；
 * 给一个宽松上限只为了防止极端情况把启动无限拖住（超时后照样继续探测，由探测结果给出结论）。
 */
function warmupBudgetMs(timeoutMs: number): number {
  return Math.max(timeoutMs * 3, 10_000);
}

/** 并发探测全部依赖（顺序与注册表一致） */
export async function probeServices(
  deps: ServiceDependency[] = SERVICE_DEPS,
  timeoutMs: number = probeTimeoutMs(),
): Promise<ServiceProbeResult[]> {
  // 先预热：把动态 import 的编译耗时排除在探测计时之外（见 ServiceDependency.warmup 注释）
  const warmups = deps.map((dep) => dep.warmup?.() ?? Promise.resolve());
  await withTimeout(Promise.allSettled(warmups), warmupBudgetMs(timeoutMs)).catch(() => {
    logger.warn('[services] 依赖模块预热超时，继续执行探测');
  });

  return Promise.all(deps.map((dep) => probeOne(dep, timeoutMs)));
}

/** 致命依赖：核心依赖不可用 → Koa 无法正常提供服务（严格模式下据此退出 / 判 503） */
export function findFatalDeps(results: ServiceProbeResult[]): ServiceProbeResult[] {
  return results.filter((r) => r.kind === 'core' && r.status === 'down');
}

/** 降级依赖：不可用会让功能不完整，但不影响 Koa 主体 */
export function findDegradedDeps(results: ServiceProbeResult[]): ServiceProbeResult[] {
  return results.filter((r) => r.kind !== 'core' && r.status === 'down');
}

export interface ServiceProbeSummary {
  total: number;
  up: number;
  down: number;
  disabled: number;
}

/** 计数汇总 */
export function summarize(results: ServiceProbeResult[]): ServiceProbeSummary {
  return {
    total: results.length,
    up: results.filter((r) => r.status === 'up').length,
    down: results.filter((r) => r.status === 'down').length,
    disabled: results.filter((r) => r.status === 'disabled').length,
  };
}

const STATUS_TAG: Record<ServiceDepStatus, string> = {
  up: '[ OK ]',
  down: '[FAIL]',
  disabled: '[SKIP]',
};

const KIND_LABEL: Record<ServiceDepKind, string> = {
  core: '核心',
  conditional: '条件',
  optional: '可选',
};

/** ANSI 转义序列（着色用）。计算显示宽度前必须先剔除，否则表格会错位 */
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

type AnsiColor = 'green' | 'red' | 'dim';
const ANSI_CODES: Record<AnsiColor, string> = {
  green: '\u001b[32m',
  red: '\u001b[31m',
  dim: '\u001b[90m',
};
const ANSI_RESET = '\u001b[0m';

/**
 * 只在**真实终端**着色：管道 / 重定向到文件 / CI / 日志采集一律输出纯文本，
 * 否则日志里会混进一堆转义字符。`FORCE_COLOR` 可显式开关（本地验证与测试用），
 * `NO_COLOR` 遵循通用约定。
 */
function colorEnabled(): boolean {
  if (process.env.FORCE_COLOR === '0' || process.env.FORCE_COLOR === 'false') return false;
  if (process.env.FORCE_COLOR) return true;
  if ((process.env.NO_COLOR ?? '') !== '') return false;
  return process.stdout.isTTY === true;
}

/**
 * 终端显示宽度：CJK 全角字符占 2 列。
 * 不这样算的话，含中文的表格在等宽终端里必然错位（这是中文表格唯一真正的难点）。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text.replace(ANSI_PATTERN, '')) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f)   // 韩文字母
      || (code >= 0x2e80 && code <= 0xa4cf) // CJK 部首 / 假名 / 表意文字 / 中文标点
      || (code >= 0xac00 && code <= 0xd7a3) // 韩文音节
      || (code >= 0xf900 && code <= 0xfaff) // CJK 兼容表意文字
      || (code >= 0xfe30 && code <= 0xfe6f) // CJK 兼容形式 / 全角标点
      || (code >= 0xff00 && code <= 0xff60) // 全角 ASCII
      || (code >= 0xffe0 && code <= 0xffe6); // 全角符号
    width += wide ? 2 : 1;
  }
  return width;
}

function padDisplay(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const gap = Math.max(0, width - displayWidth(text));
  return align === 'right' ? ' '.repeat(gap) + text : text + ' '.repeat(gap);
}

/** 按显示宽度折行（按码点遍历，不会切断代理对） */
function wrapByWidth(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const ch of text) {
    const charWidth = displayWidth(ch);
    if (current && currentWidth + charWidth > width) {
      lines.push(current);
      current = '';
      currentWidth = 0;
    }
    current += ch;
    currentWidth += charWidth;
  }
  lines.push(current);
  return lines;
}

interface ReportColumn {
  title: string;
  width: number;
  align?: 'left' | 'right';
}

/** 单元格：`text` 是纯文本（折行与宽度计算只认它），`color` 在补齐宽度后再生效 */
interface ReportCell {
  text: string;
  color?: AnsiColor;
}

/** 渲染一个带标题的框线表格（单元格按需折行；着色不影响宽度计算） */
function renderTable(title: string, columns: ReportColumn[], rows: ReportCell[][]): string {
  const paint = colorEnabled();
  const innerWidth = columns.reduce((sum, c) => sum + c.width + 2, 0) + columns.length - 1;
  const titleWidth = displayWidth(title);
  const leftPad = Math.max(1, Math.floor((innerWidth - titleWidth - 2) / 2));
  const rightPad = Math.max(1, innerWidth - titleWidth - 2 - leftPad);

  const row = (cells: ReportCell[]): string => '│' + cells.map((cell, i) => {
    const padded = padDisplay(cell.text, columns[i].width, columns[i].align);
    return ` ${paint && cell.color ? `${ANSI_CODES[cell.color]}${padded}${ANSI_RESET}` : padded} `;
  }).join('│') + '│';
  const divider = (left: string, mid: string, right: string): string =>
    left + columns.map((c) => '─'.repeat(c.width + 2)).join(mid) + right;

  const out: string[] = [
    '┌' + '─'.repeat(leftPad) + ' ' + title + ' ' + '─'.repeat(rightPad) + '┐',
    row(columns.map((c) => ({ text: c.title }))),
    divider('├', '┼', '┤'),
  ];
  for (const cells of rows) {
    const wrapped = cells.map((cell, i) => wrapByWidth(cell.text, columns[i].width));
    const height = Math.max(...wrapped.map((lines) => lines.length));
    for (let i = 0; i < height; i += 1) {
      out.push(row(cells.map((cell, idx) => ({ text: wrapped[idx][i] ?? '', color: cell.color }))));
    }
  }
  out.push(divider('└', '┴', '┘'));
  return out.join('\n');
}

/** 地址列着色：连得通=绿，连不通=红，未配置=灰 */
function addressCell(result: ServiceProbeResult): ReportCell {
  if (!result.target) return { text: '—', color: 'dim' };
  if (result.status === 'up') return { text: result.target, color: 'green' };
  if (result.status === 'down') return { text: result.target, color: 'red' };
  return { text: result.target, color: 'dim' };
}

/**
 * KOX 服务检测表（启动日志与 npm run services:check 复用同一份输出）。
 * 只输出这一张表：不加汇总行、不加处理建议段落。
 * `startHint` 仍保留在数据里，需要时通过 `GET /internal/services` 获取。
 */
export function formatServiceReport(results: ServiceProbeResult[], title = 'KOX--Watch'): string {
  const rows: ReportCell[][] = results.map((r) => [
    { text: STATUS_TAG[r.status] },
    { text: r.name },
    { text: KIND_LABEL[r.kind] },
    { text: r.status === 'disabled' ? '—' : `${r.latencyMs}ms` },
    addressCell(r),
    { text: r.message },
  ]);

  // 列宽按最长内容取：服务名最长 bls-captcha-service(19)，地址最长 ws://127.0.0.1:6001/ws/realtime(31)
  return renderTable(title, [
    { title: '状态', width: 7 },
    { title: '服务', width: 19 },
    { title: '类别', width: 6 },
    { title: '耗时', width: 7, align: 'right' },
    { title: '地址', width: 31 },
    { title: '检测结果', width: 29 },
  ], rows);
}

/**
 * 启动自检输出：只打这一张表。
 * 表里已经写清了「哪个服务没开 / 地址是什么 / 怎么启动」，再补一段结构化日志只是重复噪音；
 * 运行期状态由 `GET /api/ready`（核心依赖不可用 → 503）与巡检日志负责。
 */
export function reportStartupServices(results: ServiceProbeResult[]): void {
  // eslint-disable-next-line no-console
  console.log(formatServiceReport(results));
}

/**
 * 运行期巡检：按固定间隔探测，**只在状态变化时**记日志（避免刷屏）。
 * 返回定时器句柄（已 unref，不会阻止进程退出）；intervalMs<=0 时返回 null（关闭巡检）。
 */
export function startServiceWatchdog(options: {
  intervalMs?: number;
  deps?: ServiceDependency[];
  /** 用启动自检的结果作为基线，这样第一次巡检就能正确识别「刚挂掉」 */
  initial?: ServiceProbeResult[];
  timeoutMs?: number;
} = {}): NodeJS.Timeout | null {
  const intervalMs = options.intervalMs ?? env.serviceCheck.intervalMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;

  const deps = options.deps ?? SERVICE_DEPS;
  const timeoutMs = options.timeoutMs ?? probeTimeoutMs();
  const last = new Map<string, ServiceDepStatus>();
  for (const r of options.initial ?? []) last.set(r.name, r.status);

  const timer = setInterval(() => {
    void (async () => {
      try {
        const results = await probeServices(deps, timeoutMs);
        for (const r of results) {
          const previous = last.get(r.name);
          last.set(r.name, r.status);
          if (previous === undefined || previous === r.status) continue;
          if (r.status === 'down') {
            logger.error(`[services] ${r.label} 已不可用`, { name: r.name, target: r.target, message: r.message });
          } else if (r.status === 'up') {
            logger.info(`[services] ${r.label} 已恢复`, { name: r.name, target: r.target, latencyMs: r.latencyMs });
          }
        }
      } catch (error) {
        logger.warn('[services] 依赖巡检失败', { error: String(error) });
      }
    })();
  }, intervalMs);

  // 巡检只是诊断手段，绝不能拖住进程退出
  timer.unref?.();
  return timer;
}

/** 供测试与 /internal/services 复用的详细视图 */
export function toServiceDetail(results: ServiceProbeResult[]) {
  const summary = summarize(results);
  const fatal = findFatalDeps(results);
  return {
    status: fatal.length > 0 ? 'not_ready' : 'ready',
    degraded: results.some((r) => r.kind !== 'core' && r.status === 'down'),
    checkedAt: new Date().toISOString(),
    summary,
    services: results,
  };
}
