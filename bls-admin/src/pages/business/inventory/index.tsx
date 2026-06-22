import CrudTablePage from "@/components/CrudTablePage";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";

export type InventoryRecord = {
  id: string;
  warehouseCode: string;
  warehouseName: string;
  locationCode?: string;
  productCode: string;
  productName: string;
  batchNo?: string;
  availableQty?: number;
  lockedQty?: number;
  inTransitQty?: number;
  safetyStock?: number;
  inventoryStatus?: "normal" | "low_stock" | "overstock";
  lastInboundDate?: string;
  lastOutboundDate?: string;
  remark?: string;
  createTime?: string;
};

const inventoryStatusValueEnum = {
  normal: { text: "正常", status: "Success" },
  low_stock: { text: "低库存", status: "Warning" },
  overstock: { text: "积压", status: "Error" },
};

export default function InventoryPage() {
  const columns: ProColumns<InventoryRecord>[] = [
    { title: "仓库编码", dataIndex: "warehouseCode", ellipsis: true },
    { title: "仓库名称", dataIndex: "warehouseName", ellipsis: true },
    {
      title: "库位编码",
      dataIndex: "locationCode",
      search: false,
      ellipsis: true,
    },
    {
      title: "产品编码",
      dataIndex: "productCode",
      copyable: true,
      ellipsis: true,
    },
    { title: "产品名称", dataIndex: "productName", ellipsis: true },
    { title: "批次号", dataIndex: "batchNo", search: false, ellipsis: true },
    {
      title: "可用库存",
      dataIndex: "availableQty",
      valueType: "digit",
      search: false,
    },
    {
      title: "锁定库存",
      dataIndex: "lockedQty",
      valueType: "digit",
      search: false,
    },
    {
      title: "在途库存",
      dataIndex: "inTransitQty",
      valueType: "digit",
      search: false,
    },
    {
      title: "安全库存",
      dataIndex: "safetyStock",
      valueType: "digit",
      search: false,
    },
    {
      title: "库存状态",
      dataIndex: "inventoryStatus",
      valueType: "select",
      valueEnum: inventoryStatusValueEnum,
    },
    {
      title: "最近入库",
      dataIndex: "lastInboundDate",
      valueType: "date",
      search: false,
    },
    {
      title: "最近出库",
      dataIndex: "lastOutboundDate",
      valueType: "date",
      search: false,
    },
    {
      title: "时间段",
      dataIndex: "inventoryDateRange",
      valueType: "dateRange",
      search: { transform: ([startDate, endDate]) => ({ startDate, endDate }) },
      hideInTable: true,
    },
    { title: "备注", dataIndex: "remark", search: false, ellipsis: true },
    {
      title: "创建时间",
      dataIndex: "createTime",
      valueType: "dateTime",
      search: false,
    },
  ];

  const formColumns: ProFormColumnsType<InventoryRecord>[] = [
    {
      title: "仓库编码",
      dataIndex: "warehouseCode",
      formItemProps: { rules: [{ required: true, message: "请输入仓库编码" }] },
    },
    {
      title: "仓库名称",
      dataIndex: "warehouseName",
      formItemProps: { rules: [{ required: true, message: "请输入仓库名称" }] },
    },
    { title: "库位编码", dataIndex: "locationCode" },
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
    { title: "批次号", dataIndex: "batchNo" },
    {
      title: "可用库存",
      dataIndex: "availableQty",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "锁定库存",
      dataIndex: "lockedQty",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "在途库存",
      dataIndex: "inTransitQty",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "安全库存",
      dataIndex: "safetyStock",
      valueType: "digit",
      initialValue: 0,
    },
    {
      title: "库存状态",
      dataIndex: "inventoryStatus",
      valueType: "select",
      initialValue: "normal",
      valueEnum: { normal: "正常", low_stock: "低库存", overstock: "积压" },
    },
    { title: "最近入库", dataIndex: "lastInboundDate", valueType: "date" },
    { title: "最近出库", dataIndex: "lastOutboundDate", valueType: "date" },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<InventoryRecord>
      title="库存管理"
      rowKey="id"
      resource={{ basePath: "/api/business/inventories" }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={920}
      scroll={{ x: 'max-content' }}
    />
  );
}
