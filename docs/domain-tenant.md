# 域名绑定租户登录

> BLS-KOX 通过域名自动解析租户，登录时无需前端提交 `tenantId`。

## 工作原理

1. 用户在浏览器访问 `https://admin.example.com`，输入账号密码登录
2. 后端解析请求域名：`X-Forwarded-Host` > `Host` > `Origin`
3. 在 `sys_tenant` 表按 `domain_name` 匹配租户
4. 匹配成功 → 在该租户下验证用户名密码
5. 未匹配 → 回退到平台租户（`tenant_id = '000000'`）

## 域名解析优先级

| 优先级 | Header | 场景 |
|--------|--------|------|
| 1 | `X-Forwarded-Host` | Nginx 反代传入 |
| 2 | `Host` | 直接访问（非 localhost） |
| 3 | `Origin` | 跨域请求 |
| 4 | 回退 `localhost` | 本地开发 |

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
- 后端统一根据域名解析租户
- Koa 和 Java 后端域名解析逻辑完全一致
- `loginByDomain` 校验 `status='0' AND deleted=0`

## 兼容性

- 现有 Token、refresh、profile 返回结构不变
- 前端其他业务页面无需修改
- 同一用户名在不同域名下可登录不同租户（因 `username + tenant_id` 联合唯一）
