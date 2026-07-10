# Contributing to BLS-KOX

感谢你对 BLS-KOX 的关注！

## Development Setup

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX

# Backend
cd bls-server
cp .env.example .env
npm install

# Frontend
cd ../bls-admin
npm install
```

## Branch Naming

- `feature/xxx` — 新功能
- `fix/xxx` — Bug 修复
- `docs/xxx` — 文档变更
- `refactor/xxx` — 重构

## Commit Convention

```
feat: 新增数据库指标埋点
fix: 修复 License Badge 不一致
docs: 更新 Quick Start 说明
refactor: 提取 Session 验证逻辑
test: 补充限流中间件测试
chore: 升级依赖版本
```

## Pull Request

在提交 PR 前请确保：

1. `npm run lint` 通过
2. `npm test` 通过
3. `npm run build` 通过
4. 描述清楚做了什么、为什么做
5. 如有 Breaking Change 请明确说明

## Code Style

- 使用 TypeScript strict 模式
- 优先使用 Kysely ORM（`getDb()`）
- API 模块按目录结构自动注册路由
- 命名：文件名 kebab-case，变量 camelCase，数据库列 snake_case
- 中间件使用 `jwtAuth()` / `hasPerm()` 组合模式

## Testing

- 单元测试放在 `src/**/__tests__/` 目录下
- 使用 Vitest
- Mock 外部依赖（Redis、MySQL）
- 新功能应有对应测试

## Security Issues

如发现安全漏洞，请勿公开提交 Issue，请参照 [SECURITY.md](./SECURITY.md) 中的报告方式。
