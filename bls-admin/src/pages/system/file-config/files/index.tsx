import CrudTablePage from "@/components/CrudTablePage";
import FileUploadModal from "@/components/FileUploadModal";
import { useDict } from "@/hooks/useDict";
import { CopyOutlined } from "@ant-design/icons";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";
import { request } from "@umijs/max";
import { Button, Image, message, Space, Tag, Tooltip } from "antd";
import { useMemo, useState } from "react";

export type FileRecord = {
  fileId: string;
  tenantId: string;
  storageId: string;
  bucketName: string;
  objectName: string;
  originalName: string;
  fileName: string;
  fileExt?: string;
  mimeType?: string;
  fileSize: number;
  accessType: "public" | "private";
  moduleName?: string;
  url?: string;
  createTime?: string;
};

function FilePageInner() {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  //字典
  const { valueEnum: statusValueEnum } = useDict("sys_bucket_access_type");
  const copyText = async (text?: string | null) => {
    if (!text) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        message.success("地址已复制");
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.setAttribute("readonly", "readonly");

      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const success = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (success) {
        message.success("地址已复制");
      } else {
        message.error("复制失败，请手动复制");
      }
    } catch (error) {
      console.error("复制失败:", error);
      message.error("复制失败，请手动复制");
    }
  };

  const columns: ProColumns<FileRecord>[] = [
    { title: "原始文件名", dataIndex: "originalName", ellipsis: true },
    {
      title: "存储文件名",
      dataIndex: "fileName",
      search: false,
      ellipsis: true,
    },
    { title: "桶名称", dataIndex: "bucketName", search: false, ellipsis: true },
    {
      title: "对象路径",
      dataIndex: "objectName",
      search: false,
      ellipsis: true,
    },
    { title: "模块", dataIndex: "moduleName", valueType: "text" },
    {
      title: "访问类型",
      dataIndex: "accessType",
      valueType: "select",
      valueEnum: statusValueEnum,
      render: (_, r) => (
        <Tag color={r.accessType === 'public' ? 'success' : 'warning'}>
          {statusValueEnum[r.accessType]?.text ?? (r.accessType === 'public' ? '公开' : '私有')}
        </Tag>
      ),
    },
    { title: "文件大小", dataIndex: "fileSize", search: false },
    {
      title: "公共 URL",
      dataIndex: "url",
      search: false,
      ellipsis: true,
      onCell: () => ({ style: { height: 72 } }),
      render: (_, record) => {
        const url = record.url;
        if (!url) return "-";
        const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
        return (
          <Space size={8} style={{ minWidth: 0, alignItems: "center" }}>
            {isImage ? (
              <Image
                width={56}
                height={56}
                src={url}
                style={{
                  objectFit: "cover",
                  borderRadius: 6,
                  flex: "0 0 auto",
                }}
                preview={{ mask: "预览" }}
              />
            ) : null}
            <Tooltip title="复制地址">
              <Button
                type="link"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(url)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      valueType: "dateTime",
      search: false,
    },
  ];

  const formColumns: ProFormColumnsType<FileRecord>[] = [
    { title: "模块", dataIndex: "moduleName" },
    {
      title: "访问类型",
      dataIndex: "accessType",
      valueType: "select",
      initialValue: "private",
      valueEnum: statusValueEnum,
    },
  ];

  const toolbarExtra = useMemo(
    () => [
      <Button key="upload" type="primary" onClick={() => setOpen(true)}>
        上传文件
      </Button>,
    ],
    []
  );

  const handleDownload = (record: FileRecord) => {
    const link = document.createElement("a");
    link.href = `/api/system/storage/files/${record.fileId}/download`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    message.success("已开始下载");
  };

  const handleRemove = async (fileId: string) => {
    const res = await request(`/api/system/storage/files/${fileId}`, {
      method: "DELETE",
    });
    if (res?.code === 200) {
      message.success("删除成功");
      setReloadKey((v) => v + 1);
    }
  };

  return (
    <>
      <CrudTablePage<FileRecord>
        key={reloadKey}
        title="文件管理"
        rowKey="fileId"
        resource={{
          basePath: "/api/system/storage",
          list: "/files",
          add: false,
          edit: false,
          remove: false,
          status: false,
        }}
        columns={columns}
        formColumns={formColumns}
        modalWidth={720}
        toolbarExtra={toolbarExtra}
        extraActions={(record) => [
          <a key="download" onClick={() => void handleDownload(record)}>
            下载
          </a>,
          <a
            key="delete"
            style={{ color: "#ff4d4f" }}
            onClick={() => handleRemove(record.fileId)}
          >
            删除
          </a>,
        ]}
      />
      <FileUploadModal
        open={open}
        onOpenChange={setOpen}
        onUploaded={() => setReloadKey((v) => v + 1)}
      />
    </>
  );
}

export default FilePageInner;
