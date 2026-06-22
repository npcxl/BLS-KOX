# CrudTable 及其 Hook 封装使用文档

本文档说明 `bls-admin` 中的 `CrudTablePage` 组件与 `useCrudTable` Hook 的设计目标、能力边界和使用方式。

## 1. 设计目标

这一套封装的核心目标是把后台管理系统里最常见的“列表 + 新增/编辑弹窗 + 删除 + 状态切换”场景标准化，减少每个页面重复编写以下逻辑：

- 分页列表请求
- 新增 / 编辑弹窗控制
- 表单提交前数据转换
- 删除确认
- 状态切换
- 批量删除
- 搜索模式切换
- 导入 / 导出入口扩展

其中：

- `useCrudTable` 负责“业务逻辑和状态管理”
- `CrudTablePage` 负责“列表页面 UI 组装”

---

## 2. 组件与 Hook 的关系

### `useCrudTable`

文件路径：`bls-admin/src/hooks/useCrudTable.ts`

职责：

- 管理表格请求
- 管理新增 / 编辑弹窗状态
- 处理提交、删除、状态切换
- 支持提交前数据转换 `beforeSubmit`
- 支持保存后回调 `onSaved`
- 支持模糊 / 精确搜索模式

### `CrudTablePage`

文件路径：`bls-admin/src/components/CrudTablePage/index.tsx`

职责：

- 基于 `ProTable` + `BetaSchemaForm` 组合出完整 CRUD 页面
- 处理列展示、搜索、操作列、按钮权限、批量删除等 UI
- 支持将 `useCrudTable` 的能力以更少的配置暴露给业务页面

---

## 3. `useCrudTable` 的使用方式

### 3.1 基本调用

```ts
const crud = useCrudTable<MyRow>(resource, 'id');
```

参数说明：

- `resource`：CRUD 资源描述对象，类型为 `CrudResource`
- `idKey`：主键字段名，比如 `id`、`fileId`、`userId`
- `options`：可选配置

### 3.2 Hook 参数

```ts
export type UseCrudTableOptions<T extends Record<string, any>> = {
  beforeSubmit?: (values: Partial<T>, current?: T) => Partial<T>;
  onSaved?: (mode: CrudMode, values: Partial<T>, current?: T) => void | Promise<void>;
  searchMode?: 'fuzzy' | 'exact';
};
```

#### `beforeSubmit`

在提交前对表单值做统一转换，比如：

- 把数组转成逗号分隔字符串
- 删除某些前端辅助字段
- 补充后端需要的默认值

#### `onSaved`

新增或编辑成功后触发，可用于：

- 刷新外部状态
- 记录埋点
- 额外同步其他数据

#### `searchMode`

- `fuzzy`：模糊搜索，会把多个搜索字段合并到 `keyword`
- `exact`：精确搜索，直接按表单参数请求

默认值是 `fuzzy`。

---

## 4. `useCrudTable` 返回值

`useCrudTable` 会返回以下能力：

- `actionRef`：`ProTable` 的操作引用
- `lastRequestParams`：最近一次列表请求参数
- `modalOpen`：弹窗是否打开
- `mode`：当前模式，`create` 或 `edit`
- `current`：当前编辑的数据行
- `createDefaults`：新增时的默认值
- `request`：列表请求函数，直接给 `ProTable` 使用
- `openCreate(defaults?)`：打开新增弹窗
- `openEdit(record)`：打开编辑弹窗
- `closeModal()`：关闭弹窗
- `submit(values)`：提交表单
- `remove(records)`：删除一条或多条数据
- `changeStatus(record, status)`：切换状态

---

## 5. `CrudTablePage` 的使用方式

### 5.1 基本调用

```tsx
import CrudTablePage from '@/components/CrudTablePage';

export default function UserPage() {
  return (
    <CrudTablePage<UserRow>
      title="用户管理"
      rowKey="id"
      resource={userResource}
      columns={columns}
      formColumns={formColumns}
    />
  );
}
```

这是最常见的使用方式，只要提供：

- 页面标题 `title`
- 主键字段 `rowKey`
- 资源对象 `resource`
- 表格列 `columns`
- 表单列 `formColumns`

即可生成一个完整的 CRUD 页面。

### 5.2 参考业务表（订单管理）

