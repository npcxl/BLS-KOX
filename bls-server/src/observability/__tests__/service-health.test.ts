/**
 * 服务依赖自检 —— 只测纯函数 + 调度逻辑。
 *
 * 全部使用**注入的假依赖**，不连接真实 MySQL / Redis / HTTP 服务：
 * 自检的价值在于「没开也能准确报出来」，所以必须能在什么都没有的环境里跑。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

// mock 掉 logger：一是断言「只在状态变化时记日志」，二是避免测试输出被报告刷屏
vi.mock('../../core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../../core/logger';
import {
  describeProbeError,
  displayWidth,
  findDegradedDeps,
  findFatalDeps,
  formatServiceReport,
  probeServices,
  probeWebSocket,
  reportStartupServices,
  startServiceWatchdog,
  summarize,
  toServiceDetail,
  type ServiceDepKind,
  type ServiceDepStatus,
  type ServiceDependency,
  type ServiceProbeResult,
} from '../service-health';

/** 可控的假依赖 */
function dep(overrides: Partial<ServiceDependency> & Pick<ServiceDependency, 'name'>): ServiceDependency {
  return {
    label: overrides.name,
    kind: 'optional',
    enabled: () => true,
    target: () => `http://127.0.0.1:1/${overrides.name}`,
    probe: async () => 'OK',
    ...overrides,
  };
}

/** 构造探测结果 */
function mk(
  name: string,
  kind: ServiceDepKind,
  status: ServiceDepStatus,
  extra: Partial<ServiceProbeResult> = {},
): ServiceProbeResult {
  return { name, label: name, kind, status, target: `t/${name}`, latencyMs: 1, message: status, ...extra };
}

