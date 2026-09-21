/**
 * ai-model 模块测试
 *
 * 覆盖：详情跨租户越权、api_key 脱敏、编辑保留密钥、默认模型唯一性、internal-list 受控访问、状态校验
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.INTERNAL_SECRET = 'unit-test-secret';
  return {
    tenantId: 't1' as string | null,
    db: null as any,
  };
});

vi.mock('../../../../core/database', () => ({ getDb: async () => h.db }));
vi.mock('../../../../middleware/tenant', () => ({
  getCurrentTenantId: () => h.tenantId,
  requireTenantId: () => {
    if (!h.tenantId) throw new Error('缺少租户上下文，禁止写操作');
    return h.tenantId;
  },
}));
vi.mock('../../../../middleware/auth', () => ({ jwtAuth: () => async (_ctx: any, next: any) => next() }));
vi.mock('../../../../middleware/permission', () => ({ hasPerm: () => async (_ctx: any, next: any) => next() }));

import { decryptSecret } from '../../../../shared/utils/secret-crypto';
import router from '../index';
import { FakeDb } from '../../../../core/__tests__/fake-db';
import { makeCtx, callRoute as call } from '../../../../core/__tests__/test-kit';

const T = 'ai_model_config';

function modelRows() {
  return [
    {
      config_id: 'M1', tenant_id: 't1', model_name: 'Qwen', model_type: 'local', provider: 'ollama',
      model_id: 'qwen2.5:7b', api_key: 'sk-t1-1234567890abcdef', base_url: 'http://ollama:11434/v1',
      is_default: '1', status: '0', sort_num: 1, remark: 'r1', deleted: 0,
    },
    {
      config_id: 'M2', tenant_id: 't1', model_name: 'DeepSeek', model_type: 'api', provider: 'deepseek',
      model_id: 'deepseek-chat', api_key: 'sk-t1-abcdefghijklmnop', base_url: 'https://api.deepseek.com/v1',
      is_default: '0', status: '0', sort_num: 2, remark: 'r2', deleted: 0,
    },
    {
      config_id: 'M9', tenant_id: 't2', model_name: 'OtherTenant', model_type: 'api', provider: 'openai',
      model_id: 'gpt-4', api_key: 'sk-t2-SECRETSECRETSECRET', base_url: null,
      is_default: '0', status: '0', sort_num: 1, remark: 'other', deleted: 0,
    },
  ];
}

beforeEach(() => {
  h.tenantId = 't1';
  const db = new FakeDb();
  db.seed(T, modelRows());
  h.db = db;
});

describe('ai-model 详情与脱敏', () => {
  it('详情不返回完整 api_key', async () => {
    const ctx = makeCtx({ params: { id: 'M1' } });
    await call(router, 'get', '/system/ai-model/:id', ctx);
    expect(ctx.body.data.api_key).toContain('****');
    expect(ctx.body.data.api_key).not.toBe('sk-t1-1234567890abcdef');
  });

  it('详情跨租户 → 404（不泄漏其他租户模型与密钥）', async () => {
    await expect(call(router, 'get', '/system/ai-model/:id', makeCtx({ params: { id: 'M9' } })))
      .rejects.toMatchObject({ status: 404 });
  });

  it('list 脱敏且仅当前租户', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/ai-model/list', ctx);
    expect(ctx.body.data.map((r: any) => r.config_id).sort()).toEqual(['M1', 'M2']);
    for (const row of ctx.body.data) expect(row.api_key).toContain('****');
  });
});

describe('ai-model 编辑密钥策略', () => {
  it('传入脱敏占位值 → 保留原密钥', async () => {
    await call(router, 'put', '/system/ai-model/edit', makeCtx({
      request: { body: { configId: 'M1', modelName: 'Qwen 改名', apiKey: 'sk-t****cdef' } },
    }));
    const row = h.db.rows(T).find((r: any) => r.config_id === 'M1');
    expect(row.api_key).toBe('sk-t1-1234567890abcdef');
    expect(row.model_name).toBe('Qwen 改名');
  });

  it('未传 apiKey → 保留原密钥', async () => {
    await call(router, 'put', '/system/ai-model/edit', makeCtx({
      request: { body: { configId: 'M2', modelName: 'DeepSeek 改名' } },
    }));
    expect(h.db.rows(T).find((r: any) => r.config_id === 'M2').api_key).toBe('sk-t1-abcdefghijklmnop');
  });

  it('传入新 apiKey → 以密文落库（数据库中不存在明文）', async () => {
    await call(router, 'put', '/system/ai-model/edit', makeCtx({
      request: { body: { configId: 'M2', apiKey: 'sk-brand-new-key' } },
    }));
    const stored = h.db.rows(T).find((r: any) => r.config_id === 'M2').api_key;
    expect(stored).not.toBe('sk-brand-new-key');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('sk-brand-new-key');
    expect(decryptSecret(stored)).toBe('sk-brand-new-key');
  });

  it('跨租户编辑 → 404 且数据未变', async () => {
    await expect(call(router, 'put', '/system/ai-model/edit', makeCtx({
      request: { body: { configId: 'M9', modelName: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(T).find((r: any) => r.config_id === 'M9').model_name).toBe('OtherTenant');
  });

  it('缺少 configId → 400', async () => {
    await expect(call(router, 'put', '/system/ai-model/edit', makeCtx({ request: { body: {} } })))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('ai-model 默认模型唯一性', () => {
  it('编辑设为默认 → 同租户其他模型取消默认，其他租户不受影响', async () => {
    await call(router, 'put', '/system/ai-model/edit', makeCtx({
      request: { body: { configId: 'M2', isDefault: '1' } },
    }));
    const all = h.db.rows(T);
    expect(all.find((r: any) => r.config_id === 'M1').is_default).toBe('0');
    expect(all.find((r: any) => r.config_id === 'M2').is_default).toBe('1');
    expect(all.find((r: any) => r.config_id === 'M9').is_default).toBe('0');
  });

  it('新增设为默认 → 同租户仅一个默认', async () => {
    const ctx = makeCtx({
      request: { body: { modelName: '新默认', provider: 'openai', modelId: 'gpt-4o', isDefault: '1' } },
    });
    await call(router, 'post', '/system/ai-model/add', ctx);
    expect(ctx.body.data.configId).toBeTruthy();
    const mine = h.db.rows(T).filter((r: any) => r.tenant_id === 't1' && Number(r.deleted) === 0);
    expect(mine.filter((r: any) => r.is_default === '1')).toHaveLength(1);
    expect(mine.find((r: any) => r.is_default === '1').model_name).toBe('新默认');
  });
});

describe('ai-model 状态与删除', () => {
  it('状态非法 → 400', async () => {
    await expect(call(router, 'put', '/system/ai-model/status', makeCtx({
      request: { body: { configId: 'M1', status: '9' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('跨租户改状态 → 404', async () => {
    await expect(call(router, 'put', '/system/ai-model/status', makeCtx({
      request: { body: { configId: 'M9', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('跨租户删除 → 404', async () => {
    await expect(call(router, 'delete', '/system/ai-model/remove', makeCtx({
      request: { body: { ids: ['M9'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(Number(h.db.rows(T).find((r: any) => r.config_id === 'M9').deleted)).toBe(0);
  });

  it('删除当前租户模型 → 逻辑删除', async () => {
    await call(router, 'delete', '/system/ai-model/remove', makeCtx({
      request: { body: { ids: ['M1', 'M2'] } },
    }));
    expect(Number(h.db.rows(T).find((r: any) => r.config_id === 'M1').deleted)).toBe(1);
    expect(Number(h.db.rows(T).find((r: any) => r.config_id === 'M9').deleted)).toBe(0);
  });
});

describe('ai-model internal-list 受控访问', () => {
  it('未配置/错误 secret → 403', async () => {
    const ctx = makeCtx({ headers: {} });
    await call(router, 'get', '/system/ai-model/internal-list', ctx);
    expect(ctx.status).toBe(403);
    expect(ctx.body.code).toBe(403);
  });

  it('携带正确 secret + tenantId → 只返回该租户模型', async () => {
    const ctx = makeCtx({
      headers: { 'x-internal-secret': 'unit-test-secret' },
      query: { tenantId: 't2' },
    });
    await call(router, 'get', '/system/ai-model/internal-list', ctx);
    expect(ctx.body.data.map((r: any) => r.config_id)).toEqual(['M9']);
    // 受控返回结构：不返回 remark 等非必需字段
    expect(ctx.body.data[0]).not.toHaveProperty('remark');
  });

  it('携带正确 secret 不传 tenantId → 内部服务可见全部（明确受控结构）', async () => {
    const ctx = makeCtx({ headers: { 'x-internal-secret': 'unit-test-secret' } });
    await call(router, 'get', '/system/ai-model/internal-list', ctx);
    expect(ctx.body.data.length).toBe(3);
  });
});