```tsx
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import CrudTablePage from '@/components/CrudTablePage';

export type OrderRecord = {
  id: string;
  orderNo: string;
  customerName: string;
  customerContact?: string;
  customerPhone?: string;
  orderSource?: string;
  orderDate: string;
  deliveryDate?: string;
  productCode?: string;
  productName?: string;
  orderQuantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  orderStatus?: 'pending' | 'production' | 'delivered' | 'cancelled';
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  salesOwner?: string;
  remark?: string;
  createdAt?: string;
};

const orderStatusValueEnum = {
  pending: { text: '待确认', status: 'Processing' },
  production: { text: '生产中', status: 'Warning' },
  delivered: { text: '已交付', status: 'Success' },
  cancelled: { text: '已取消', status: 'Default' },
};

const paymentStatusValueEnum = {
  unpaid: { text: '未付款', status: 'Default' },
  partial: { text: '部分付款', status: 'Processing' },
  paid: { text: '已付款', status: 'Success' },
};

export default function OrderPage() {
  const columns: ProColumns<OrderRecord>[] = [
    { title: '订单编号', dataIndex: 'orderNo', copyable: true, ellipsis: true },
    { title: '客户名称', dataIndex: 'customerName', ellipsis: true },
    { title: '产品名称', dataIndex: 'productName', ellipsis: true },
    { title: '订购数量', dataIndex: 'orderQuantity', valueType: 'digit', search: false },
    { title: '单价', dataIndex: 'unitPrice', valueType: 'money', search: false },
    { title: '订单金额', dataIndex: 'totalAmount', valueType: 'money', search: false },
    { title: '下单日期', dataIndex: 'orderDate', valueType: 'date', search: false },
    { title: '交付日期', dataIndex: 'deliveryDate', valueType: 'date', search: false },
    { title: '订单状态', dataIndex: 'orderStatus', valueType: 'select', valueEnum: orderStatusValueEnum },
    { title: '付款状态', dataIndex: 'paymentStatus', valueType: 'select', valueEnum: paymentStatusValueEnum },
    { title: '销售负责人', dataIndex: 'salesOwner', search: false },
    { title: '备注', dataIndex: 'remark', search: false, ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<OrderRecord>[] = [
    { title: '订单编号', dataIndex: 'orderNo', formItemProps: { rules: [{ required: true, message: '请输入订单编号' }] } },
    { title: '客户名称', dataIndex: 'customerName', formItemProps: { rules: [{ required: true, message: '请输入客户名称' }] } },
    { title: '联系人', dataIndex: 'customerContact' },
    { title: '联系电话', dataIndex: 'customerPhone' },
    { title: '订单来源', dataIndex: 'orderSource' },
    { title: '下单日期', dataIndex: 'orderDate', valueType: 'date', formItemProps: { rules: [{ required: true, message: '请选择下单日期' }] } },
    { title: '交付日期', dataIndex: 'deliveryDate', valueType: 'date' },
    { title: '产品编码', dataIndex: 'productCode' },
    { title: '产品名称', dataIndex: 'productName' },
    { title: '订购数量', dataIndex: 'orderQuantity', valueType: 'digit', initialValue: 0 },
    { title: '单价', dataIndex: 'unitPrice', valueType: 'money', initialValue: 0 },
    { title: '订单金额', dataIndex: 'totalAmount', valueType: 'money', initialValue: 0 },
    {
      title: '订单状态',
      dataIndex: 'orderStatus',
      valueType: 'select',
      initialValue: 'pending',
      valueEnum: {
        pending: '待确认',
        production: '生产中',
        delivered: '已交付',
        cancelled: '已取消',
      },
    },
    {
      title: '付款状态',
      dataIndex: 'paymentStatus',
      valueType: 'select',
      initialValue: 'unpaid',
      valueEnum: {
        unpaid: '未付款',
        partial: '部分付款',
        paid: '已付款',
      },
    },
    { title: '销售负责人', dataIndex: 'salesOwner' },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  return (
    <CrudTablePage<OrderRecord>
      title="订单管理"
      rowKey="id"
      resource={{ basePath: '/api/business/orders' }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={920}
      scroll={{ x: 'max-content' }}
    />
  );
}

```

---

## 6. `CrudTablePage` 参数说明

### 必填参数

#### `title`

页面标题，会显示在页面容器和弹窗标题中。

#### `rowKey`

表格每行数据的主键字段名。

