# 多租户

## 租户隔离原理

1. **Request Context** 保存当前请求的 `tenantId`
2. **Tenant Middleware** 从 Header/JWT 提取租户信息
3. **CRUD 工厂** 自动注入 `WHERE tenant_id = ?`
4. **Ownership Guard** 操作前验证资源归属

## 开发自定义 API

```typescript
import { getCurrentTenantId } from '../../middleware/tenant';

router.get('/list', jwtAuth(), async (ctx) => {
  const tenantId = getCurrentTenantId();

  const rows = await (await getDb())
    .selectFrom('my_table')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .execute();

  ctx.body = { code: 200, data: rows };
});
```

## Ownership Guard

操作前验证资源是否属于当前租户：

```typescript
import { assertTenantResource } from '../../security/ownership';

// 删除前检查
await assertTenantResource('sys_file', 'file_id', fileId);
// 如果资源不属于当前租户 → 403 Forbidden + 安全审计日志
```

## 跨租户访问告警

系统自动记录 `CROSS_TENANT_ACCESS` 安全事件，含操作人、目标租户、时间等信息。
