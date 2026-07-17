# 域名绑定租户登录

> BLS-KOX 通过域名自动解析租户，登录时无需前端提交 `tenantId`。

## 工作原理

1. 用户在浏览器访问 `https://admin.example.com`，输入账号密码登录
2. 后端解析请求域名：`X-Forwarded-Host`（需 TRUST_PROXY=true）> `Host` > `Origin`
3. 在 `sys_tenant` 表按 `domain_name` 匹配租户
4. 匹配成功 → 在该租户下验证用户名密码
5. 未匹配 → 生产环境直接报"当前域名未绑定租户"
6. **仅** `localhost` / `127.0.0.1` 场景才 fallback 到平台租户（`000000`）

## 域名解析优先级

| 优先级 | Header | 条件 |
|--------|--------|------|
| 1 | `X-Forwarded-Host` | TRUST_PROXY=true 时使用 |
| 2 | `Host` | 非 localhost/127.0.0.1 时使用 |
| 3 | `Origin` | localhost 场景的最终 fallback |
| 4 | `localhost` | 本地开发回退 |

> **关键设计**：`X-Forwarded-Host` 仅在 `TRUST_PROXY=true` 时信任，防止客户端伪造。

## 数据库

`sys_tenant.domain_name` 为**唯一约束**，每个域名只能绑定一个租户。

```sql
-- 配置租户域名
UPDATE sys_tenant SET domain_name = 'admin.example.com' WHERE tenant_id = '000000';
```

## Nginx 反代配置

生产环境通过 Nginx 反代时，需要传递 `X-Forwarded-Host`：

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location /api/ {
        proxy_pass http://bls-server:7001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 本地开发

本地开发时域名为 `localhost`，会自动回退到平台租户（`000000`）。

如需测试多租户域名登录，修改本地 hosts 文件：

```
# Windows: C:\Windows\System32\drivers\etc\hosts
# macOS/Linux: /etc/hosts

127.0.0.1 admin.example.com
127.0.0.1 demo.example.com
```

然后分别访问 `http://admin.example.com:9000` 和 `http://demo.example.com:9000` 登录，会命中不同租户。

## 安全说明

- 前端**不再提交** `tenantId`，避免租户伪造
- 后端统一根据域名解析租户，`X-Forwarded-Host` 仅在信任代理时使用
- 生产环境未知域名直接拒绝，不回退平台租户
- `localhost` / `127.0.0.1` 自动回退到平台租户（仅本地开发）
- Koa 和 Java 后端域名解析逻辑完全一致
- `loginByDomain` 校验 `status='0' AND deleted=0`

## 兼容性

- 现有 Token、refresh、profile 返回结构不变
- 前端其他业务页面无需修改
- 同一用户名在不同域名下可登录不同租户（因 `username + tenant_id` 联合唯一）