#### `resource`

CRUD 接口资源对象，决定列表、增删改查、状态切换等请求地址。

#### `columns`

`ProTable` 的列表列定义。

#### `formColumns`

`BetaSchemaForm` 的表单列定义。

---

### 常用可选参数

#### `columnConfig`

用于控制列显示和搜索开关。

```ts
columnConfig?: {
  dataIndex: keyof T | string;
  title?: string;
  visible?: boolean;
  searchable?: boolean;
}[];
```

功能：

- `visible: false`：隐藏列
- `searchable: false`：列不参与搜索表单

适合做“页面级列配置”。

#### `statusKey`

状态字段名，默认值是 `status`。

页面会自动识别该字段并渲染“启用 / 停用”切换操作。

#### `createButtonText`

新增按钮文案，默认是 `新增`。

#### `showCreateButton`

是否显示新增按钮，默认 `true`。

#### `modalWidth`

编辑 / 新增弹窗宽度，默认 `640`。

#### `pagination`

分页配置，默认：

```ts
{ defaultPageSize: 10, showSizeChanger: true }
```

#### `scroll`

表格滚动配置。

#### `expandable`

`ProTable` 展开行配置。

#### `extraActions`

为每一行追加自定义操作。

```tsx
extraActions={(record) => [
  <a key="view" onClick={() => openDetail(record)}>查看</a>,
]}
```

#### `toolbarExtra`

在工具栏中追加自定义节点。

#### `beforeSubmit`

提交前统一处理表单值。

#### `onSaved`

保存成功后的回调。

#### `embedded`

是否内嵌模式。

- `false`：默认包裹 `PageContainer`
- `true`：只渲染内部内容，适合嵌入到其他页面

#### `formGrid`

是否让表单使用栅格布局，默认 `true`。

#### `formColProps`

表单列默认栅格宽度，默认：

```ts
{ xs: 24, md: 12 }
```

#### `defaultSearchMode`

默认搜索模式：`fuzzy` 或 `exact`。

#### `showSearchModeToggle`

是否显示搜索模式切换开关，默认 `true`。

#### `permissions`

权限控制配置：

```ts
permissions?: {
  create?: string | string[];
  edit?: string | string[];
  remove?: string | string[];
  status?: string | string[];
  import?: string | string[];
  export?: string | string[];
};
```

用于配合 `usePermission()` 控制：

- 新增按钮
- 编辑按钮
- 删除按钮
- 状态切换
- 导入 / 导出入口

#### `excelMetaKey`

如果传入该值，会自动在工具栏渲染 `ExcelToolbar`，并把当前查询参数传给导出逻辑。

---

## 7. 列配置的用法

### 7.1 表格列 `columns`

`columns` 是 `ProTable` 的列定义，直接按 `@ant-design/pro-components` 的写法即可。

### 7.2 表单列 `formColumns`

`formColumns` 是弹窗表单字段定义，也直接使用 `BetaSchemaForm` 兼容的列配置。

### 7.3 列显示与搜索控制

如果你希望某些列：

- 页面中隐藏
- 但保留在代码中
- 或仅用于展示、不参与搜索

可以通过 `columnConfig` 配置。

示例：

```ts
const columnConfig = [
  { dataIndex: 'name', visible: true, searchable: true },
  { dataIndex: 'secret', visible: false },
  { dataIndex: 'remark', searchable: false },
];
```

---

## 8. 状态切换的约定

组件默认把 `status` 字段视为启用状态字段，约定：

- `0`：正常 / 启用
- `1`：停用 / 禁用

如果没有传 `valueEnum`，会默认显示：

- `0` → `正常`
- 其他值 → `停用`

当列表中存在该字段且资源支持状态修改时，操作列会自动出现“启用 / 停用”切换入口。

---

## 9. 搜索模式说明

当前封装支持两种搜索模式：

### 9.1 模糊搜索 `fuzzy`

默认模式。

逻辑是：

- 把表单中的多个字段值合并到 `keyword`
- 适合后端统一按关键词搜索

### 9.2 精确搜索 `exact`

- 不合并字段
- 请求参数按表单原样传给后端

### 9.3 切换方式

页面工具栏中会显示搜索模式开关，切换后会自动刷新列表。

---

## 10. 表单值自动处理

`CrudTablePage` 在编辑模式下，会对部分字段做初始化转换，常见规则包括：

