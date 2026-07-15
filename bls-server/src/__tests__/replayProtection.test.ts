import { describe, it, expect, vi } from 'vitest';

/**
 * 防重放攻击单元测试（不依赖服务器/Redis）
 */

// Mock ReplayProtectionService
vi.mock('../services/ReplayProtectionService', () => ({
  ReplayProtectionService: class {
    findRule() {
      return { path: '/api/test', mode: 'on', nonceTtlSeconds: 300, timestampAllowSeconds: 60 };
    }
    async check() {
      return true;
    }
  },
  SecurityError: class extends Error {
    securityCode: number;
    status: number;
    constructor(securityCode: number, message: string, status: number) {
      super(message);
      this.securityCode = securityCode;
      this.status = status;
    }
  },
}));

vi.mock('../core/security-audit', () => ({
  writeSecurityLog: vi.fn().mockResolvedValue(undefined),
  actorFromCtx: vi.fn().mockReturnValue({}),
  SecurityEventType: { CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS', TOKEN_INVALID: 'TOKEN_INVALID', LOGIN_FAILED: 'LOGIN_FAILED', REFRESH_TOKEN_REUSE: 'REFRESH_TOKEN_REUSE' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
}));

vi.mock('../core/request-context', () => ({
  setRequestContext: vi.fn(),
  getRequestContext: vi.fn().mockReturnValue({ tenantId: '000001', userId: 'u1', username: 'test' }),
}));

vi.mock('../shared/constants/security-error-code', () => ({
  SecurityErrorCode: {
    REPLAY_DETECTED: 40901,
    IDEMPOTENT_PROCESSING: 40902,
    IDEMPOTENT_CONFLICT: 40903,
    SIGNATURE_INVALID: 40106,
    TIMESTAMP_EXPIRED: 40103,
  },
}));

describe('Replay Protection Middleware', () => {
  it('should export replayProtectionMiddleware', async () => {
    const mod = await import('../middleware/replay-protection.js');
    expect(typeof mod.replayProtectionMiddleware).toBe('function');
  });
});
