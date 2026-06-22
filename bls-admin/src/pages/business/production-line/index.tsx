import CrudTablePage from "@/components/CrudTablePage";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";

export type ProductionLineRecord = {
  id: string;
  lineCode: string;
  lineName: string;
  workshopName: string;
  lineType?: string;
  mainProduct?: string;
  lineManager?: string;
  shiftType?: string;
  dailyCapacity?: number;
  currentCapacity?: number;
  equipmentCount?: number;
  workerCount?: number;
  yieldRate?: number;
  utilizationRate?: number;
  status?: "running" | "maintenance" | "stopped" | "idle";
  remark?: string;
  createdAt?: string;
};

const statusValueEnum = {
  running: { text: "运行中", status: "Success" },
  maintenance: { text: "维护中", status: "Warning" },
  stopped: { text: "停线", status: "Error" },
  idle: { text: "空闲", status: "Default" },
};

export default function ProductionLinePage() {
  const columns: ProColumns<ProductionLineRecord>[] = [
    {
      title: "流水线编码",
      dataIndex: "lineCode",
      copyable: true,
      ellipsis: true,
      width: 150,
    },
    { title: "流水线名称", dataIndex: "lineName", ellipsis: true, width: 150 },
    {
      title: "所属车间",
      dataIndex: "workshopName",
      ellipsis: true,
      width: 120,
    },
    {
      title: "产线类型",
      dataIndex: "lineType",
      search: false,
      ellipsis: true,
      width: 120,
    },
    {
      title: "主要产品",
      dataIndex: "mainProduct",
      search: false,
      ellipsis: true,
      width: 120,
    },
    { title: "负责人", dataIndex: "lineManager", search: false, width: 80 },
    { title: "班次类型", dataIndex: "shiftType", search: false, width: 80 },
    {
      title: "设计日产能",
      dataIndex: "dailyCapacity",
      valueType: "digit",
      search: false,
      width: 100,
    },
    {
      title: "当前日产量",
      dataIndex: "currentCapacity",
      valueType: "digit",
      search: false,
      width: 100,
    },
    {
      title: "设备数量",
      dataIndex: "equipmentCount",
      valueType: "digit",
      search: false,
      width: 80,
    },
    {
      title: "作业人数",
      dataIndex: "workerCount",
      valueType: "digit",
      search: false,
      width: 80,
    },
    {
      title: "良品率",
      dataIndex: "yieldRate",
      valueType: "percent",
      search: false,
      width: 100,
    },
    {
      title: "稼动率",
      dataIndex: "utilizationRate",
      valueType: "percent",
      search: false,
      width: 100,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: statusValueEnum,
      width: 100,
    },
    {
      title: "时间段",
      dataIndex: "lineDateRange",
      valueType: "dateRange",
      search: { transform: ([startDate, endDate]) => ({ startDate, endDate }) },
      hideInTable: true,
      width: 150,
    },
    {
      title: "备注",
      dataIndex: "remark",
      search: false,
      ellipsis: true,
      width: 150,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      search: false,
      width: 180,
    },
  ];

  const formColumns: ProFormColumnsType<ProductionLineRecord>[] = [
    {
      title: "流水线编码",
      dataIndex: "lineCode",
      formItemProps: {
        rules: [{ required: true, message: "请输入流水线编码" }],
      },
    },
    {
      title: "流水线名称",
      dataIndex: "lineName",
      formItemProps: {
        rules: [{ required: true, message: "请输入流水线名称" }],
      },
    },
    {
      title: "所属车间",
      dataIndex: "workshopName",
      formItemProps: { rules: [{ required: true, message: "请输入所属车间" }] },
    },
    { title: "产线类型", dataIndex: "lineType" },
    { title: "主要产品", dataIndex: "mainProduct" },
    { title: "负责人", dataIndex: "lineManager" },
    { title: "班次类型", dataIndex: "shiftType" },
    {
      title: "设计日产能",
      dataIndex: "dailyCapacity",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "当前日产量",
      dataIndex: "currentCapacity",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "设备数量",
      dataIndex: "equipmentCount",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "作业人数",
      dataIndex: "workerCount",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "良品率",
      dataIndex: "yieldRate",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "稼动率",
      dataIndex: "utilizationRate",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      initialValue: "running",
      valueEnum: {
        running: "运行中",
        maintenance: "维护中",
        stopped: "停线",
        idle: "空闲",
      },
    },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<ProductionLineRecord>
      title="生产流水线管理"
      rowKey="id"
      resource={{ basePath: "/api/business/production-lines" }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={920}
      scroll={{ x: "max-content" }}
    />
  );
}