### 10.1 `switch` 类型

数据库中如果是 `0 / 1`、`true / false`，会尝试转成开关可识别的布尔值。

### 10.2 JSON 文本域

如果字段名以 `json` 结尾，并且是 `textarea`，会尝试把 JSON 字符串格式化成漂亮的缩进文本，方便编辑。

### 10.3 多选字段

如果字段是 `select` 或 `treeSelect`，且 `fieldProps.mode === 'multiple'`：

- 字符串会按逗号拆分成数组
- 数组会转成字符串数组

### 10.4 单选字段

非多选情况下，`select` / `treeSelect` 会把值统一转成字符串。

---

## 11. 新增 / 编辑弹窗行为

弹窗使用 `BetaSchemaForm` 的 `ModalForm` 模式。

特点：

- 打开时自动切换新增 / 编辑标题
- 编辑时自动带入当前行数据
- 关闭时自动清理状态
- `destroyOnHidden: true`，关闭后会销毁表单内容
- 表单内容区域支持滚动，避免字段过多时弹窗超高

---

## 12. 删除与批量删除

### 单条删除

每行操作列中会出现删除入口。

### 批量删除

表格启用了行选择后，底部批量操作区会提供“批量删除”。

删除前会弹出确认框，避免误操作。

---

## 13. 推荐的页面写法

下面是一个更完整的示例。

```tsx
import CrudTablePage from '@/components/CrudTablePage';
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';

type UserRow = {
  id: string;
  name: string;
  status: '0' | '1';
  roleIds: string[];
  remark?: string;
};

const columns: ProColumns<UserRow>[] = [
  {
    title: '名称',
    dataIndex: 'name',
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueEnum: {
      '0': { text: '正常' },
      '1': { text: '停用' },
    },
  },
  {
    title: '备注',
    dataIndex: 'remark',
    ellipsis: true,
  },
];

const formColumns: ProFormColumnsType<UserRow>[] = [
  {
    title: '名称',
    dataIndex: 'name',
    valueType: 'text',
    formItemProps: { rules: [{ required: true, message: '请输入名称' }] },
  },
  {
    title: '状态',
    dataIndex: 'status',
    valueType: 'switch',
  },
  {
    title: '备注',
    dataIndex: 'remark',
    valueType: 'textarea',
  },
];

export default function UserPage() {
  return (
    <CrudTablePage<UserRow>
      title="用户管理"
      rowKey="id"
      resource={userResource}
      columns={columns}
      formColumns={formColumns}
      permissions={{
        create: 'user:create',
        edit: 'user:edit',
        remove: 'user:remove',
        status: 'user:status',
      }}
      columnConfig={[
        { dataIndex: 'name', visible: true, searchable: true },
        { dataIndex: 'remark', visible: true, searchable: false },
      ]}
      beforeSubmit={(values) => ({
        ...values,
        remark: values.remark?.trim(),
      })}
    />
  );
}
```

---

## 14. 什么时候优先用 `CrudTablePage`

建议在以下场景直接使用它：

- 标准后台列表页
- 有新增 / 编辑 / 删除 / 状态切换的资源管理页
- 希望快速统一页面风格
- 希望减少重复代码

如果是非常特殊的页面，比如：

- 自定义布局特别多
- 弹窗逻辑复杂
- 不是标准表格 CRUD

则可以直接使用 `useCrudTable` 自己拼页面，而不必强依赖 `CrudTablePage`。

---

## 15. 常见注意事项

1. `rowKey` 一定要传对，否则编辑、删除、状态切换可能找不到主键。
2. `resource` 必须提供正确的 CRUD 接口路径。
3. 如果后端要求特殊字段名，建议通过 `beforeSubmit` 做转换。
4. 如果编辑页中 `select` 的值类型不一致，优先统一成字符串。
5. 搜索模式切换会自动刷新列表，适合前后端联动搜索。
6. 如果某些字段不希望参与搜索，记得在 `columnConfig` 中设置 `searchable: false`。

---

## 16. 总结

这套封装的价值在于把 CRUD 页面里最常见的逻辑统一起来，让业务页面只关注三件事：

- 定义列
- 定义表单
- 配置资源与权限

剩下的列表请求、弹窗控制、删除、状态切换、搜索模式等通用能力，都由 `useCrudTable` 与 `CrudTablePage` 负责。
