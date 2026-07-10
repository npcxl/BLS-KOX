import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import { Button, InputNumber, Modal, Progress, Radio, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { RcFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState } from "react";
import { request } from "@umijs/max";

export type ExcelToolbarProps = {
  metaKey: string;
  queryParams?: Record<string, any>;
};

type ErrorRow = { row: number; errors: string[]; data: Record<string, any> };
type ImportResult = {
  successCount: number;
  failedCount: number;
  totalCount: number;
  errorRows?: ErrorRow[];
};

const MAX_EXPORT = 10000;

export default function ExcelToolbar({
  metaKey,
  queryParams,
}: ExcelToolbarProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "limit">("all");
  const [limit, setLimit] = useState<number>(MAX_EXPORT);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const payload = useMemo(
    () => ({ ...(queryParams ?? {}), metaKey }),
    [metaKey, queryParams]
  );

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = async () => {
    const res = await request("/api/common/excel/template", {
      method: "GET",
      params: { metaKey },
      responseType: "blob" as any,
    });
    downloadBlob(res as any, `${metaKey}-template.xlsx`);
    message.success("模板已下载");
  };

  const doExport = async () => {
    try {
      setExporting(true);
      const finalLimit = mode === "limit" ? Math.max(1, Math.min(MAX_EXPORT, Number(limit || MAX_EXPORT))) : MAX_EXPORT;
      const res = await request("/api/common/excel/export", {
        method: "POST",
        data: { ...payload, exportMode: mode, customMaxNum: finalLimit },
        responseType: "blob" as any,
        getResponse: true,
      } as any);
      const file = (res as any)?.data as Blob;
      const matched = Number((res as any)?.headers?.["x-excel-matched-count"] ?? 0);
      const exportCount = Number((res as any)?.headers?.["x-excel-export-count"] ?? 0);
      if (matched > MAX_EXPORT) {
        message.warning(`匹配数据共${matched}条，上限${MAX_EXPORT}条，已导出前${MAX_EXPORT}条`);
      } else {
        message.success(`导出成功，共${exportCount}条`);
      }
      downloadBlob(file, `${metaKey}-export.xlsx`);
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const doImport = async () => {
    if (!fileList[0]) {
      message.error("请选择Excel文件");
      return;
    }
    try {
      setImporting(true);
      const form = new FormData();
      form.append("metaKey", metaKey);
      form.append("file", fileList[0].originFileObj as Blob);
      const res = await request<ImportResult>("/api/common/excel/import", {
        method: "POST",
        data: form,
      });
      setResult(res);
      if (res.failedCount === 0) {
        message.success(`导入成功！共${res.successCount}条`);
      } else if (res.successCount > 0) {
        message.warning(`导入完成：成功${res.successCount}条，失败${res.failedCount}条`);
      } else {
        message.error(`导入失败：${res.failedCount}条全部失败`);
      }
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!importOpen) { setResult(null); setFileList([]); }
  }, [importOpen]);

  useEffect(() => {
    if (!exportOpen) { setMode("all"); setLimit(MAX_EXPORT); }
  }, [exportOpen]);

  return (
    <Space wrap>
      <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
        下载模板
      </Button>
      <Button onClick={() => setExportOpen(true)}>导出</Button>
      <Button icon={<InboxOutlined />} onClick={() => setImportOpen(true)}>
        导入
      </Button>

      {/* 导出弹窗 */}
      <Modal
        open={exportOpen}
        title={`导出 ${metaKey}`}
        onCancel={() => setExportOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportOpen(false)}>取消</Button>,
          <Button key="export" type="primary" loading={exporting} onClick={doExport}>开始导出</Button>,
        ]}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio value="all">导出全部（上限{MAX_EXPORT}条）</Radio>
            <Radio value="limit">自定义导出条数</Radio>
          </Radio.Group>
          {mode === "limit" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>导出条数</span>
              <InputNumber min={1} max={MAX_EXPORT} value={limit} onChange={(v) => setLimit(Number(v ?? MAX_EXPORT))} />
            </div>
          )}
          {exporting && <Progress percent={99} status="active" />}
        </Space>
      </Modal>

      {/* 导入弹窗 */}
      <Modal
        open={importOpen}
        title={`导入 ${metaKey}`}
        onCancel={() => setImportOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportOpen(false)}>取消</Button>,
          <Button key="import" type="primary" loading={importing} onClick={doImport} disabled={importing}>开始导入</Button>,
        ]}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button onClick={downloadTemplate}>下载模板</Button>
          <Upload.Dragger
            beforeUpload={(file) => {
              setFileList([{ uid: file.uid, name: file.name, status: "done", originFileObj: file as RcFile }]);
              return false;
            }}
            fileList={fileList}
            onRemove={() => setFileList([])}
            maxCount={1}
            accept=".xlsx,.xls"
            disabled={importing}
          >
            <p>点击或拖拽上传Excel</p>
          </Upload.Dragger>
          {importing && <Progress percent={99} status="active" />}
          {result && (
            <Space direction="vertical" style={{ width: "100%" }}>
              <Typography.Text>
                成功 <Typography.Text type="success" strong>{result.successCount}</Typography.Text>
                ，失败 <Typography.Text type="danger" strong>{result.failedCount}</Typography.Text>
                ，总计 {result.totalCount}
              </Typography.Text>
              {result.errorRows && result.errorRows.length > 0 && (
                <Space direction="vertical" style={{ width: "100%", maxHeight: 240, overflow: "auto" }}>
                  {result.errorRows.map((e, i) => (
                    <Typography.Text key={i} type="danger" style={{ display: "block" }}>
                      第{e.row}行：{e.errors.join("；")}
                    </Typography.Text>
                  ))}
                  {result.failedCount > 50 && (
                    <Typography.Text type="secondary">仅显示前50条，共{result.failedCount}条失败</Typography.Text>
                  )}
                </Space>
              )}
            </Space>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