function errWithCode(message: string, code: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

const log = () => logger as unknown as {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

describe('probeServices —— 状态分类', () => {
  it('按 enabled / probe 结果给出 up / down / disabled，并保留 kind 与耗时', async () => {
    const results = await probeServices([
      dep({ name: 'mysql', kind: 'core', probe: async () => '连接正常' }),
      dep({
        name: 'bls-event-service',
        probe: async () => { throw errWithCode('connect ECONNREFUSED', 'ECONNREFUSED'); },
      }),
      dep({ name: 'bls-ai-service', enabled: () => false }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['up', 'down', 'disabled']);
    expect(results.map((r) => r.kind)).toEqual(['core', 'optional', 'optional']);
    expect(results[0].message).toBe('连接正常');
    expect(results[1].message).toBe('连接被拒绝（服务未启动）');
    expect(results[2].message).toBe('未配置或已关闭');
    expect(results.every((r) => r.latencyMs >= 0)).toBe(true);
    expect(results[0].target).toContain('mysql');
  });

  it('探测超时 → down（自检自己不能挂住）', async () => {
    const neverSettles = new Promise<string>(() => { /* 永不结束 */ });
    const [result] = await probeServices([dep({ name: 'bls-captcha-service', probe: () => neverSettles })], 30);
    expect(result.status).toBe('down');
    expect(result.message).toContain('超时');
  });

  it('enabled() 抛错也不向上抛（自检不能把启动流程打挂）', async () => {
    const [result] = await probeServices([
      dep({ name: 'broken', enabled: () => { throw new Error('bad config'); } }),
    ]);
    expect(result.status).toBe('down');
    expect(result.message).toContain('bad config');
  });

  it('target() 抛错不影响探测结论', async () => {
    const [result] = await probeServices([
      dep({ name: 'no-target', target: () => { throw new Error('nope'); } }),
    ]);
    expect(result.status).toBe('up');
    expect(result.target).toBe('');
  });

  it('先预热再计时探测（模块编译慢不能被误判成服务没开）', async () => {
    const order: string[] = [];
    const deps = [dep({
      name: 'mysql',
      kind: 'core',
      warmup: async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        order.push('warmup');
      },
      probe: async () => { order.push('probe'); return 'OK'; },
    })];

    // 探测超时(30ms) 比预热(60ms) 更短：若预热被计入探测计时就会误判 down
    const [result] = await probeServices(deps, 30);
    expect(order).toEqual(['warmup', 'probe']);
    expect(result.status).toBe('up');
  });

  it('预热失败不影响探测（真实结论只由 probe 给出）', async () => {
    const [result] = await probeServices([
      dep({ name: 'mysql', kind: 'core', warmup: async () => { throw new Error('warmup boom'); } }),
    ], 200);
    expect(result.status).toBe('up');
  });
});

describe('describeProbeError —— 错误翻译', () => {
  it.each([
    ['ECONNREFUSED', '连接被拒绝（服务未启动）'],
    ['ENOTFOUND', '域名解析失败'],
    ['ETIMEDOUT', '连接超时'],
    ['ER_ACCESS_DENIED_ERROR', '认证失败（账号或密码错误）'],
  ])('%s → %s', (code, expected) => {
    expect(describeProbeError(errWithCode('x', code))).toBe(expected);
  });

  it('其余 ER_* 归一到 MySQL 错误', () => {
    expect(describeProbeError(errWithCode('x', 'ER_NO_SUCH_TABLE'))).toBe('MySQL 错误 ER_NO_SUCH_TABLE');
  });

  it('AbortSignal.timeout 的 TimeoutError 识别为超时', () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    expect(describeProbeError(error)).toBe('探测超时');
  });

  it('未知错误保留原始 message 并截断，null 归为未知错误', () => {
    expect(describeProbeError(new Error('a'.repeat(500)))).toHaveLength(140);
    expect(describeProbeError(undefined)).toBe('未知错误');
  });
});

describe('致命 / 降级判定', () => {
  const results: ServiceProbeResult[] = [
    mk('mysql', 'core', 'up'),
    mk('redis', 'core', 'down'),
    mk('bls-event-service', 'optional', 'down'),
    mk('bls-ai-service', 'optional', 'disabled'),
    mk('bls-captcha-service', 'conditional', 'down'),
  ];

  it('只有 core + down 才算致命（决定是否拒绝启动 / 返回 503）', () => {
    expect(findFatalDeps(results).map((r) => r.name)).toEqual(['redis']);
  });

  it('非核心 down 记为降级（功能不完整，但主体可服务）', () => {
    expect(findDegradedDeps(results).map((r) => r.name))
      .toEqual(['bls-event-service', 'bls-captcha-service']);
  });

  it('计数汇总', () => {
    expect(summarize(results)).toEqual({ total: 5, up: 1, down: 3, disabled: 1 });
  });
});

describe('formatServiceReport —— KOX 服务检测表', () => {
  const sample = (): ServiceProbeResult[] => [
    mk('mysql', 'core', 'up', {
      latencyMs: 12,
      message: '连接正常（kox）',
      target: '117.72.118.165:3306/kox',
    }),
    mk('bls-event-service', 'optional', 'down', {
      message: '连接被拒绝（服务未启动）',
      target: 'http://127.0.0.1:7101',
      startHint: 'cd bls-event-service && npm run dev',
    }),
    mk('bls-ai-service', 'optional', 'disabled', { target: '' }),
  ];

  const tableLines = (text: string): string[] =>
    text.split('\n').filter((line) => /^[┌│├└]/.test(line));

  it('只有这一张表：表头与状态标记齐全，且不带汇总行 / 处理建议段落', () => {
    const text = formatServiceReport(sample());
    // 标题文字由默认参数决定（可注入），这里只校验「第一行是带标题的表格顶边」
    expect(text.split('\n')[0]).toMatch(/^┌─+ .+ ─+┐$/);
    for (const header of ['状态', '服务', '类别', '耗时', '地址', '检测结果']) {
      expect(text).toContain(header);
    }
    expect(text).toContain('[ OK ]');
    expect(text).toContain('[FAIL]');
    expect(text).toContain('[SKIP]');
    expect(text).toContain('mysql');
    expect(text).toContain('http://127.0.0.1:7101');
    // 这两段已被移除，表格是唯一输出
    expect(text).not.toContain('汇总');
    expect(text).not.toContain('处理建议');
    expect(text).not.toContain('cd bls-event-service');
    expect(text.trimEnd().endsWith('┘')).toBe(true);
  });

  it('表格标题可注入', () => {
    expect(formatServiceReport(sample(), '自定义标题').split('\n')[0]).toContain('自定义标题');
  });

  it('表格每行显示宽度完全一致（中文按 2 列计算，不会错位）', () => {
    const lines = tableLines(formatServiceReport(sample()));
    expect(lines.length).toBeGreaterThan(5);
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
  });

  it('未配置 / 无地址的依赖显示占位符而不是空单元格', () => {
    const text = formatServiceReport([
      mk('bls-ai-service', 'optional', 'disabled', { target: '', latencyMs: 0 }),
    ]);
    expect(text).toContain('—');
  });

  it('超长检测结果按显示宽度折行，仍保持表格对齐', () => {
    const long = '健康检查未通过（非 2xx 或响应体不是合法 JSON）：上游返回了一段很长的错误信息，用来验证折行行为不会撑破表格';
    const text = formatServiceReport([
      mk('bls-captcha-service', 'conditional', 'down', { message: long, startHint: 'mvn spring-boot:run' }),
    ]);
    const lines = tableLines(text);
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
    expect(text).toContain('健康检查未通过');
  });
});

describe('reportStartupServices —— 启动输出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => { /* 静音表格正文 */ });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('只打这一张表（表格之外不再有 WARN/ERROR 结构化日志，避免重复噪音）', () => {
    reportStartupServices([
      mk('mysql', 'core', 'up'),
      mk('bls-ai-service', 'optional', 'down', { message: '连接被拒绝（服务未启动）' }),
      mk('bls-captcha-service', 'conditional', 'down', { message: '连接被拒绝（服务未启动）' }),
    ]);
    expect(console.log).toHaveBeenCalledTimes(1);
    const printed = String(vi.mocked(console.log).mock.calls[0][0]);
    expect(printed).toMatch(/^┌/); // 表格顶边（标题文字可注入，不在此断言）
    expect(printed).toContain('bls-captcha-service');
    expect(log().warn).not.toHaveBeenCalled();
    expect(log().error).not.toHaveBeenCalled();
  });
});

