# CrudTable 和 Hook 封装

> 状态：current | 适用范围：前端

`CrudTablePage` 组件 + `useCrudTable` Hook 将 CRUD 页面的通用逻辑（分页列表、新增/编辑弹窗、删除、状态切换、搜索模式等）标准化。

## 1. 架构

```
CrudTablePage (UI 组装)
  ├── useCrudTable (状态管理)
  │     ├── request → list/add/edit/remove/status API
  │     ├── modalOpen / mode / current
  │     └── openCreate / openEdit / submit / remove / changeStatus
  ├── ProTable + BetaSchemaForm
  └── usePermission (权限控制)
```

## 2. useCrudTable Hook

```ts
const crud = useCrudTable<T>(resource, idKey, options?);
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `resource` | `CrudResource` | CRUD 资源配置 `{basePath, list?, add?, edit?, remove?, status?}` |
| `idKey` | `keyof T` | 主键字段名 |
| `options.beforeSubmit` | `(values, current?) => Partial<T>` | 提交前处理 |
| `options.onSaved` | `(mode, values, current?) => void` | 保存后回调 |
| `options.searchMode` | `'fuzzy' \| 'exact'` | 搜索模式，默认 `fuzzy` |

### 返回值

| 属性 | 说明 |
|------|------|
| `actionRef` | ProTable action 引用 |
| `modalOpen` / `mode` / `current` / `createDefaults` | 弹窗状态 |
| `request` | ProTable 的 request 函数 |
| `openCreate(defaults?)` | 打开新增弹窗 |
| `openEdit(record)` | 打开编辑弹窗 |
| `closeModal()` | 关闭弹窗 |
| `submit(values)` | 提交表单 |
| `remove(records)` | 删除（含确认框） |
| `changeStatus(record, status)` | 切换状态 |

## 3. CrudTablePage 组件

```tsx
<CrudTablePage<T>
  title="用户管理"
  rowKey="userId"
  resource={{ basePath: '/api/system/user' }}
  columns={columns}
  formColumns={formColumns}
/>
```

### 必填参数

| 参数 | 说明 |
|------|------|
| `title` | 页面标题 |
| `rowKey` | 行主键字段 |
| `resource` | CRUD 资源对象 |
| `columns` | ProTable 列定义 |
| `formColumns` | 表单列定义 |

### 常用可选参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `statusKey` | `keyof T` | `'status'` | 状态字段 |
| `modalWidth` | `number` | `640` | 弹窗宽度 |
| `pagination` | `false \| {...}` | `{defaultPageSize:10, showSizeChanger:true}` | 分页 |
| `scroll` | `{x?, y?}` | - | 表格滚动 |
| `embedded` | `boolean` | `false` | 内嵌模式（不包裹 PageContainer） |
| `formGrid` | `boolean` | `true` | 表单栅格布局 |
| `formColProps` | - | `{xs:24, md:12}` | 表单列栅格 |
| `defaultSearchMode` | `'fuzzy' \| 'exact'` | `'fuzzy'` | 默认搜索模式 |
| `showSearchModeToggle` | `boolean` | `true` | 搜索模式切换开关 |
| `showCreateButton` | `boolean` | `true` | 新增按钮 |
| `showFormModal` | `boolean` | `true` | 表单弹窗 |
| `showEditAction` | `boolean` | `true` | 编辑操作 |
| `createButtonText` | `string` | `'新增'` | 新增按钮文案 |
| `columnConfig` | `ColumnConfig[]` | - | 列可见性/可搜索配置 |
| `permissions` | `{create?, edit?, remove?, status?, import?, export?}` | - | 权限控制 |
| `excelMetaKey` | `string` | - | Excel 导入导出 key |
| `extraActions` | `(record) => ReactNode[]` | - | 额外操作按钮 |
| `toolbarExtra` | `ReactNode[]` | - | 工具栏额外内容 |
| `tableAlertExtraRender` | `(rows, onClean) => ReactNode` | - | 批量操作扩展 |
| `beforeSubmit` | `(values, current?) => Partial<T>` | - | 提交前处理 |
| `onSaved` | `(mode, values, current?) => void` | - | 保存后回调 |
| `expandable` | - | - | 展开行配置 |

## 4. 状态切换约定

- `status = '0'`：正常/启用
- `status = '1'`：停用/禁用

自动识别 `statusKey` 字段并渲染启用/停用切换操作。

## 5. 搜索模式

- **fuzzy**（默认）：多个搜索字段合并为 `keyword`
- **exact**：表单参数原样传给后端

工具栏显示切换开关，切换后自动刷新列表。

## 6. 表单值自动处理

- **switch**：`0/1` → 布尔值
- **textarea + json 字段名**：JSON 字符串格式化
- **select/treeSelect multiple**：字符串 → 逗号拆分为数组
- **select/treeSelect 单选**：值统一转字符串

## 7. 完整示例

`columns` 推荐使用 `usePageConfig` 从数据库动态加载，`formColumns` 因表单字段复杂度高（treeSelect、多选、密码等）仍需手动定义。

```tsx
import CrudTablePage from '@/components/CrudTablePage';
import { usePageConfig } from '@/hooks/usePageConfig';
import type { ProFormColumnsType } from '@ant-design/pro-components';

type OrderRecord = { id: string; orderNo: string; customerName: string; status: string; };

export default function OrderPage() {
  const { proColumns } = usePageConfig('business_order');  // 表格列从数据库动态加载

  const formColumns: ProFormColumnsType<OrderRecord>[] = [
    { title: '订单编号', dataIndex: 'orderNo', formItemProps: { rules: [{ required: true }] } },
    { title: '客户名称', dataIndex: 'customerName', formItemProps: { rules: [{ required: true }] } },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0' },
  ];

  return (
    <CrudTablePage<OrderRecord>
      title="订单管理"
      rowKey="id"
      resource={{ basePath: '/api/business/orders' }}
      columns={proColumns}
      formColumns={formColumns}
      permissions={{ create: 'business:order:add', edit: 'business:order:edit', remove: 'business:order:remove' }}
    />
  );
}
```

> `columns` 列配置在「页面配置」管理页维护，调整保存即生效，无需重新编译部署。详情见 [动态接口生成文档](./动态接口生成文档.md)。
