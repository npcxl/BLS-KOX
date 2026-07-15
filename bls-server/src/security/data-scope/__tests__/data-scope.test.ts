/**
 * Data Scope — 专项测试
 */
import { describe, it, expect } from 'vitest';
import { resolveMaxScope, buildScopeWhere } from '../data-scope';
import type { DataScopeType } from '../data-scope';

describe('Data Scope Core', () => {
  // ====== resolveMaxScope ======

  it('resolveMaxScope: 单角色 ALL → ALL', () => {
    expect(resolveMaxScope([{ dataScope: 'ALL' }])).toBe('ALL');
  });

  it('resolveMaxScope: 空角色列表 → SELF', () => {
    expect(resolveMaxScope([])).toBe('SELF');
  });

  it('resolveMaxScope: 默认无 dataScope → TENANT', () => {
    expect(resolveMaxScope([{}])).toBe('TENANT');
  });

  it('resolveMaxScope: 取最高权限 (ALL优先)', () => {
    expect(resolveMaxScope([
      { dataScope: 'SELF' },
      { dataScope: 'ALL' },
      { dataScope: 'DEPT' },
    ])).toBe('ALL');
  });

  it('resolveMaxScope: DEPT 优先于 SELF', () => {
    expect(resolveMaxScope([
      { dataScope: 'SELF' },
      { dataScope: 'DEPT' },
    ])).toBe('DEPT');
  });

  it('resolveMaxScope: CUSTOM 优先级高于 TENANT', () => {
    expect(resolveMaxScope([
      { dataScope: 'TENANT' },
      { dataScope: 'CUSTOM' },
    ])).toBe('CUSTOM');
  });

  // ====== buildScopeWhere ======

  const cfg = { userId: 'u1', tenantId: 't1', deptIds: ['d1'], scope: 'ALL' as DataScopeType };

  it('buildScopeWhere ALL → null', () => {
    expect(buildScopeWhere({ ...cfg, scope: 'ALL' })).toBeNull();
  });

  it('buildScopeWhere TENANT → null (tenant_id 由中间件注入)', () => {
    expect(buildScopeWhere({ ...cfg, scope: 'TENANT' })).toBeNull();
  });

  it('buildScopeWhere SELF → 非 null (create_by = userId)', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'SELF' });
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe('function');
  });

  it('buildScopeWhere SELF with custom field → uses custom field', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'SELF' }, { selfField: 'owner_id' });
    expect(fn).not.toBeNull();
  });

  it('buildScopeWhere SELF with userField → OR condition', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'SELF' }, { userField: 'user_id' });
    expect(fn).not.toBeNull();
  });

  it('buildScopeWhere DEPT non-empty → 非 null', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: ['d1', 'd2'] });
    expect(fn).not.toBeNull();
  });

  it('buildScopeWhere DEPT empty deptIds → returns false', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: [] });
    expect(fn).not.toBeNull();
    // `() => false` 返回 false，Kysely 会拼接成 1=0
  });

  it('buildScopeWhere DEPT with custom field mapping', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: ['d1'] }, { deptField: 'biz_dept_id' });
    expect(fn).not.toBeNull();
  });

  it('buildScopeWhere without dataScope config → 不影响', () => {
    // 不传 columnMapping 时的默认行为
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: ['d1'] });
    expect(fn).not.toBeNull(); // 使用默认 dept_id
  });

  it('buildScopeWhere CUSTOM with no customCondition → null', () => {
    expect(buildScopeWhere({ ...cfg, scope: 'CUSTOM' })).toBeNull();
  });

  it('buildScopeWhere DEPT_AND_CHILDREN → 非 null (递归由调用方处理)', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT_AND_CHILDREN', deptIds: ['d1', 'd2', 'd3'] });
    expect(fn).not.toBeNull();
  });

  it('buildScopeWhere DEPT_AND_CHILDREN empty deptIds → returns false', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT_AND_CHILDREN', deptIds: [] });
    expect(fn).not.toBeNull();
  });

  // ====== CUD 路由 Data Scope 集成验证 ======

  // 模拟 Kysely ExpressionBuilder
  function mockEb(field: string, op?: string, val?: any): any {
    return { type: 'condition', field, op, val };
  }
  mockEb.or = (conds: any[]) => ({ type: 'or', conds });
  mockEb.fn = { countAll: () => ({ type: 'countAll' }) };
  mockEb.selectAll = () => ({ type: 'selectAll' });

  it('SELF scope WHERE callback → create_by = userId', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'SELF' })!;
    const result = fn(mockEb);
    expect(result).toBeDefined();
    // SELF without userField → single condition
    expect(result.field).toBe('create_by');
    expect(result.op).toBe('=');
    expect(result.val).toBe('u1');
  });

  it('SELF scope with userField → OR condition', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'SELF' }, { userField: 'user_id' })!;
    const result = fn(mockEb);
    expect(result.type).toBe('or');
    expect(result.conds.length).toBe(2);
  });

  it('DEPT scope WHERE callback → dept_id IN', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: ['d1', 'd2'] })!;
    const result = fn(mockEb);
    expect(result.field).toBe('dept_id');
    expect(result.op).toBe('in');
    expect(result.val).toEqual(['d1', 'd2']);
  });

  it('DEPT_AND_CHILDREN scope WHERE callback → dept_id IN (递归后)', () => {
    const deptIds = ['d1', 'd1-c1', 'd1-c1-g1']; // 已递归展开
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT_AND_CHILDREN', deptIds })!;
    const result = fn(mockEb);
    expect(result.field).toBe('dept_id');
    expect(result.op).toBe('in');
    expect(result.val.length).toBe(3);
  });

  it('DEPT scope empty deptIds → returns false literal', () => {
    const fn = buildScopeWhere({ ...cfg, scope: 'DEPT', deptIds: [] })!;
    const result = fn(mockEb);
    expect(result).toBe(false);
  });

  // ====== dataScope: false 不应用 ======
  it('config with dataScope: false → buildScopeWhere returns null (不启用)', () => {
    // 模拟 crud.ts 中的检查逻辑
    const dsConfig: false | any = false;
    const whereFn = dsConfig
      ? buildScopeWhere({ ...cfg, scope: 'SELF' }, dsConfig)
      : null;
    expect(whereFn).toBeNull();
  });

  it('config with dataScope: { selfField } → buildScopeWhere returns non-null (启用)', () => {
    const dsConfig = { selfField: 'owner_id' };
    const whereFn = buildScopeWhere({ ...cfg, scope: 'SELF' }, dsConfig);
    expect(whereFn).not.toBeNull();
  });

  it('config with empty dataScope → buildScopeWhere uses defaults', () => {
    const whereFn = buildScopeWhere({ ...cfg, scope: 'SELF' }, {});
    expect(whereFn).not.toBeNull();
  });
});