describe('地址列着色', () => {
  const sample = (): ServiceProbeResult[] => [
    mk('mysql', 'core', 'up', { target: '127.0.0.1:3306' }),
    mk('bls-ai-service', 'optional', 'down', { target: '127.0.0.1:7201' }),
    mk('bls-event-service', 'optional', 'disabled', { target: '' }),
  ];

  afterEach(() => { vi.unstubAllEnvs(); });

  it('非 TTY 且未强制着色 → 纯文本（日志文件里不该出现转义字符）', () => {
    vi.stubEnv('FORCE_COLOR', '0');
    expect(formatServiceReport(sample())).not.toContain('\u001b[');
  });

  it('连通=绿、不通=红、未配置=灰', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    const text = formatServiceReport(sample());
    expect(text).toContain('\u001b[32m127.0.0.1:3306');
    expect(text).toContain('\u001b[31m127.0.0.1:7201');
    expect(text).toContain('\u001b[90m—');
  });

  it('着色不影响对齐（ANSI 序列不计入显示宽度）', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    const text = formatServiceReport(sample());
    const lines = text.split('\n').filter((line) => /^[┌│├└]/.test(line));
    expect(text).toContain('\u001b['); // 确实着色了
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
  });
});

describe('toServiceDetail —— 内部详细视图（/internal/services）', () => {
  it('核心依赖不可用 → not_ready；仅非核心不可用 → ready + degraded', () => {
    const notReady = toServiceDetail([mk('mysql', 'core', 'down'), mk('redis', 'core', 'up')]);
    expect(notReady.status).toBe('not_ready');
    expect(notReady.degraded).toBe(false);

    const ready = toServiceDetail([mk('mysql', 'core', 'up'), mk('bls-ai-service', 'optional', 'down')]);
    expect(ready.status).toBe('ready');
    expect(ready.degraded).toBe(true);
    expect(ready.services).toHaveLength(2);
    expect(typeof ready.checkedAt).toBe('string');
  });
});

