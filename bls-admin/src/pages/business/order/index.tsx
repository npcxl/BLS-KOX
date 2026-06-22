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
