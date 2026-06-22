import {
  globalSearch,
  type GlobalSearchGroup,
} from "@/services/system/global-search";
import { SearchOutlined } from "@ant-design/icons";
import { history } from "@umijs/max";
import { Button, Input, Modal, Spin, Tooltip, Typography } from "antd";
import { createStyles } from "antd-style";
import React, { useEffect, useMemo, useRef, useState } from "react";

const useStyles = createStyles(({ token, css }) => ({
  trigger: css`
    font-size: 18px;
    cursor: pointer;
    color:black;
  `,
  modalBody: css`
    min-height: 360px;
  `,
  group: css`
    padding: 12px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  item: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: ${token.borderRadius}px;
    cursor: pointer;
    &:hover {
      background: ${token.colorBgTextHover};
    }
  `,
}));

export const GlobalSearchModal: React.FC = () => {
  const { styles } = useStyles();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const debounceTimerRef = useRef<number | null>(null);

  const fetchData = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setGroups([]);
      return;
    }
    setLoading(true);
    try {
      const res = await globalSearch(trimmed);
      setGroups(res.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const runDebounced = (value: string) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void fetchData(value);
    }, 300);
  };

  useEffect(() => {
    if (open) {
      setKeyword("");
      setGroups([]);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const content = useMemo(() => {
    if (loading) return <Spin />;
    if (!keyword.trim())
      return (
        <Typography.Text type="secondary">
          输入至少 2 个字符开始搜索
        </Typography.Text>
      );
    if (!groups.length)
      return <Typography.Text type="secondary">暂无搜索结果</Typography.Text>;
    return groups.map((group) => (
      <div key={group.moduleKey} className={styles.group}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {group.moduleName}
        </Typography.Title>
        {group.list.map((item) => (
          <div
            key={item.id}
            className={styles.item}
            onClick={() => {
              setOpen(false);
              if (item.routePath) {
                history.push(`${item.routePath}?id=${item.id}`);
              }
            }}
          >
            <Typography.Text strong>{item.title}</Typography.Text>
            {item.subtitle ? (
              <Typography.Text type="secondary">
                {item.subtitle}
              </Typography.Text>
            ) : null}
          </div>
        ))}
      </div>
    ));
  }, [groups, keyword, loading, styles.group, styles.item]);

  return (
    <>
      <Tooltip
        title="全局搜索，只有新增或修改后产生新的索引数据才会显示。
      详情参见后端函数xxx.repository.ts的syncUserSearchIndex函数。"
      >
        <SearchOutlined
          className={styles.trigger}
          onClick={() => setOpen(true)}
          aria-label="全局搜索"
        />
      </Tooltip>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
        title="全局搜索"
        destroyOnHidden
      >
        <div className={styles.modalBody}>
          <Input.Search
            autoFocus
            value={keyword}
            placeholder="请输入关键字，至少 2 个字符"
            onChange={(e) => {
              const value = e.target.value;
              setKeyword(value);
              runDebounced(value);
            }}
            onSearch={(value) => fetchData(value)}
            enterButton
          />
          <div style={{ marginTop: 16 }}>{content}</div>
        </div>
      </Modal>
    </>
  );
};
