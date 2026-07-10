import {
  globalSearch,
  type GlobalSearchGroup,
} from "@/services/system/global-search";
import { SearchOutlined } from "@ant-design/icons";
import { history } from "@umijs/max";
import { Input, Modal, Spin, Tooltip, Typography } from "antd";
import { createStyles } from "antd-style";
import React, { useEffect, useMemo, useRef, useState } from "react";

const useStyles = createStyles(({ token, css }) => ({
  trigger: css`
    font-size: 18px;
    cursor: pointer;
    color: black;
  `,
  modalBody: css`
    display: flex;
    flex-direction: column;
    height: 480px;
  `,
  resultList: css`
    flex: 1;
    overflow-y: auto;
    margin-top: 16px;
    padding-right: 4px;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-thumb {
      background: ${token.colorBorderSecondary};
      border-radius: 3px;
    }
  `,
  footerBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    margin-top: 8px;
    border-top: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorTextTertiary};
    font-size: ${token.fontSizeSM}px;
    user-select: none;
  `,
  group: css`
    padding: 10px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
  `,
  groupTitle: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    color: ${token.colorTextTertiary};
    font-size: ${token.fontSizeSM}px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,
  item: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: ${token.borderRadius}px;
    border-left: 0 none transparent;
    cursor: pointer;
    outline: none;
    transition: background 0.15s ease;
    &:hover {
      background: ${token.colorBgTextHover};
    }
  `,
  selectedItem: css`
    background: ${token.colorPrimaryBg};
    border-left: 0 none transparent;
    outline: none;
    &:hover {
      background: ${token.colorPrimaryBgHover};
    }
  `,
  itemTitle: css`
    font-weight: 500;
    color: ${token.colorText};
  `,
  itemSubtitle: css`
    color: ${token.colorTextSecondary};
    font-size: ${token.fontSizeSM}px;
  `,
  empty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${token.colorTextSecondary};
    height: 100%;
  `,
}));

export const GlobalSearchModal: React.FC = () => {
  const { styles } = useStyles();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const debounceTimerRef = useRef<number | null>(null);

  const flatItems = useMemo(() => {
    const items: { item: GlobalSearchGroup["list"][number]; group: GlobalSearchGroup }[] = [];
    for (const group of groups) {
      for (const item of group.list) {
        items.push({ item, group });
      }
    }
    return items;
  }, [groups]);

  const navigateTo = (target: GlobalSearchGroup["list"][number]) => {
    setOpen(false);
    if (target.routePath) {
      history.push(`${target.routePath}?id=${target.id}`);
    }
  };

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
      setSelectedIndex(0);
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
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Ctrl+K / Cmd+K 打开，ESC/Arrow/Enter 导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) {
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (flatItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % flatItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = flatItems[selectedIndex];
        if (target) navigateTo(target.item);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, flatItems, selectedIndex]);

  useEffect(() => {
    if (open) {
      setKeyword("");
      setGroups([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // 选中项滚动到可视区域
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

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

    let globalIndex = 0;
    return groups.map((group) => (
      <div key={group.moduleKey} className={styles.group}>
        <div className={styles.groupTitle}>
          {group.moduleName}
        </div>
        {group.list.map((item) => {
          const idx = globalIndex++;
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[idx] = el; }}
              className={`${styles.item}${isSelected ? ` ${styles.selectedItem}` : ""}`}
              onClick={() => navigateTo(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              role="option"
              aria-selected={isSelected}
            >
              <span className={styles.itemTitle}>{item.title}</span>
              {item.subtitle ? (
                <span className={styles.itemSubtitle}>{item.subtitle}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    ));
  }, [groups, keyword, loading, selectedIndex, styles]);

  return (
    <>
      <Tooltip title="全局搜索（Ctrl+K）&#10;数据来源：sys_search_index 索引表。&#10;如需更新索引，前往「系统参数」→「重建索引」">
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
        height={240}
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
          <div className={styles.resultList} role="listbox" aria-label="搜索结果">
            {content}
          </div>
          <div className={styles.footerBar}>
            <span>共 {flatItems.length} 条结果</span>
            {flatItems.length > 0 ? (
              <span>↑↓ 选择 &nbsp; Enter 确认 &nbsp; Esc 关闭</span>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
};
