import { ReloadOutlined } from "@ant-design/icons";
import { request } from "@umijs/max";
import { Button, Checkbox, Modal, message, Progress, Space, Typography } from "antd";
import { useEffect, useState } from "react";

type ModuleOption = { moduleKey: string; moduleName: string };
type RebuildResult = {
  totalTables: number; successTables: number; failedTables: number;
  totalRows: number; details: { moduleKey: string; moduleName: string; rowCount: number; error?: string }[];
};

const RebuildIndexModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [indeterminate, setIndeterminate] = useState(false);
  const [checkAll, setCheckAll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RebuildResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    request<{ code: number; data: ModuleOption[] }>("/api/system/global-search/index/modules")
      .then((res) => {
        const list = res.data ?? [];
        setModules(list);
        const keys = list.map((m) => m.moduleKey);
        setSelected(keys);
        setCheckAll(true);
        setResult(null);
        setProgress(0);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const onCheckAllChange = (checked: boolean) => {
    setCheckAll(checked);
    setSelected(checked ? modules.map((m) => m.moduleKey) : []);
    setIndeterminate(false);
  };

  const onItemChange = (keys: string[]) => {
    setSelected(keys);
    setIndeterminate(!!keys.length && keys.length < modules.length);
    setCheckAll(keys.length === modules.length);
  };

  const handleRebuild = async () => {
    if (!selected.length) { message.warning("请至少选择一个模块"); return; }
    setRebuilding(true);
    setResult(null);
    setProgress(30);

    try {
      const res = await request<{ code: number; data: RebuildResult; message?: string }>(
        "/api/system/global-search/index/rebuild",
        { method: "POST", data: { moduleKeys: selected } }
      );
      setProgress(100);
      if (res.code === 200) {
        setResult(res.data!);
        message.success(`索引重建完成：${res.data?.totalRows ?? 0}条`);
      }
    } catch {
      setProgress(0);
      message.error("重建失败");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <Modal
      title="重建搜索索引"
      open={open}
      onCancel={onClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose}>关闭</Button>,
        <Button key="rebuild" type="primary" loading={rebuilding} onClick={handleRebuild} icon={<ReloadOutlined />}>
          开始重建
        </Button>,
      ]}
      destroyOnHidden
    >
      {loading ? (
        <Typography.Text type="secondary">加载模块列表...</Typography.Text>
      ) : (
        <>
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            选择需要重建索引的数据表：
          </Typography.Text>

          <Checkbox indeterminate={indeterminate} checked={checkAll} onChange={(e) => onCheckAllChange(e.target.checked)}>
            全选
          </Checkbox>
          <div style={{ borderTop: "1px solid #f0f0f0", margin: "8px 0" }} />

          <Checkbox.Group value={selected} onChange={(v) => onItemChange(v as string[])}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {modules.map((m) => (
                <Checkbox key={m.moduleKey} value={m.moduleKey}>{m.moduleName}</Checkbox>
              ))}
            </Space>
          </Checkbox.Group>

          {rebuilding && <Progress percent={progress} status="active" style={{ marginTop: 16 }} />}

          {result && (
            <div style={{ marginTop: 16, background: "#fafafa", borderRadius: 6, padding: 12 }}>
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                重建结果：共 {result.totalRows} 条索引
              </Typography.Text>
              {result.details.map((d) => (
                <div key={d.moduleKey} style={{ fontSize: 12, lineHeight: "22px" }}>
                  <Typography.Text>{d.moduleName}：</Typography.Text>
                  {d.error ? (
                    <Typography.Text type="danger">{d.error}</Typography.Text>
                  ) : (
                    <Typography.Text type="success">{d.rowCount} 条</Typography.Text>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default RebuildIndexModal;
