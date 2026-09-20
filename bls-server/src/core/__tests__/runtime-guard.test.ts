/**
 * 运行时环境守卫测试
 *
 * 覆盖：Node 版本门槛、关键能力探测、exit 行为与提示文案。
 * 背景见 `src/core/runtime-guard.ts` 顶部注释（旧 Node 上 toSorted / ReadableStream 缺失）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REQUIRED_NODE_MAJOR,
  assertSupportedRuntime,
  checkRuntime,
  renderRuntimeProblems,
  snapshotRuntime,
  type RuntimeSnapshot,
} from '../runtime-guard';

/** 生成能力表：默认全部为 true，可用 overrides 关掉指定项 */
function caps(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  const allTrue: Record<string, boolean> = {};
  for (const key of Object.keys(snapshotRuntime().capabilities)) allTrue[key] = true;
  return { ...allTrue, ...overrides };
}

/** Node 16 + 全部能力（模拟「版本过低」这一单独问题） */
function node16Snapshot(): RuntimeSnapshot {
  return { nodeVersion: '16.20.2', capabilities: caps() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkRuntime', () => {
  it('当前运行环境通过校验（Node >= 22 且能力齐全）', () => {
    expect(checkRuntime()).toEqual([]);
  });

  it('Node 16 被判定为版本过低', () => {
    const problems = checkRuntime(node16Snapshot());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('版本过低');
    expect(problems[0]).toContain('16.20.2');
    expect(problems[0]).toContain(String(REQUIRED_NODE_MAJOR));
  });

  it('Node 18 缺 toSorted 时两个问题都会报出（版本过低 + 缺能力）', () => {
    const problems = checkRuntime({
      nodeVersion: '18.20.4',
      capabilities: caps({ 'Array.prototype.toSorted': false }),
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('版本过低');
    expect(problems.join('\n')).toContain('Array.prototype.toSorted');
    expect(problems.join('\n')).toContain('arr.toSorted is not a function');
  });

  it('缺少全局 ReadableStream 会被检出', () => {
    const problems = checkRuntime({
      nodeVersion: '16.20.2',
      capabilities: caps({ ReadableStream: false }),
    });
    expect(problems.some((p) => p.includes('ReadableStream is not defined'))).toBe(true);
  });

  it('每一项能力缺失都会被独立报告', () => {
    const keys = Object.keys(snapshotRuntime().capabilities);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const problems = checkRuntime({ nodeVersion: '22.12.0', capabilities: caps({ [key]: false }) });
      expect(problems, `缺失 ${key} 时应报告问题`).toHaveLength(1);
      expect(problems[0]).toContain(key);
    }
  });

  it('版本通过且能力齐全时没有问题（Node 22）', () => {
    expect(checkRuntime({ nodeVersion: '22.12.0', capabilities: caps() })).toEqual([]);
  });
});

describe('assertSupportedRuntime', () => {
  it('环境不满足要求时打印修复指引并以状态 1 退出', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    expect(() => assertSupportedRuntime({ snapshot: node16Snapshot() })).toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const printed = errorSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(printed).toContain('运行环境不满足要求');
    expect(printed).toContain('nvm use');
  });

  it('exit: false 时只告警，不终止进程（供被 import 的场景使用）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    expect(() => assertSupportedRuntime({ exit: false, snapshot: node16Snapshot() })).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('环境满足要求时静默通过', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    assertSupportedRuntime({ snapshot: { nodeVersion: '22.12.0', capabilities: caps() } });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('renderRuntimeProblems', () => {
  it('提示中包含 .nvmrc 与 Docker 两条修复路径', () => {
    const lines = renderRuntimeProblems(['Node.js 版本过低'], '16.20.2').join('\n');
    expect(lines).toContain('16.20.2');
    expect(lines).toContain('.nvmrc');
    expect(lines).toContain('node:22-alpine');
  });
});
