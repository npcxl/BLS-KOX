import { DeleteOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Empty, Form, Input, InputNumber, Layout, message, Popconfirm, Select, Switch, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPageColumnConfig, getPageConfig, listPageConfigs, savePageConfig, type PageColumnConfigRecord, type PageConfigRecord } from "@/services/system/page-config";
import { useDebounce } from "@/hooks/useDebounce";

const { Sider, Content } = Layout;
const { Text } = Typography;

// 不在页面配置中显示的日志相关页面
const EXCLUDED_CODES = ["system_log_operation", "system_log_upload", "system_log_login"];

const formTypeOptions = [
  { label: "文本", value: "text" },
  { label: "选择器", value: "select" },
  { label: "树选择", value: "treeSelect" },
  { label: "日期时间", value: "dateTime" },
  { label: "文本域", value: "textarea" },
  { label: "密码", value: "password" },
  { label: "开关", value: "switch" },
];

/** 防抖输入框：本地即时更新 + 300ms 后提交 */
function DebouncedInput(props: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  fontFamily?: string;
  delay?: number;
}) {
  const { value, onCommit, placeholder, style, fontFamily, delay = 300 } = props;
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, delay);
  useEffect(() => { if (debounced !== value) onCommit(debounced); }, [debounced]);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      size="small"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      style={{ padding: "2px 6px", background: "#fafafa", fontFamily, ...style }}
    />
  );
}

/** 防抖 InputNumber */
function DebouncedNumber(props: {
  value: number | undefined;
  onCommit: (v: number | null) => void;
  delay?: number;
}) {
  const { value, onCommit, delay = 300 } = props;
  const [local, setLocal] = useState<number | null>(value ?? null);
  const debounced = useDebounce(local, delay);
  useEffect(() => { if (debounced !== (value ?? null)) onCommit(debounced); }, [debounced]);
  useEffect(() => { setLocal(value ?? null); }, [value]);
  return (
    <InputNumber
      size="small"
      value={local ?? undefined}
      onChange={(v) => setLocal(typeof v === 'number' ? v : null)}
      style={{ width: 50, background: "#fafafa" }}
      min={0}
    />
  );
}

