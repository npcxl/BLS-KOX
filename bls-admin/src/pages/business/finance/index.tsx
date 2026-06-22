import CrudTablePage from "@/components/CrudTablePage";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";

export type FinanceRecord = {
  id: string;
  recordNo: string;
  recordType: "income" | "expense";
  businessType?: string;
  relatedNo?: string;
  counterparty?: string;
  amount: number;
  taxAmount?: number;
  recordDate: string;
  paymentMethod?: string;
  auditStatus?: "pending" | "approved" | "rejected";
  handler?: string;
  remark?: string;
  createdAt?: string;
};

const recordTypeValueEnum = {
  income: { text: "收入", status: "Success" },
  expense: { text: "支出", status: "Error" },
};
const auditStatusValueEnum = {
  pending: { text: "待审核", status: "Processing" },
  approved: { text: "已审核", status: "Success" },
  rejected: { text: "已拒绝", status: "Error" },
};

export default function FinancePage() {
  const columns: ProColumns<FinanceRecord>[] = [
    {
      title: "财务单号",
      dataIndex: "recordNo",
      copyable: true,
      ellipsis: true,
    },
    { title: "业务类型", dataIndex: "businessType", ellipsis: true },
    { title: "往来单位", dataIndex: "counterparty", ellipsis: true },
    {
      title: "类型",
      dataIndex: "recordType",
      valueType: "select",
      valueEnum: recordTypeValueEnum,
    },
    { title: "金额", dataIndex: "amount", valueType: "money", search: false },
    {
      title: "税额",
      dataIndex: "taxAmount",
      valueType: "money",
      search: false,
    },
    {
      title: "记账日期",
      dataIndex: "recordDate",
      valueType: "date",
      search: false,
    },
    {
      title: "付款方式",
      dataIndex: "paymentMethod",
      search: false,
      ellipsis: true,
    },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      valueType: "select",
      valueEnum: auditStatusValueEnum,
    },
    { title: "经办人", dataIndex: "handler", search: false },
    { title: "备注", dataIndex: "remark", search: false, ellipsis: true },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      search: false,
    },
  ];

  const formColumns: ProFormColumnsType<FinanceRecord>[] = [
    {
      title: "财务单号",
      dataIndex: "recordNo",
      formItemProps: { rules: [{ required: true, message: "请输入财务单号" }] },
    },
    {
      title: "类型",
      dataIndex: "recordType",
      valueType: "select",
      initialValue: "income",
      valueEnum: { income: "收入", expense: "支出" },
      formItemProps: { rules: [{ required: true, message: "请选择类型" }] },
    },
    { title: "业务类型", dataIndex: "businessType" },
    { title: "关联单号", dataIndex: "relatedNo" },
    { title: "往来单位", dataIndex: "counterparty" },
    {
      title: "金额",
      dataIndex: "amount",
      valueType: "money",
      formItemProps: { rules: [{ required: true, message: "请输入金额" }] },
    },
    {
      title: "税额",
      dataIndex: "taxAmount",
      valueType: "money",
      initialValue: 0,
    },
    {
      title: "记账日期",
      dataIndex: "recordDate",
      valueType: "date",
      formItemProps: { rules: [{ required: true, message: "请选择记账日期" }] },
    },
    { title: "付款方式", dataIndex: "paymentMethod" },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      valueType: "select",
      initialValue: "pending",
      valueEnum: { pending: "待审核", approved: "已审核", rejected: "已拒绝" },
    },
    { title: "经办人", dataIndex: "handler" },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<FinanceRecord>
      title="财务管理"
      rowKey="id"
      resource={{ basePath: "/api/business/finance-records" }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={860}
      scroll={{ x: 'max-content' }}
    />
  );
}
