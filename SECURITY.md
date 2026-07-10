# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✅ |

## Reporting a Vulnerability

**请勿公开提交安全漏洞 Issue。**

如发现安全漏洞，请发送邮件至项目维护者，我们将在 72 小时内回复。

严重程度：
- **Critical**：远程代码执行、认证绕过 — 72h 内修复
- **High**：越权访问、Token 泄露 — 1 周内修复
- **Medium**：配置泄露、信息泄露 — 下个版本修复

## Security Capabilities

BLS-KOX 内置以下安全能力：

- 防重放攻击（Timestamp + Nonce + HMAC）
- 频率限制（IP + 账号多维度）
- 安全审计日志（登录/权限/签名）
- Session Center + Refresh Token Rotation
- 跨租户访问检测

如你在代码审计中发现了绕过方法，请通过上述渠道联系。
