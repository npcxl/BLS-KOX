# RBAC 权限

## 三级权限模型

```
角色 (sys_role)
  ↓ 分配
菜单 (sys_menu) → 按钮权限 (perms)
  ↓
用户 (sys_user) → 关联角色
```

## 权限格式

`system:user:edit` = 模块:资源:操作

## 后端权限控制

```typescript
import { jwtAuth, hasPerm } from '../../middleware/auth';

// 单权限
router.get('/list', jwtAuth(), hasPerm('system:user:list'), handler);

// 多权限 OR
router.post('/action', jwtAuth(), hasPerm('system:user:add', 'system:user:import'), handler);
```

## 前端权限控制

```typescript
import { usePermission } from '@/hooks/usePermission';

const { can, isAdmin } = usePermission();

// 超管拥有所有权限
if (isAdmin || can('system:user:delete')) {
  // 显示删除按钮
}
```

## 动态权限

`hasPerm()` 中间件自动从 `sys_role_menu` 表查询当前用户的权限集合。
超管（`is_admin=1`）绕过所有权限检查。