describe('probeWebSocket —— Koa 实时通道探测', () => {
  it('握手成功 → 判定可用；路径不对 → 判定不可用', async () => {
    const server = new WebSocketServer({ port: 0, path: '/ws/realtime' });
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;

    await expect(probeWebSocket(`ws://127.0.0.1:${port}/ws/realtime`, 2_000)).resolves.toContain('握手');
    // 路径写错必须被判为不可用（否则「WS 挂载没了」会被漏掉）
    await expect(probeWebSocket(`ws://127.0.0.1:${port}/nope`, 2_000)).rejects.toThrow();

    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  it('端口无人监听 → 抛出（连接被拒绝）', async () => {
    // 先占用一个空闲端口再关掉，确保探测目标确实没人监听
    const placeholder = new WebSocketServer({ port: 0 });
    await once(placeholder, 'listening');
    const port = (placeholder.address() as AddressInfo).port;
    await new Promise<void>((resolve) => { placeholder.close(() => resolve()); });

    await expect(probeWebSocket(`ws://127.0.0.1:${port}`, 2_000)).rejects.toThrow();
  });
});

describe('startServiceWatchdog —— 运行期巡检', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it('intervalMs <= 0 → 关闭巡检', () => {
    expect(startServiceWatchdog({ intervalMs: 0, deps: [] })).toBeNull();
  });

  it('只在下线 / 恢复的瞬间记日志，状态不变时不重复记录', async () => {
    let healthy = true;
    const deps = [dep({
      name: 'bls-event-service',
      label: '事件/审计微服务',
      probe: async () => {
        if (!healthy) throw errWithCode('connect ECONNREFUSED', 'ECONNREFUSED');
        return 'HTTP 200';
      },
    })];

    const timer = startServiceWatchdog({
      intervalMs: 1_000,
      deps,
      initial: [mk('bls-event-service', 'optional', 'up')],
    });
    expect(timer).not.toBeNull();

    // 仍然正常 → 不记录
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log().error).not.toHaveBeenCalled();

    // 掉线 → 记一次 error
    healthy = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log().error).toHaveBeenCalledWith(
      '[services] 事件/审计微服务 已不可用',
      expect.objectContaining({ name: 'bls-event-service', target: expect.stringContaining('bls-event-service') }),
    );

    // 持续掉线 → 不刷屏
    await vi.advanceTimersByTimeAsync(2_000);
    const downLogs = log().error.mock.calls.filter((c) => String(c[0]).includes('已不可用'));
    expect(downLogs).toHaveLength(1);

    // 恢复 → 记一次 info
    healthy = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log().info).toHaveBeenCalledWith(
      '[services] 事件/审计微服务 已恢复',
      expect.objectContaining({ name: 'bls-event-service' }),
    );

    if (timer) clearInterval(timer);
  });

  it('依赖探测抛错时巡检自身不抛出（进程安全，只记状态变化）', async () => {
    const deps = [dep({ name: 'boom', probe: async () => { throw errWithCode('x', 'ECONNREFUSED'); } })];
    const timer = startServiceWatchdog({
      intervalMs: 1_000,
      deps,
      initial: [mk('boom', 'optional', 'up')],
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log().error).toHaveBeenCalledWith('[services] boom 已不可用', expect.anything());
    if (timer) clearInterval(timer);
  });
});
