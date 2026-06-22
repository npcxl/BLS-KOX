import CrudTablePage from "@/components/CrudTablePage";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";

export type SalesRecord = {
  id: string;
  salesNo: string;
  orderNo?: string;
  customerName: string;
  productCode: string;
  productName: string;
  salesQuantity: number;
  unitPrice: number;
  salesAmount: number;
  salesDate: string;
  salesRegion?: string;
  salesChannel?: string;
  salesOwner?: string;
  deliveryStatus?: "pending" | "partial" | "shipped";
  invoiceStatus?: "not_invoiced" | "partial" | "invoiced";
  remark?: string;
  createdAt?: string;
};

const deliveryStatusValueEnum = {
  pending: { text: "待发货", status: "Processing" },
  partial: { text: "部分发货", status: "Warning" },
  shipped: { text: "已发货", status: "Success" },
};
const invoiceStatusValueEnum = {
  not_invoiced: { text: "未开票", status: "Default" },
  partial: { text: "部分开票", status: "Processing" },
  invoiced: { text: "已开票", status: "Success" },
};

export default function SalesPage() {
  const columns: ProColumns<SalesRecord>[] = [
    { title: "销售单号", dataIndex: "salesNo", copyable: true, ellipsis: true },
    {
      title: "关联订单号",
      dataIndex: "orderNo",
      copyable: true,
      ellipsis: true,
    },
    { title: "客户名称", dataIndex: "customerName", ellipsis: true },
    { title: "产品名称", dataIndex: "productName", ellipsis: true },
    {
      title: "销售数量",
      dataIndex: "salesQuantity",
      valueType: "digit",
      search: false,
    },
    {
      title: "单价",
      dataIndex: "unitPrice",
      valueType: "money",
      search: false,
    },
    {
      title: "销售金额",
      dataIndex: "salesAmount",
      valueType: "money",
      search: false,
    },
    {
      title: "销售日期",
      dataIndex: "salesDate",
      valueType: "date",
      search: false,
    },
    { title: "区域", dataIndex: "salesRegion", search: false },
    { title: "渠道", dataIndex: "salesChannel", search: false },
    { title: "负责人", dataIndex: "salesOwner", search: false },
    {
      title: "发货状态",
      dataIndex: "deliveryStatus",
      valueType: "select",
      valueEnum: deliveryStatusValueEnum,
    },
    {
      title: "开票状态",
      dataIndex: "invoiceStatus",
      valueType: "select",
      valueEnum: invoiceStatusValueEnum,
    },
    {
      title: "时间段",
      dataIndex: "salesDateRange",
      valueType: "dateRange",
      search: { transform: (value: [string, string]) => ({ startDate: value?.[0], endDate: value?.[1] }) },
      hideInTable: true,
    },
    { title: "备注", dataIndex: "remark", search: false, ellipsis: true },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      search: false,
    },
  ];

  const formColumns: ProFormColumnsType<SalesRecord>[] = [
    {
      title: "销售单号",
      dataIndex: "salesNo",
      formItemProps: { rules: [{ required: true, message: "请输入销售单号" }] },
    },
    { title: "关联订单号", dataIndex: "orderNo" },
    {
      title: "客户名称",
      dataIndex: "customerName",
      formItemProps: { rules: [{ required: true, message: "请输入客户名称" }] },
    },
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
    {
      title: "销售数量",
      dataIndex: "salesQuantity",
      valueType: "digit",
      formItemProps: { rules: [{ required: true, message: "请输入销售数量" }] },
    },
    {
      title: "单价",
      dataIndex: "unitPrice",
      valueType: "money",
      formItemProps: { rules: [{ required: true, message: "请输入单价" }] },
    },
    {
      title: "销售金额",
      dataIndex: "salesAmount",
      valueType: "money",
      formItemProps: { rules: [{ required: true, message: "请输入销售金额" }] },
    },
    {
      title: "销售日期",
      dataIndex: "salesDate",
      valueType: "date",
      formItemProps: { rules: [{ required: true, message: "请选择销售日期" }] },
    },
    { title: "销售区域", dataIndex: "salesRegion" },
    { title: "销售渠道", dataIndex: "salesChannel" },
    { title: "销售负责人", dataIndex: "salesOwner" },
    {
      title: "发货状态",
      dataIndex: "deliveryStatus",
      valueType: "select",
      initialValue: "pending",
      valueEnum: deliveryStatusValueEnum,
    },
    {
      title: "开票状态",
      dataIndex: "invoiceStatus",
      valueType: "select",
      initialValue: "not_invoiced",
      valueEnum: {
        not_invoiced: "未开票",
        partial: "部分开票",
        invoiced: "已开票",
      },
    },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<SalesRecord>
      title="销售管理"
      rowKey="id"
      resource={{ basePath: "/api/business/sales-records" }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={920}
      scroll={{ x: 'max-content' }}
    />
  );
}
