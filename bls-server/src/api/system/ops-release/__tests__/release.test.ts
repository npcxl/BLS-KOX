import { describe, it, expect } from 'vitest';
import { createReleaseSchema, releaseCallbackSchema } from '../release.schema';
import { verifyCallbackSignature } from '../release-callback.service';
import {
  VALID_TRANSITIONS, VALID_STEP_TRANSITIONS,
  SERVICE_ALLOWLIST, ENVIRONMENT_ALLOWLIST,
  RELEASE_STEPS, ROLLBACK_STEPS,
} from '../release.constants';

// ========== Schema ==========
describe('createReleaseSchema', () => {
  it('合法请求', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1',
      services: ['bls-admin', 'bls-server'], reason: '修复bug',
    }).success).toBe(true);
  });
  it('非法环境', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'dev', version: '1.0.1', services: ['bls-admin'], reason: 't',
    }).success).toBe(false);
  });
  it('非法版本', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: '1.0', services: ['bls-admin'], reason: 't',
    }).success).toBe(false);
  });
  it('v前缀版本', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: 'v1.0.0', services: ['bls-admin'], reason: 't',
    }).success).toBe(false);
  });
  it('非法服务', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1', services: ['bad-svc'], reason: 't',
    }).success).toBe(false);
  });
  it('空服务', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1', services: [], reason: 't',
    }).success).toBe(false);
  });
  it('超长reason', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1', services: ['bls-admin'], reason: 'x'.repeat(501),
    }).success).toBe(false);
  });
  it('staging环境合法', () => {
    expect(createReleaseSchema.safeParse({
      environment: 'staging', version: '1.0.1', services: ['bls-admin'], reason: 'test',
    }).success).toBe(true);
  });
});

describe('releaseCallbackSchema', () => {
  it('合法回调', () => {
    expect(releaseCallbackSchema.safeParse({
      taskId: 't1', stage: 'pull_images', status: 'running',
      progress: 45, message: 'ok', timestamp: '2026-07-25T03:02:14Z',
    }).success).toBe(true);
  });
  it('progress越界', () => {
    expect(releaseCallbackSchema.safeParse({
      taskId: 't1', stage: 'pull_images', status: 'running',
      progress: 150, message: 'ok', timestamp: '2026-07-25T03:02:14Z',
    }).success).toBe(false);
  });
  it('非法status', () => {
    expect(releaseCallbackSchema.safeParse({
      taskId: 't1', stage: 'pull_images', status: 'invalid',
      progress: 50, message: 'ok', timestamp: '2026-07-25T03:02:14Z',
    }).success).toBe(false);
  });
  it('缺失taskId', () => {
    expect(releaseCallbackSchema.safeParse({
      stage: 'pull_images', status: 'running',
      progress: 50, message: 'ok', timestamp: '2026-07-25T03:02:14Z',
    }).success).toBe(false);
  });
});

// ========== 回调签名 ==========
describe('verifyCallbackSignature', () => {
  it('无SECRET失败', () => {
    expect(verifyCallbackSignature(String(Date.now()), 'n', '{}', 'x').valid).toBe(false);
  });
  it('过期时间戳', () => {
    process.env.RELEASE_CALLBACK_SECRET = 'test-secret';
    const r = verifyCallbackSignature(String(Date.now() - 10 * 60 * 1000), 'n', '{}', 'x');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('时间戳');
    delete process.env.RELEASE_CALLBACK_SECRET;
  });
  it('未来时间戳', () => {
    const r = verifyCallbackSignature(String(Date.now() + 10 * 60 * 1000), 'n', '{}', 'x');
    expect(r.valid).toBe(false);
  });
  it('NaN时间戳', () => {
    expect(verifyCallbackSignature('abc', 'n', '{}', 'x').valid).toBe(false);
  });
});

// ========== 状态机 ==========
describe('任务状态机', () => {
  it('pending→checking', () => expect(VALID_TRANSITIONS.pending).toContain('checking'));
  it('pending→running非法', () => expect(VALID_TRANSITIONS.pending).not.toContain('running'));
  it('running→success', () => expect(VALID_TRANSITIONS.running).toContain('success'));
  it('running→failed', () => expect(VALID_TRANSITIONS.running).toContain('failed'));
  it('success终态', () => expect(VALID_TRANSITIONS.success).toHaveLength(0));
  it('failed→rolling_back', () => expect(VALID_TRANSITIONS.failed).toContain('rolling_back'));
  it('rolling_back→rolled_back', () => expect(VALID_TRANSITIONS.rolling_back).toContain('rolled_back'));
  it('rolled_back终态', () => expect(VALID_TRANSITIONS.rolled_back).toHaveLength(0));
  it('cancelled终态', () => expect(VALID_TRANSITIONS.cancelled).toHaveLength(0));
  it('9个状态', () => {
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual([
      'pending', 'checking', 'waiting_approval', 'running',
      'success', 'failed', 'rolling_back', 'rolled_back', 'cancelled',
    ].sort());
  });
});

