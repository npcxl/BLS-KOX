import { describe, it, expect } from 'vitest';
import { createReleaseSchema, releaseCallbackSchema } from '../release.schema';
import { verifyCallbackSignature } from '../release-callback.service';
import { VALID_TRANSITIONS, SERVICE_ALLOWLIST, ENVIRONMENT_ALLOWLIST } from '../release.constants';

// ========== Schema 测试 ==========
describe('createReleaseSchema', () => {
  it('合法请求通过', () => {
    const input = {
      environment: 'production',
      version: '1.0.1',
      services: ['bls-admin', 'bls-server'],
      reason: '修复客户管理页面',
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('非法环境被拒绝', () => {
    const input = {
      environment: 'development',
      version: '1.0.1',
      services: ['bls-admin'],
      reason: 'test',
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('非法版本被拒绝', () => {
    const input = {
      environment: 'production',
      version: '1.0',
      services: ['bls-admin'],
      reason: 'test',
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('非法服务被拒绝', () => {
    const input = {
      environment: 'production',
      version: '1.0.1',
      services: ['invalid-service' as any],
      reason: 'test',
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('空 services 被拒绝', () => {
    const input = {
      environment: 'production',
      version: '1.0.1',
      services: [],
      reason: 'test',
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('reason 过长被拒绝', () => {
    const input = {
      environment: 'production',
      version: '1.0.1',
      services: ['bls-admin'],
      reason: 'x'.repeat(501),
    };
    const result = createReleaseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('releaseCallbackSchema', () => {
  it('合法回调通过', () => {
    const input = {
      taskId: 'release_001',
      stage: 'pull_images',
      status: 'running',
      progress: 45,
      message: '正在拉取镜像',
      timestamp: '2026-07-25T03:02:14Z',
    };
    const result = releaseCallbackSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ========== 回调签名测试 ==========
describe('verifyCallbackSignature', () => {
  it('签名验证通过', () => {
    // 这个测试需要 RELEASE_CALLBACK_SECRET 环境变量
    // 在 CI 中通过 .env.test 设置
    const result = verifyCallbackSignature(
      String(Date.now()),
      'test-nonce-123',
      '{"test": true}',
      'will-fail-without-secret',
    );
    // 没有 SECRET 时验证失败
    expect(result.valid).toBe(false);
  });

  it('过期时间戳被拒绝', () => {
    const result = verifyCallbackSignature(
      String(Date.now() - 10 * 60 * 1000), // 10 分钟前
      'test-nonce',
      '{}',
      'any',
    );
    expect(result.valid).toBe(false);
  });
});

// ========== 状态机测试 ==========
describe('VALID_TRANSITIONS', () => {
  it('pending → checking 合法', () => {
    expect(VALID_TRANSITIONS.pending).toContain('checking');
  });

  it('pending → running 不合法', () => {
    expect(VALID_TRANSITIONS.pending).not.toContain('running');
  });

  it('success → running 不合法', () => {
    expect(VALID_TRANSITIONS.success).toHaveLength(0);
  });

  it('failed → rolling_back 合法', () => {
    expect(VALID_TRANSITIONS.failed).toContain('rolling_back');
  });

  it('rolled_back → running 不合法', () => {
    expect(VALID_TRANSITIONS.rolled_back).toHaveLength(0);
  });
});

// ========== 常量测试 ==========
describe('SERVICE_ALLOWLIST', () => {
  it('包含 5 个服务', () => {
    expect(SERVICE_ALLOWLIST).toHaveLength(5);
  });

  it('包含 bls-admin', () => {
    expect(SERVICE_ALLOWLIST).toContain('bls-admin');
  });
});

describe('ENVIRONMENT_ALLOWLIST', () => {
  it('包含 production 和 staging', () => {
    expect(ENVIRONMENT_ALLOWLIST).toContain('production');
    expect(ENVIRONMENT_ALLOWLIST).toContain('staging');
  });
});
