import * as AntIcons from "@ant-design/icons";
import { Button, Empty, Input, Modal, Tooltip } from "antd";
import type { CSSProperties, ElementType, MouseEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

const ANT_ICON_MAP = AntIcons as unknown as Record<
  string,
  ElementType<{ style?: CSSProperties }>
>;

const iconNames = Object.keys(ANT_ICON_MAP).filter((name) =>
  name.endsWith("Outlined")
);

export type IconPickerProps = {
  value?: string;
  onChange?: (value?: string) => void;
  placeholder?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  onConfirm?: (value?: string) => Promise<void> | void;
};

export function getAntdIcon(icon?: string, style?: CSSProperties) {
  if (!icon) return null;

  const IconComp = ANT_ICON_MAP[icon];

  return IconComp ? <IconComp style={style} /> : null;
}

export default function IconPicker({
  value,
  onChange,
  placeholder = "请选择图标",
  open: controlledOpen,
  onOpenChange,
  trigger,
  onConfirm,
}: IconPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const open = controlledOpen ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const selectedIcon = getAntdIcon(value, { fontSize: 16 });

  const filteredIconNames = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) return iconNames;

    return iconNames.filter((name) => {
      const label = name.replace("Outlined", "");

      return (
        name.toLowerCase().includes(normalizedKeyword) ||
        label.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [keyword]);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelect = (iconName: string) => {
    onChange?.(iconName);
  };

  const handleClear = (event?: MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    onChange?.(undefined);
  };

  const handleConfirm = async () => {
    await onConfirm?.(value);
    setOpen(false);
  };

  return (
    <>
      {trigger ??
        (controlledOpen === undefined ? (
          <Button
            block
            htmlType="button"
            type="default"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleOpen();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
              paddingInline: 12,
            }}
          >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            {selectedIcon}
            <span style={{ color: value ? "inherit" : "#bfbfbf" }}>
              {value || placeholder}
            </span>
          </span>
          {value ? (
            <span
              onMouseDown={(event) => handleClear(event)}
              style={{
                color: "#1677ff",
                cursor: "pointer",
                marginLeft: 12,
                flexShrink: 0,
              }}
            >
              清空
            </span>
          ) : null}
          </Button>
        ) : null)}

      <Modal
        title="选择 Ant Design 图标"
        open={open}
        width={760}
        footer={null}
        destroyOnHidden
        onCancel={handleClose}
      >
        <Input.Search
          allowClear
          autoFocus
          placeholder="搜索图标名称，如 User、Setting、Menu"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          style={{ marginBottom: 16 }}
        />

        {filteredIconNames.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
              gap: 8,
              maxHeight: 420,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {filteredIconNames.map((iconName) => {
              const IconComp = ANT_ICON_MAP[iconName];
              const active = value === iconName;
              const label = iconName.replace("Outlined", "");

              return (
                <Tooltip key={iconName} title={iconName}>
                  <Button
                    type={active ? "primary" : "default"}
                    onClick={() => handleSelect(iconName)}
                    style={{
                      height: 76,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: 8,
                    }}
                  >
                    <IconComp style={{ fontSize: 22 }} />

                    <span
                      style={{
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                      }}
                    >
                      {label}
                    </span>
                  </Button>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未找到匹配图标"
          />
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 16,
          }}
        >
          <Button onClick={() => handleClear()}>清空选择</Button>
          <Button onClick={handleConfirm}>确认</Button>
        </div>
      </Modal>
    </>
  );
}