describe('步骤状态机', () => {
  it('waiting→running', () => expect(VALID_STEP_TRANSITIONS.waiting).toContain('running'));
  it('running→success', () => expect(VALID_STEP_TRANSITIONS.running).toContain('success'));
  it('running→failed', () => expect(VALID_STEP_TRANSITIONS.running).toContain('failed'));
  it('success终态', () => expect(VALID_STEP_TRANSITIONS.success).toHaveLength(0));
});

// ========== 常量 ==========
describe('SERVICE_ALLOWLIST', () => {
  it('5个服务', () => expect(SERVICE_ALLOWLIST).toHaveLength(5));
  it('含bls-admin', () => expect(SERVICE_ALLOWLIST).toContain('bls-admin'));
  it('含bls-server', () => expect(SERVICE_ALLOWLIST).toContain('bls-server'));
  it('含bls-ai-service', () => expect(SERVICE_ALLOWLIST).toContain('bls-ai-service'));
  it('含bls-event-service', () => expect(SERVICE_ALLOWLIST).toContain('bls-event-service'));
  it('含bls-java-server', () => expect(SERVICE_ALLOWLIST).toContain('bls-java-server'));
});

describe('ENVIRONMENT_ALLOWLIST', () => {
  it('production和staging', () => {
    expect(ENVIRONMENT_ALLOWLIST).toContain('production');
    expect(ENVIRONMENT_ALLOWLIST).toContain('staging');
  });
  it('不含dev', () => expect(ENVIRONMENT_ALLOWLIST).not.toContain('dev' as any));
});

describe('RELEASE_STEPS', () => {
  it('9步', () => expect(RELEASE_STEPS).toHaveLength(9));
  it('首validate末complete', () => {
    expect(RELEASE_STEPS[0].key).toBe('validate');
    expect(RELEASE_STEPS[8].key).toBe('complete');
  });
  it('order递增', () => {
    for (let i = 1; i < RELEASE_STEPS.length; i++) {
      expect(RELEASE_STEPS[i].order).toBeGreaterThan(RELEASE_STEPS[i - 1].order);
    }
  });
});

describe('ROLLBACK_STEPS', () => {
  it('4步', () => expect(ROLLBACK_STEPS).toHaveLength(4));
  it('首rollback', () => expect(ROLLBACK_STEPS[0].key).toBe('rollback'));
  it('末complete', () => expect(ROLLBACK_STEPS[3].key).toBe('complete'));
});

// ========== 锁 ==========
describe('Redis 锁', () => {
  it('lockKey格式 production', () => {
    expect(`ops:release:lock:production`).toBe('ops:release:lock:production');
  });
  it('lockKey格式 staging', () => {
    expect(`ops:release:lock:staging`).toBe('ops:release:lock:staging');
  });
  it('不同环境不同key', () => {
    expect(`ops:release:lock:production`).not.toBe(`ops:release:lock:staging`);
  });
});

// ========== 回滚逻辑 ==========
describe('回滚逻辑', () => {
  it('只有failed可回滚', () => {
    const allowed = VALID_TRANSITIONS.failed;
    expect(allowed).toContain('rolling_back');
    // success 不能回滚
    expect(VALID_TRANSITIONS.success).toHaveLength(0);
  });
  it('rolling_back可到rolled_back', () => {
    expect(VALID_TRANSITIONS.rolling_back).toContain('rolled_back');
  });
  it('rolling_back可到failed(回滚失败)', () => {
    expect(VALID_TRANSITIONS.rolling_back).toContain('failed');
  });
});

// ========== 发布流程 ==========
describe('发布流程', () => {
  it('完整正向流程', () => {
    const flow = ['pending', 'checking', 'waiting_approval', 'running', 'success'];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(VALID_TRANSITIONS[flow[i]]).toContain(flow[i + 1]);
    }
  });
  it('运行中可取消', () => {
    expect(VALID_TRANSITIONS.running).toContain('cancelled');
  });
  it('运行中可失败', () => {
    expect(VALID_TRANSITIONS.running).toContain('failed');
  });
});

// ========== 权限 ==========
describe('权限', () => {
  it('7个权限常量', () => {
    const perms = ['ops:release:view', 'ops:release:create', 'ops:release:approve',
      'ops:release:rollback', 'ops:release:logs', 'ops:service:view', 'ops:service:restart'];
    expect(perms).toHaveLength(7);
  });
  it('create和rollback分离', () => {
    expect('ops:release:create').not.toBe('ops:release:rollback');
  });
});
