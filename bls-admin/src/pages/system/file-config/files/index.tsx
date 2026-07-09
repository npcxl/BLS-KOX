import CrudTablePage from "@/components/CrudTablePage";
import FileUploadModal from "@/components/FileUploadModal";
import { useDict } from "@/hooks/useDict";
import { CopyOutlined } from "@ant-design/icons";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";
import { request } from "@umijs/max";
import { Button, Image, message, Popconfirm, Space, Tag, Tooltip } from "antd";
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
  const { valueEnum: statusValueEnum } = useDict("sys_bucket_access_type");

  const copyText = async (text?: string | null) => {
    if (!text) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        message.success("地址已复制");
        return;
      }

      message.warning("当前浏览器不支持自动复制，请手动复制链接");
    } catch (error) {
      console.error("复制失败:", error);
      message.error("复制失败，请手动复制");
    }
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
      render: (_, record) => (
        <Tag color={statusValueEnum[record.accessType]?.color ?? 'default'}>
          {statusValueEnum[record.accessType]?.text ?? record.accessType}
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
  const toolbarExtra = useMemo(
    () => [
      <Button key="upload" type="primary" onClick={() => setOpen(true)}>
        上传文件
      </Button>,
    ],
    [],
  );

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
        excelMetaKey="system-file"
        permissions={{
          import: "system:file:import",
          export: "system:file:export",
          status: "system:file:status",
          create: "system:file:add",
          edit: "system:file:edit",
          remove: "system:file:remove",
        }}
        showCreateButton={false}
        columns={columns}
        formColumns={formColumns}
        modalWidth={720}
        toolbarExtra={toolbarExtra}
        extraActions={(record) => [
          <a key="download" onClick={() => void handleDownload(record)}>
            下载
          </a>,
          <Popconfirm
            key="delete"
            title="确定要删除这个文件吗？"
            description="删除后将无法恢复，请谨慎操作。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleRemove(record.fileId)}
          >
            <a style={{ color: "#ff4d4f" }}>删除</a>
          </Popconfirm>,
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
