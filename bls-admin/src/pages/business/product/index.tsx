import CrudTablePage from "@/components/CrudTablePage";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";

export type ProductRecord = {
  id: string;
  productCode: string;
  productName: string;
  productModel?: string;
  categoryName?: string;
  unit?: string;
  standardPrice?: number;
  costPrice?: number;
  safetyStock?: number;
  productStatus?: "active" | "inactive" | "trial";
  remark?: string;
  createdAt?: string;
};

const productStatusValueEnum = {
  active: { text: "启用", status: "Success" },
  inactive: { text: "停用", status: "Default" },
  trial: { text: "试产", status: "Processing" },
};

export default function ProductPage() {
  const columns: ProColumns<ProductRecord>[] = [
    {
      title: "产品编码",
      dataIndex: "productCode",
      copyable: true,
      ellipsis: true,
    },
    { title: "产品名称", dataIndex: "productName", ellipsis: true },
    {
      title: "规格型号",
      dataIndex: "productModel",
      search: false,
      ellipsis: true,
    },
    {
      title: "产品分类",
      dataIndex: "categoryName",
      search: false,
      ellipsis: true,
    },
    { title: "单位", dataIndex: "unit", search: false },
    {
      title: "标准售价",
      dataIndex: "standardPrice",
      valueType: "money",
      search: false,
    },
    {
      title: "成本价",
      dataIndex: "costPrice",
      valueType: "money",
      search: false,
    },
    {
      title: "安全库存",
      dataIndex: "safetyStock",
      valueType: "digit",
      search: false,
    },
    {
      title: "状态",
      dataIndex: "productStatus",
      valueType: "select",
      valueEnum: productStatusValueEnum,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      search: false,
    },
    {
      title: "创建时间",
      dataIndex: "createdAtRange",
      valueType: "dateRange",
      search: { transform: ([startDate, endDate]) => ({ startDate, endDate }) },
      hideInTable: true,
    },
    { title: "备注", dataIndex: "remark", search: false, ellipsis: true },
  ];

  const formColumns: ProFormColumnsType<ProductRecord>[] = [
    {
      title: "产品编码",
      dataIndex: "productCode",
      formItemProps: { rules: [{ required: true, message: "请输入产品编码" }] },
    },
    {
      title: "产品名称",
      dataIndex: "productName",
      formItemProps: { rules: [{ required: true, message: "请输入产品名称" }] },
    },
    { title: "规格型号", dataIndex: "productModel" },
    { title: "产品分类", dataIndex: "categoryName" },
    { title: "单位", dataIndex: "unit", initialValue: "台" },
    {
      title: "标准售价",
      dataIndex: "standardPrice",
      valueType: "money",
      initialValue: 0,
    },
    {
      title: "成本价",
      dataIndex: "costPrice",
      valueType: "money",
      initialValue: 0,
    },
    {
      title: "安全库存",
      dataIndex: "safetyStock",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "状态",
      dataIndex: "productStatus",
      valueType: "select",
      initialValue: "active",
      valueEnum: { active: "启用", inactive: "停用", trial: "试产" },
    },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<ProductRecord>
      title="产品管理"
      rowKey="id"
      resource={{ basePath: "/api/business/products" }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={860}
      scroll={{ x: 'max-content' }}
    />
  );
}
