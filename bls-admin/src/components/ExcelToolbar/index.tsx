import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import { ProFormDigit, ProFormRadio } from "@ant-design/pro-components";
import { request } from "@umijs/max";
import { Button, Modal, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { RcFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState } from "react";

export type ExcelToolbarProps = {
  metaKey: string;
  queryParams?: Record<string, any>;
};

type ImportResult = {
  successCount: number;
  failedCount: number;
  totalCount: number;
  errorFileName?: string;
};

const MAX_EXPORT = 10000;

export default function ExcelToolbar({
  metaKey,
  queryParams,
}: ExcelToolbarProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "limit">("all");
  const [limit, setLimit] = useState<number>(MAX_EXPORT);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);

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
  };

  const doExport = async () => {
    const finalLimit =
      mode === "limit"
        ? Math.max(1, Math.min(MAX_EXPORT, Number(limit || MAX_EXPORT)))
        : MAX_EXPORT;
    if (mode === "limit" && Number(limit) > MAX_EXPORT)
      message.warning("自定义导出条数已自动修正为10000");
    const res = await request("/api/common/excel/export", {
      method: "POST",
      data: { ...payload, exportMode: mode, customMaxNum: finalLimit },
      responseType: "blob" as any,
      getResponse: true,
    } as any);
    const file = (res as any)?.data as Blob;
    const matched = Number(
      (res as any)?.headers?.["x-excel-matched-count"] ?? 0
    );
    const exportCount = Number(
      (res as any)?.headers?.["x-excel-export-count"] ?? 0
    );
    setMatchedCount(matched);
    if (mode === "all" && matched > MAX_EXPORT)
      message.warning(
        `匹配数据共${matched}条，单次导出上限10000条，仅导出前10000条`
      );
    if (mode === "all" && exportCount <= MAX_EXPORT)
      message.success(`已导出${exportCount}条`);
    downloadBlob(file, `${metaKey}-export.xlsx`);
  };

  const doImport = async () => {
    if (!fileList[0]) return message.error("请选择Excel文件");
    const form = new FormData();
    form.append("metaKey", metaKey);
    form.append("file", fileList[0].originFileObj as Blob);
    const res = await request<ImportResult>("/api/common/excel/import", {
      method: "POST",
      data: form,
    });
    setResult(res);
    if (res.errorFileName) message.warning("存在错误行，可下载错误明细");
  };

  useEffect(() => {
    if (!open) {
      setResult(null);
      setFileList([]);
      setMode("all");
      setLimit(MAX_EXPORT);
      setMatchedCount(null);
    }
  }, [open]);

  return (
    <Space wrap>
      <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
        下载模板
      </Button>
      <Button onClick={doExport}>导出</Button>
      <Button icon={<InboxOutlined />} onClick={() => setOpen(true)}>
        导入
      </Button>
      <Modal
        open={open}
        title={`导入 ${metaKey}`}
        onCancel={() => setOpen(false)}
        onOk={doImport}
        okText="开始导入"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button onClick={downloadTemplate}>下载模板</Button>
          <ProFormRadio.Group
            label="导出方式"
            options={[
              { label: "导出全部", value: "all" },
              { label: "自定义导出条数", value: "limit" },
            ]}
            fieldProps={{
              value: mode,
              onChange: (e) => setMode(e.target.value),
            }}
          />
          {mode === "limit" && (
            <ProFormDigit
              label="自定义条数"
              min={1}
              max={MAX_EXPORT}
              fieldProps={{ value: limit, onChange: (value) => setLimit(Number(value)) }}
            />
          )}
          <Upload.Dragger
            beforeUpload={(file) => {
              setFileList([
                {
                  uid: file.uid,
                  name: file.name,
                  status: "done",
                  originFileObj: file as RcFile,
                },
              ]);
              return false;
            }}
            fileList={fileList}
            onRemove={() => setFileList([])}
            maxCount={1}
            accept=".xlsx,.xls"
          >
            <p>点击或拖拽上传Excel</p>
          </Upload.Dragger>
          {matchedCount !== null && (
            <Typography.Text>匹配数据 {matchedCount} 条</Typography.Text>
          )}
          {result && (
            <Space direction="vertical">
              <Typography.Text>
                成功 {result.successCount}，失败 {result.failedCount}，总计{" "}
                {result.totalCount}
              </Typography.Text>
              {result.errorFileName && (
                <Typography.Text>
                  存在错误明细文件，可直接下载。
                </Typography.Text>
              )}
            </Space>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
