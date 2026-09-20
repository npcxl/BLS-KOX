/**
 * 运行时环境守卫（Runtime Guard）
 *
 * 背景：bls-server 要求 Node.js >= 22（`package.json` engines、仓库根 `.nvmrc`、
 * `Dockerfile` 的 node:22-alpine，以及 Kysely 0.29 自身声明的 `engines.node >= 22`）。
 *
 * 在更旧的 Node 上进程**可以正常启动、HTTP 端口也能监听**，但会在运行期抛出极难定位的错误：
 *
 *   - `TypeError: arr.toSorted is not a function`        ← Kysely 查询编译器使用 Array#toSorted（Node 20+）
 *   - `ReferenceError: ReadableStream is not defined`    ← 全局 ReadableStream（Node 18+）
 *
 * 结果是「服务看似已启动，但 worker / outbox-publisher 每 2~3 秒报一次同样的错误」，属于假可用状态。
 * 因此这里在进程入口做一次能力探测：不满足要求就打印可执行的修复指引并终止进程。
 *
 * 注意：本模块只做运行时探测，不依赖任何业务模块（logger 也不使用，保证即使日志链路异常也能输出）。
 */

/** 最低支持的 Node.js 主版本（与 package.json engines / .nvmrc / Dockerfile 保持一致） */
export const REQUIRED_NODE_MAJOR = 22;

interface Capability {
  /** 能力名称（同时作为快照里的 key） */
  name: string;
  /** 缺失后会发生什么（写清楚具体报错，便于对号入座） */
  impact: string;
  /** 探测该能力是否存在 */
  present: () => boolean;
}

/** 运行期真正被用到的现代 API：缺失即代表当前 Node 不受支持 */
const REQUIRED_CAPABILITIES: Capability[] = [
  {
    name: 'Array.prototype.toSorted',
    impact: 'Kysely 编译查询时抛 TypeError: arr.toSorted is not a function（worker / outbox 轮询会持续报错）',
    present: () => typeof (Array.prototype as unknown as Record<string, unknown>).toSorted === 'function',
  },
  {
    name: 'Array.prototype.toReversed',
    impact: '查询编译中使用的 ES2023 数组复制方法缺失，抛 TypeError: arr.toReversed is not a function',
    present: () => typeof (Array.prototype as unknown as Record<string, unknown>).toReversed === 'function',
  },
  {
    name: 'Object.groupBy',
    impact: '依赖库按 key 分组时抛 TypeError: Object.groupBy is not a function',
    present: () => typeof (Object as unknown as Record<string, unknown>).groupBy === 'function',
  },
  {
    name: 'structuredClone',
    impact: '深拷贝场景抛 ReferenceError: structuredClone is not defined',
    present: () => typeof (globalThis as unknown as Record<string, unknown>).structuredClone === 'function',
  },
  {
    name: 'ReadableStream',
    impact: '流式响应（AI SSE 代理、文件下载）抛 ReferenceError: ReadableStream is not defined',
    present: () => typeof (globalThis as unknown as Record<string, unknown>).ReadableStream === 'function',
  },
  {
    name: 'fetch',
    impact: '对外 HTTP 调用（Webhook 投递、AI Provider）抛 ReferenceError: fetch is not defined',
    present: () => typeof (globalThis as unknown as Record<string, unknown>).fetch === 'function',
  },
];

export interface RuntimeSnapshot {
  /** `process.versions.node` */
  nodeVersion: string;
  /** 能力名 → 是否存在 */
  capabilities: Record<string, boolean>;
}

/** 当前运行时的能力快照（可注入，便于单测） */
export function snapshotRuntime(): RuntimeSnapshot {
  const capabilities: Record<string, boolean> = {};
  for (const cap of REQUIRED_CAPABILITIES) {
    try {
      capabilities[cap.name] = cap.present();
    } catch {
      capabilities[cap.name] = false;
    }
  }
  return { nodeVersion: process.versions.node, capabilities };
}

/**
 * 校验运行时环境，返回问题列表（纯函数，无副作用）。
 * @param input 省略时检测真实运行环境
 */
export function checkRuntime(input: RuntimeSnapshot = snapshotRuntime()): string[] {
  const problems: string[] = [];

  const major = Number.parseInt(String(input.nodeVersion).split('.')[0] ?? '', 10);
  if (!Number.isFinite(major) || major < REQUIRED_NODE_MAJOR) {
    problems.push(`Node.js 版本过低：当前 v${input.nodeVersion}，要求 v${REQUIRED_NODE_MAJOR}.0.0 及以上`);
  }

  for (const cap of REQUIRED_CAPABILITIES) {
    if (input.capabilities[cap.name] === false) {
      problems.push(`缺少 ${cap.name} — ${cap.impact}`);
    }
  }

  return problems;
}

/** 渲染成人可读的多行提示 */
export function renderRuntimeProblems(problems: string[], nodeVersion: string): string[] {
  return [
    `[runtime] 运行环境不满足要求，已阻止启动（当前 Node v${nodeVersion}）：`,
    ...problems.map((p) => `  - ${p}`),
    '[runtime] 修复方式（任选其一）：',
    `  1) 切换到 Node ${REQUIRED_NODE_MAJOR}：nvm use ${REQUIRED_NODE_MAJOR}（仓库根 .nvmrc 已固定为 ${REQUIRED_NODE_MAJOR}）`,
    `  2) 用符合要求的 Node 直接启动：<node-${REQUIRED_NODE_MAJOR}-path>/node dist/app.js`,
    '  3) 使用 Docker 启动（Dockerfile 已固定 node:22-alpine）',
    '[runtime] 注意：请确认执行 npm run dev / node dist/app.js 的终端与 node -v 是同一个 Node（多版本共存时极易踩坑）。',
  ];
}

/**
 * 进程入口调用：环境不满足要求时打印指引并退出。
 *
 * @param options.exit     false 时只打印告警（用于被单测等场景 import 本模块）；
 *                         默认 true（终止进程）
 * @param options.snapshot 注入快照（仅单测使用）
 */
export function assertSupportedRuntime(
  options: { exit?: boolean; snapshot?: RuntimeSnapshot } = {},
): void {
  const snapshot = options.snapshot ?? snapshotRuntime();
  const problems = checkRuntime(snapshot);
  if (problems.length === 0) return;

  for (const line of renderRuntimeProblems(problems, snapshot.nodeVersion)) console.error(line);

  if (options.exit === false) return;
  process.exit(1);
}
