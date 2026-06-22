import { ApartmentOutlined, SettingOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, InputNumber, List, message, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getPageColumnConfig, getPageConfig, listPageConfigs, savePageConfig, type PageColumnConfigRecord, type PageConfigRecord } from "@/services/system/page-config";

const { Text, Paragraph } = Typography;

const formTypeOptions = [
  { label: "文本", value: "text" },
  { label: "选择器", value: "select" },
  { label: "树选择", value: "treeSelect" },
  { label: "日期", value: "date" },
  { label: "日期时间", value: "dateTime" },
  { label: "文本域", value: "textarea" },
  { label: "密码", value: "password" },
  { label: "开关", value: "switch" },
];

const yesNoTag = (value?: string | null) => {
  if (value === "1") return <Tag color="green">是</Tag>;
  if (value === "0") return <Tag color="default">否</Tag>;
  return <Tag>{value ?? "-"}</Tag>;
};

const toBool = (value?: string | null) => value === "1";
const toYesNo = (value: boolean) => (value ? "1" : "0");

export default function PageConfigPage() {
  const [pageList, setPageList] = useState<PageConfigRecord[]>([]);
  const [selectedPageCode, setSelectedPageCode] = useState<string>("system_user");
  const [selectedPage, setSelectedPage] = useState<PageConfigRecord | null>(null);
  const [columns, setColumns] = useState<PageColumnConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    listPageConfigs().then((res) => setPageList(res.data ?? []));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([getPageConfig(selectedPageCode), getPageColumnConfig(selectedPageCode)])
      .then(([pageRes, columnRes]) => {
        if (!active) return;
        const page = pageRes.data ?? null;
        setSelectedPage(page);
        setColumns((columnRes.data ?? []).map((item) => ({ ...item, ellipsis: item.ellipsis ?? "0" })));
        form.setFieldsValue({
          pageCode: page?.pageCode,
          pageName: page?.pageName,
          enabled: toBool(page?.enabled),
          remark: page?.remark,
          sort: page?.sort,
          columns: (columnRes.data ?? []).map((item) => ({
            ...item,
            ellipsis: toBool(item.ellipsis),
            visible: toBool(item.visible),
            searchable: toBool(item.searchable),
            editable: toBool(item.editable),
            required: toBool(item.required),
          })),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPageCode, form]);

  const columnsDef: ProColumns<PageColumnConfigRecord>[] = useMemo(
    () => [
      { title: "字段名", dataIndex: "title", search: false, ellipsis: true, render: (_, record, index) => <Form.Item name={["columns", index, "title"]} style={{ marginBottom: 0 }}><Input /></Form.Item> },
      { title: "字段标识", dataIndex: "dataIndex", search: false, ellipsis: true, render: (_, record, index) => <Form.Item name={["columns", index, "dataIndex"]} style={{ marginBottom: 0 }}><Input /></Form.Item> },
      { title: "排序", dataIndex: "orderNum", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "orderNum"]} style={{ marginBottom: 0 }}><InputNumber style={{ width: "100%" }} /></Form.Item> },
      { title: "可见", dataIndex: "visible", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "visible"]} valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item> },
      { title: "省略", dataIndex: "ellipsis", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "ellipsis"]} valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item> },
      { title: "可搜索", dataIndex: "searchable", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "searchable"]} valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item> },
      { title: "可编辑", dataIndex: "editable", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "editable"]} valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item> },
      { title: "表单类型", dataIndex: "formType", search: false, width: 140, render: (_, record, index) => <Form.Item name={["columns", index, "formType"]} style={{ marginBottom: 0 }}><Select options={formTypeOptions} allowClear placeholder="请选择" /></Form.Item> },
      { title: "字典编码", dataIndex: "valueEnumCode", search: false, width: 150, render: (_, record, index) => <Form.Item name={["columns", index, "valueEnumCode"]} style={{ marginBottom: 0 }}><Input placeholder="可选" /></Form.Item> },
      { title: "占位提示", dataIndex: "placeholder", search: false, ellipsis: true, render: (_, record, index) => <Form.Item name={["columns", index, "placeholder"]} style={{ marginBottom: 0 }}><Input placeholder="请输入提示文案" /></Form.Item> },
      { title: "必填", dataIndex: "required", search: false, width: 90, render: (_, record, index) => <Form.Item name={["columns", index, "required"]} valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item> },
    ],
    [],
  );

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const page = {
        ...selectedPage,
        pageCode: values.pageCode,
        pageName: values.pageName,
        enabled: toYesNo(values.enabled),
        remark: values.remark,
        sort: values.sort,
      } as PageConfigRecord;
      const payloadColumns = (values.columns ?? []).map((item: PageColumnConfigRecord, index: number) => ({
        ...item,
        columnId: item.columnId,
        pageCode: page.pageCode,
        orderNum: Number(item.orderNum ?? index + 1),
        visible: toYesNo(Boolean(item.visible)),
        ellipsis: toYesNo(Boolean(item.ellipsis)),
        searchable: toYesNo(Boolean(item.searchable)),
        editable: toYesNo(Boolean(item.editable)),
        required: toYesNo(Boolean(item.required)),
      }));
      await savePageConfig({ page, columns: payloadColumns });
      message.success("保存成功");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Row gutter={16} style={{ height: "calc(100vh - 120px)" }}>
      <Col span={6} style={{ height: "100%" }}>
        <Card title={<Space><ApartmentOutlined /> 页面列表</Space>} bodyStyle={{ padding: 12, height: "calc(100% - 57px)", overflow: "auto" }} style={{ height: "100%" }}>
          <List
            dataSource={pageList}
            renderItem={(item) => (
              <List.Item style={{ cursor: "pointer", background: item.pageCode === selectedPageCode ? "#e6f7ff" : undefined, paddingInline: 12, borderRadius: 8 }} onClick={() => setSelectedPageCode(item.pageCode)}>
                <List.Item.Meta title={<Space><Text strong>{item.pageName}</Text>{item.enabled === "1" ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>}</Space>} description={<Paragraph style={{ marginBottom: 0 }} type="secondary" ellipsis={{ rows: 2 }}>{item.remark ?? item.pageCode}</Paragraph>} />
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col span={18} style={{ height: "100%" }}>
        <Card title={<Space><SettingOutlined /> {selectedPage?.pageName ?? "页面配置"}</Space>} loading={loading} extra={<Button type="primary" loading={saving} onClick={handleSave}>保存配置</Button>} style={{ height: "100%" }} bodyStyle={{ height: "calc(100% - 57px)", overflow: "auto" }}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card size="small" title="页面基础信息">
              <Form form={form} layout="inline">
                <Form.Item name="pageCode" label="页面编码"><Input disabled /></Form.Item>
                <Form.Item name="pageName" label="页面名称"><Input /></Form.Item>
                <Form.Item name="enabled" label="启用状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
                <Form.Item name="sort" label="排序"><InputNumber /></Form.Item>
                <Form.Item name="remark" label="备注"><Input style={{ width: 240 }} /></Form.Item>
              </Form>
            </Card>

            <Form form={form} component={false}>
              <Table<PageColumnConfigRecord>
                rowKey="columnId"
                dataSource={columns}
                pagination={false}
                size="small"
                columns={columnsDef}
                scroll={{ x: 1600, y: "calc(100vh - 420px)" }}
              />
            </Form>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}