export default function PageConfigPage() {
  const [pageList, setPageList] = useState<PageConfigRecord[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("system_user");
  const [selectedPage, setSelectedPage] = useState<PageConfigRecord | null>(null);
  const [columns, setColumns] = useState<PageColumnConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form] = Form.useForm();

  // 过滤掉日志页面
  const filteredList = useMemo(
    () => pageList.filter((p) => !EXCLUDED_CODES.includes(p.pageCode)),
    [pageList],
  );

  // 搜索过滤
  const searchedList = useMemo(() => {
    if (!search.trim()) return filteredList;
    const kw = search.toLowerCase();
    return filteredList.filter(
      (p) =>
        p.pageName.toLowerCase().includes(kw) ||
        p.pageCode.toLowerCase().includes(kw) ||
        (p.remark ?? "").toLowerCase().includes(kw),
    );
  }, [filteredList, search]);

  // 加载页面列表
  useEffect(() => {
    listPageConfigs().then((res) => setPageList(res.data ?? []));
  }, []);

  // 加载选中页面配置
  useEffect(() => {
    if (!selectedCode) return;
    let active = true;
    setLoading(true);
    Promise.all([getPageConfig(selectedCode), getPageColumnConfig(selectedCode)])
      .then(([pageRes, colRes]) => {
        if (!active) return;
        setSelectedPage(pageRes.data ?? null);
        setColumns(colRes.data ?? []);
        form.setFieldsValue({
          pageName: pageRes.data?.pageName,
          enabled: pageRes.data?.enabled ?? true,
          sort: pageRes.data?.sort ?? 0,
          remark: pageRes.data?.remark,
          columns: (colRes.data ?? []).map((c) => ({ ...c })),
        });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedCode, form]);

  const [version, setVersion] = useState(0);
  const [autoSaving, setAutoSaving] = useState(false);

  // 新增列
  const addColumn = useCallback(() => {
    const newCol: PageColumnConfigRecord = {
      columnId: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pageCode: selectedCode,
      title: '',
      dataIndex: '',
      orderNum: columns.length + 1,
      visible: true,
      ellipsis: false,
      searchable: false,
      editable: true,
      copyable: false,
      required: false,
      valueType: 'text',
      valueEnumCode: '',
      placeholder: '',
    };
    setColumns((prev) => [...prev, newCol]);
    setVersion(v => v + 1);
    autoSaveRef.current?.();
  }, [columns.length, selectedCode]);

  // 删除列
  const deleteColumn = useCallback((index: number) => {
    setColumns((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    setVersion(v => v + 1);
    autoSaveRef.current?.();
  }, []);

  // 更新单个列字段 + 自动保存
  const updateColumn = useCallback((index: number, field: string, value: any) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setVersion(v => v + 1);
    autoSaveRef.current?.();
  }, []);

  // 自动保存防抖（600ms 内多次调用只执行最后一次）
  const autoSaveTimer = useRef<any>(null);
  const autoSaveRef = useRef<() => void>(() => {});
  autoSaveRef.current = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaving(true);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const values = form.getFieldsValue();
        const page = {
          ...selectedPage,
          pageCode: selectedCode,
          pageName: values.pageName,
          enabled: Boolean(values.enabled),
          sort: values.sort ?? 0,
          remark: values.remark,
        } as PageConfigRecord;
        const payload = columnsRef.current.map((item, i) => ({
          ...item,
          columnId: item.columnId,
          pageCode: selectedCode,
          orderNum: Number(item.orderNum ?? i + 1),
          visible: !!item.visible,
          ellipsis: !!item.ellipsis,
          searchable: !!item.searchable,
          editable: !!item.editable,
          copyable: !!item.copyable,
          required: !!item.required,
        }));
        await savePageConfig({ page, columns: payload });
        message.success('已保存');
      } catch { /* silent */ }
      finally { setAutoSaving(false); }
    }, 600);
  };

  // columns 引用，供 autoSave 闭包获取最新值
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // 列定义
  const columnDefs = useMemo(() => [
    {
      title: "字段名", dataIndex: "title", width: 120,
      render: (_: any, __: any, index: number) => (
        <DebouncedInput value={columns[index]?.title ?? ""}
          onCommit={(v) => updateColumn(index, "title", v)} />
      ),
    },
    {
      title: "字段标识", dataIndex: "dataIndex", width: 130,
      render: (_: any, __: any, index: number) => (
        <DebouncedInput value={columns[index]?.dataIndex ?? ""}
          onCommit={(v) => updateColumn(index, "dataIndex", v)} fontFamily="monospace" />
      ),
    },
    {
      title: "排序", dataIndex: "orderNum", width: 60, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <DebouncedNumber value={columns[index]?.orderNum}
          onCommit={(v) => updateColumn(index, "orderNum", v)} />
      ),
    },
    {
      title: "可见", dataIndex: "visible", width: 56, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.visible}
          onChange={(v) => updateColumn(index, "visible", v)} />
      ),
    },
    {
      title: "省略", dataIndex: "ellipsis", width: 56, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.ellipsis}
          onChange={(v) => updateColumn(index, "ellipsis", v)} />
      ),
    },
    {
      title: "搜索", dataIndex: "searchable", width: 56, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.searchable}
          onChange={(v) => updateColumn(index, "searchable", v)} />
      ),
    },
    {
      title: "编辑", dataIndex: "editable", width: 56, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.editable}
          onChange={(v) => updateColumn(index, "editable", v)} />
      ),
    },
    {
      title: "可复制", dataIndex: "copyable", width: 62, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.copyable}
          onChange={(v) => updateColumn(index, "copyable", v)} />
      ),
    },
    {
      title: "必填", dataIndex: "required", width: 56, align: "center" as const,
      render: (_: any, __: any, index: number) => (
        <Switch size="small" checked={!!columns[index]?.required}
          onChange={(v) => updateColumn(index, "required", v)} />
      ),
    },
    {
      title: "类型", dataIndex: "valueType", width: 110,
      render: (_: any, __: any, index: number) => (
        <Select size="small" value={columns[index]?.valueType ?? undefined}
          onChange={(v) => updateColumn(index, "valueType", v)}
          options={formTypeOptions} allowClear placeholder="类型"
          style={{ width: 100, background: "#fafafa" }} />
      ),
    },
    {
      title: "字典编码", dataIndex: "valueEnumCode", width: 130,
      render: (_: any, __: any, index: number) => (
        <DebouncedInput value={columns[index]?.valueEnumCode ?? ""}
          onCommit={(v) => updateColumn(index, "valueEnumCode", v)}
          placeholder="可选" fontFamily="monospace" />
      ),
    },
    {
      title: "占位提示", dataIndex: "placeholder", ellipsis: true,
      render: (_: any, __: any, index: number) => (
        <DebouncedInput value={columns[index]?.placeholder ?? ""}
          onCommit={(v) => updateColumn(index, "placeholder", v)}
          placeholder="提示文案" />
      ),
    },
    {
      title: "操作", width: 60, align: "center" as const, fixed: "right" as const,
      render: (_: any, __: any, index: number) => (
        <Popconfirm
          title="确认删除此列？"
          onConfirm={() => deleteColumn(index)}
          okText="删除"
          cancelText="取消"
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ], [columns, updateColumn, deleteColumn]);

  // 保存
  const handleSave = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();
      setSaving(true);
      const page = {
        ...selectedPage,
        pageCode: selectedCode,
        pageName: values.pageName,
        enabled: Boolean(values.enabled),
        sort: values.sort ?? 0,
        remark: values.remark,
      } as PageConfigRecord;
      const payload = columns.map((item, i) => ({
        ...item,
        columnId: item.columnId,
        pageCode: selectedCode,
        orderNum: Number(item.orderNum ?? i + 1),
        visible: !!item.visible,
        ellipsis: !!item.ellipsis,
        searchable: !!item.searchable,
        editable: !!item.editable,
        copyable: !!item.copyable,
        required: !!item.required,
      }));
      await savePageConfig({ page, columns: payload });
      message.success("保存成功");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="页面配置"
      subTitle="管理各页面的列配置"
      extra={[
        <Button key="save" type="primary" loading={saving || autoSaving} onClick={handleSave} icon={<SettingOutlined />}>
          {autoSaving ? '保存中...' : '保存配置'}
        </Button>,
      ]}
    >
      <style>{`.thin-scrollbar::-webkit-scrollbar{width:4px}.thin-scrollbar::-webkit-scrollbar-thumb{background:#d9d9d9;border-radius:2px}.thin-scrollbar::-webkit-scrollbar-thumb:hover{background:#bfbfbf}`}</style>
    <Layout style={{ background: "#fff", overflow: "hidden" }}>
      <Sider width={260} style={{ background: "#fafafa", borderRight: "1px solid #f0f0f0", overflow: "hidden",
        height:"660px"
       }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 12px 0", flexShrink: 0 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索页面..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
        </div>
        <div className="thin-scrollbar" style={{ flex: 1, overflow: "auto", padding: "0 8px 8px", scrollbarWidth: "thin", scrollbarColor: "#d9d9d9 transparent" }}>
          {searchedList.length === 0 ? (
            <Empty description="无匹配页面" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
          ) : (
            searchedList.map((item) => {
              const active = item.pageCode === selectedCode;
              return (
                <div
                  key={item.pageCode}
                  onClick={() => setSelectedCode(item.pageCode)}
                  style={{
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: 6,
                    marginBottom: 4,
                    background: active ? "#e6f4ff" : "transparent",
                    border: active ? "1px solid #91caff" : "1px solid transparent",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "#f5f5f5"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Text strong={active} style={{ fontSize: 13 }}>{item.pageName}</Text>
                    {!!item.enabled ? (
                      <Tag color="green" style={{ marginRight: 0, fontSize: 10, lineHeight: "18px", padding: "0 4px" }}>启用</Tag>
                    ) : (
                      <Tag style={{ marginRight: 0, fontSize: 10, lineHeight: "18px", padding: "0 4px" }}>停用</Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#8c8c8c", marginTop: 2 }}>
                    <code>{item.pageCode}</code>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </div>
      </Sider>
      <Content style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
          <SettingOutlined />
          <Text strong style={{ fontSize: 14 }}>{selectedPage?.pageName ?? "页面配置"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}><code>{selectedCode}</code></Text>
        </div>

        <Form form={form} size="small" layout="inline" style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", flexWrap: "wrap", gap: 4 }}>
          <Form.Item name="pageName" label="页面名称" style={{ marginBottom: 0 }}>
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch size="small" />
          </Form.Item>
          <Form.Item name="sort" label="排序" style={{ marginBottom: 0 }}>
            <InputNumber style={{ width: 80 }} min={0} />
          </Form.Item>
          <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
            <Input style={{ width: 200 }} />
          </Form.Item>
        </Form>

        <div className="thin-scrollbar" style={{ flex: 1, overflow: "auto", padding: 8, scrollbarWidth: "thin", scrollbarColor: "#d9d9d9 transparent" }}>
          {loading ? null : (
            <>
              <Table<PageColumnConfigRecord>
                key={version}
                rowKey="columnId"
                dataSource={columns}
                pagination={false}
                size="small"
                loading={loading}
                columns={columnDefs}
                scroll={{ x: 1300 }}
                locale={{ emptyText: <Empty description="暂无列配置" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              />
              <div style={{ padding: "8px 0", textAlign: "center" }}>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addColumn} style={{ width: "100%" }}>
                  新增列
                </Button>
              </div>
            </>
          )}
        </div>
      </Content>
    </Layout>
    </PageContainer>
  );
}
