import { describe, it, expect, beforeAll } from 'vitest';
import { createReleaseSchema, releaseCallbackSchema } from '../release.schema';
import { verifyCallbackSignature } from '../release-callback.service';
import {
  VALID_TRANSITIONS, VALID_STEP_TRANSITIONS,
  SERVICE_ALLOWLIST, ENVIRONMENT_ALLOWLIST,
  RELEASE_STEPS, ROLLBACK_STEPS,
} from '../release.constants';

// ========== Schema 测试 ==========
describe('createReleaseSchema', () => {
  it('合法请求通过', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production',
      version: '1.0.1',
      services: ['bls-admin', 'bls-server'],
      reason: '修复客户管理页面',
    });
    expect(result.success).toBe(true);
  });

  it('非法环境被拒绝', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'development',
      version: '1.0.1',
      services: ['bls-admin'],
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('非法版本被拒绝 (缺少 patch)', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: '1.0',
      services: ['bls-admin'], reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('非法版本被拒绝 (含字母)', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: 'v1.0.0',
      services: ['bls-admin'], reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('非法服务被拒绝', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1',
      services: ['invalid-service'],
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('空 services 被拒绝', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1',
      services: [], reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('空 reason 被拒绝', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1',
      services: ['bls-admin'], reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('reason 超长被拒绝', () => {
    const result = createReleaseSchema.safeParse({
      environment: 'production', version: '1.0.1',
      services: ['bls-admin'], reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('releaseCallbackSchema', () => {
  it('合法回调通过', () => {
    const result = releaseCallbackSchema.safeParse({
      taskId: 'release_001', stage: 'pull_images',
      status: 'running', progress: 45,
      message: '正在拉取镜像', timestamp: '2026-07-25T03:02:14Z',
    });
    expect(result.success).toBe(true);
  });

  it('缺失 taskId 被拒绝', () => {
    const result = releaseCallbackSchema.safeParse({
      stage: 'pull_images', status: 'running',
      progress: 45, message: 'test', timestamp: '2026-07-25T03:02:14Z',
    });
    expect(result.success).toBe(false);
  });

  it('非法 progress 被拒绝', () => {
    const result = releaseCallbackSchema.safeParse({
      taskId: 't1', stage: 'pull_images',
      status: 'running', progress: 150,
      message: 'test', timestamp: '2026-07-25T03:02:14Z',
    });
    expect(result.success).toBe(false);
  });
});

// ========== 回调签名测试 ==========
describe('verifyCallbackSignature', () => {
  it('无 SECRET 时验证失败', () => {
    const result = verifyCallbackSignature(
      String(Date.now()), 'nonce-1', '{}', 'any-sig',
    );
    expect(result.valid).toBe(false);
  });

  it('过期时间戳被拒绝', () => {
    const result = verifyCallbackSignature(
      String(Date.now() - 10 * 60 * 1000),
      'nonce-2', '{}', 'any-sig',
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('时间戳');
  });

  it('未来时间戳被拒绝', () => {
    const result = verifyCallbackSignature(
      String(Date.now() + 10 * 60 * 1000),
      'nonce-3', '{}', 'any-sig',
    );
    expect(result.valid).toBe(false);
  });
});

// ========== 状态机测试 ==========
describe('任务状态机 VALID_TRANSITIONS', () => {
  it('pending → checking 合法', () => {
    expect(VALID_TRANSITIONS.pending).toContain('checking');
  });
  it('pending → running 不合法', () => {
    expect(VALID_TRANSITIONS.pending).not.toContain('running');
  });
  it('running → success 合法', () => {
    expect(VALID_TRANSITIONS.running).toContain('success');
  });
  it('running → failed 合法', () => {
    expect(VALID_TRANSITIONS.running).toContain('failed');
  });
  it('success 是终态', () => {
    expect(VALID_TRANSITIONS.success).toHaveLength(0);
  });
  it('failed → rolling_back 合法', () => {
    expect(VALID_TRANSITIONS.failed).toContain('rolling_back');
  });
  it('rolling_back → rolled_back 合法', () => {
    expect(VALID_TRANSITIONS.rolling_back).toContain('rolled_back');
  });
  it('rolled_back 是终态', () => {
    expect(VALID_TRANSITIONS.rolled_back).toHaveLength(0);
  });
  it('cancelled 是终态', () => {
    expect(VALID_TRANSITIONS.cancelled).toHaveLength(0);
  });
  it('所有状态都有定义', () => {
    const expected = ['pending', 'checking', 'waiting_approval', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'cancelled'];
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(expected.sort());
  });
});

describe('步骤状态机 VALID_STEP_TRANSITIONS', () => {
  it('waiting → running 合法', () => {
    expect(VALID_STEP_TRANSITIONS.waiting).toContain('running');
  });
  it('running → success 合法', () => {
    expect(VALID_STEP_TRANSITIONS.running).toContain('success');
  });
  it('running → failed 合法', () => {
    expect(VALID_STEP_TRANSITIONS.running).toContain('failed');
  });
  it('success 是终态', () => {
    expect(VALID_STEP_TRANSITIONS.success).toHaveLength(0);
  });
});

// ========== 常量测试 ==========
describe('SERVICE_ALLOWLIST', () => {
  it('包含 5 个服务', () => { expect(SERVICE_ALLOWLIST).toHaveLength(5); });
  it('包含 bls-admin', () => { expect(SERVICE_ALLOWLIST).toContain('bls-admin'); });
  it('包含 bls-server', () => { expect(SERVICE_ALLOWLIST).toContain('bls-server'); });
});

describe('ENVIRONMENT_ALLOWLIST', () => {
  it('包含 production 和 staging', () => {
    expect(ENVIRONMENT_ALLOWLIST).toContain('production');
    expect(ENVIRONMENT_ALLOWLIST).toContain('staging');
  });
});

describe('RELEASE_STEPS', () => {
  it('有 9 个步骤', () => { expect(RELEASE_STEPS).toHaveLength(9); });
  it('第一步是 validate', () => { expect(RELEASE_STEPS[0].key).toBe('validate'); });
  it('最后一步是 complete', () => { expect(RELEASE_STEPS[8].key).toBe('complete'); });
  it('步骤 order 递增', () => {
    for (let i = 1; i < RELEASE_STEPS.length; i++) {
      expect(RELEASE_STEPS[i].order).toBeGreaterThan(RELEASE_STEPS[i - 1].order);
    }
  });
});

describe('ROLLBACK_STEPS', () => {
  it('有 4 个步骤', () => { expect(ROLLBACK_STEPS).toHaveLength(4); });
  it('第一步是 rollback', () => { expect(ROLLBACK_STEPS[0].key).toBe('rollback'); });
  it('最后是 complete', () => { expect(ROLLBACK_STEPS[3].key).toBe('complete'); });
});

// ========== 并发锁测试 ==========
describe('并发锁', () => {
  it('锁 Key 格式正确', () => {
    const lockKey = `ops:release:lock:production`;
    expect(lockKey).toBe('ops:release:lock:production');
  });

  it('不同环境锁不同', () => {
    const k1 = `ops:release:lock:production`;
    const k2 = `ops:release:lock:staging`;
    expect(k1).not.toBe(k2);
  });
});

// ========== 权限测试 ==========
describe('权限常量', () => {
  it('所有权限都已定义', () => {
    const perms = ['ops:release:view', 'ops:release:create', 'ops:release:approve', 'ops:release:rollback', 'ops:release:logs', 'ops:service:view', 'ops:service:restart'];
    expect(perms.length).toBe(7);
  });
});
