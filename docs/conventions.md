# 文档规范

## 命名规范

- 文档使用英文 kebab-case 命名：`getting-started.md`、`api-compatibility.md`
- 图片放在 `img/` 子目录下

## 目录规范

- 根目录只保留项目级文档：`README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`
- 模块专题文档放在 `docs/modules/` 下
- 前端专题文档放在 `docs/frontend/` 下
- 已过期或已合并的文档放在 `docs/archive/` 下

## 文档头部元信息

每篇文档顶部应包含状态和适用范围：

```md
> 状态：current | 适用范围：Koa 后端
```

状态取值：
- `current` — 当前有效，与代码一致
- `draft` — 草稿，待完善
- `deprecated` — 已废弃，将移除
- `archive` — 已归档，仅作历史参考

## 内容规范

- 代码示例必须与当前代码保持一致
- 涉及接口路径必须写完整路径（含 `/api/` 前缀）
- 涉及双后端必须说明 Koa / Java 是否都支持
- 同一概念只在一个主文档中详细说明，其他文档引用主文档
- Markdown 标题从 `##` 开始（`#` 仅用于文档标题）

## 新增文档流程

1. 确定文档归属目录
2. 使用英文 kebab-case 命名
3. 添加元信息头部
4. 在 `docs/index.md` 中添加导航链接
