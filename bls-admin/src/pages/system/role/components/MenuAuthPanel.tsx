import { CloseOutlined, SaveOutlined } from '@ant-design/icons';
import { request } from '@umijs/max';
import {
  App,
  Button,
  Checkbox,
  Divider,
  Empty,
  Flex,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { Key, ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import type { RoleRecord } from '../index';

type MenuNode = {
  menuId: string;
  menuName: string;
  /** 0 目录 1 页面(菜单) 2 按钮 */
  menuType?: string;
  children?: MenuNode[];
};

type ButtonOption = { label: string; value: string };

type Prepared = {
  /** 交给 antd Tree 的数据：只有目录 + 页面（按钮不入树） */
  treeData: any[];
  /** 页面 id → 它的按钮权限 */
  buttonsByMenu: Map<string, ButtonOption[]>;
  /** 全部按钮 id（用于从已分配列表里把按钮挑出来） */
  buttonSet: Set<string>;
  /** id → 上级 id（含按钮 → 页面），保存时用来补全祖先链 */
  parentOfMenu: Map<string, string | undefined>;
  /** 树里还有子节点的节点（目录）——回显时不能直接喂给 checkedKeys，否则会连带选中它下面所有页面 */
  parentKeys: Set<string>;
};

type MenuAuthPanelProps = {
  /** 当前选中的角色；为空时显示空状态 */
  record?: RoleRecord;
  /** 收起右侧面板 */
  onClose: () => void;
};

/**
 * `sys_menu` 树 → antd `Tree` 数据 + 按钮权限索引。
 *
 * 权限分三层展示：
 * 1. 目录（`menu_type='0'`）—— Tree 第一层
 * 2. 页面（`menu_type='1'`）—— Tree 第二层
 * 3. 按钮权限（`menu_type='2'`）—— 挂在所属页面行下方，横向一行排开（`Checkbox.Group`）
 *
 * 按钮不进 Tree：几十个页面 × 4~6 个按钮竖排下来树会非常长。
 */
function prepareMenu(nodes: MenuNode[]): Prepared {
  const buttonsByMenu = new Map<string, ButtonOption[]>();
  const buttonSet = new Set<string>();
  const parentOfMenu = new Map<string, string | undefined>();

  const toNode = (node: MenuNode, parentId?: string): any => {
    const id = String(node.menuId);
    parentOfMenu.set(id, parentId);

    const children = node.children ?? [];
    const buttonChildren = children.filter((child) => String(child.menuType) === '2');
    if (buttonChildren.length) {
      buttonsByMenu.set(
        id,
        buttonChildren.map((child) => ({
          label: child.menuName,
          value: String(child.menuId),
        })),
      );
      buttonChildren.forEach((child) => {
        const buttonId = String(child.menuId);
        buttonSet.add(buttonId);
        parentOfMenu.set(buttonId, id);
      });
    }

    const childNodes = children
      .filter((child) => String(child.menuType) !== '2')
      .map((child) => toNode(child, id));

    return { key: id, title: node.menuName, children: childNodes.length ? childNodes : undefined };
  };

  const treeData = nodes.map((node) => toNode(node));

  const parentKeys = new Set<string>();
  const walk = (list: any[]) => {
    list.forEach((item) => {
      if (item.children?.length) {
        parentKeys.add(String(item.key));
        walk(item.children);
      }
    });
  };
  walk(treeData);

  return { treeData, buttonsByMenu, buttonSet, parentOfMenu, parentKeys };
}

/**
 * 角色 → 菜单权限面板（配合 Splitter 使用，替代原来的 MenuAuthModal）
 *
 * - 目录/页面：antd `Tree` 原生勾选（父子联动、半选由组件负责）
 * - 按钮权限：`Checkbox.Group` 横向排列，位于所属页面行下方（第三层），不进树避免树过长
 *
 * 接口与原弹窗一致：
 * - GET  /api/system/menu/package-tree      菜单树
 * - GET  /api/system/role/:roleId/menus     已分配菜单 id
 * - PUT  /api/system/role/:roleId/menus     保存（提交目录 + 页面 + 按钮）
 */
export default function MenuAuthPanel({ record, onClose }: MenuAuthPanelProps) {
  const [prepared, setPrepared] = useState<Prepared>({
    treeData: [],
    buttonsByMenu: new Map(),
    buttonSet: new Set(),
    parentOfMenu: new Map(),
    parentKeys: new Set(),
  });
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([]);
  const [buttonIds, setButtonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();
  const { can } = usePermission();
  const canSave = can('system:role:assignMenu');

  const roleId = record?.roleId;
  const { treeData, buttonsByMenu, parentOfMenu } = prepared;

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [menuRes, authRes] = await Promise.all([
        request('/api/system/menu/package-tree'),
        request(`/api/system/role/${id}/menus`),
      ]);

      const next = prepareMenu((menuRes.data || []) as MenuNode[]);
      const assigned: string[] = ((authRes.data || []) as string[]).map(String);

      // 目录/页面交给 Tree：只回显叶子页面，目录的选中/半选由 antd 依据子节点推导，
      // 否则直接把目录 id 喂进去会连带把未分配的页面也渲染成已勾选。
      // 按钮交给 Checkbox.Group。
      setPrepared(next);
      setCheckedKeys(
        assigned.filter((key) => !next.buttonSet.has(key) && !next.parentKeys.has(key)),
      );
      setButtonIds(assigned.filter((key) => next.buttonSet.has(key)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roleId) {
      void loadData(roleId);
    } else {
      setPrepared({
        treeData: [],
        buttonsByMenu: new Map(),
        buttonSet: new Set(),
        parentOfMenu: new Map(),
        parentKeys: new Set(),
      });
      setCheckedKeys([]);
      setButtonIds([]);
    }
  }, [loadData, roleId]);

  /** 某个节点（目录或页面）下的全部按钮 id —— 树只有两层，目录的页面就是它的直接子节点 */
  const buttonsInSubtree = (menuId: string): string[] =>
    [...buttonsByMenu.entries()]
      .filter(([pageId]) => pageId === menuId || parentOfMenu.get(pageId) === menuId)
      .flatMap(([, options]) => options.map((option) => option.value));

  /** Tree 勾选变化：勾选/取消目录或页面时，同步带上它下面的按钮 */
  const handleCheck = (checked: any, info: any) => {
    const nextKeys: Key[] = Array.isArray(checked) ? checked : checked.checked;
    setCheckedKeys(nextKeys);

    const ids = buttonsInSubtree(String(info.node.key));
    if (!ids.length) return;

    if (nextKeys.includes(info.node.key)) {
      setButtonIds((prev) => [...new Set([...prev, ...ids])]);
    } else {
      setButtonIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  /** 按钮权限变化：勾上按钮时顺带把所属页面选中（否则后端认为父页面没分配） */
  const handleButtonsChange = (pageId: string, next: string[]) => {
    const pageButtonIds = (buttonsByMenu.get(pageId) ?? []).map((option) => option.value);
    setButtonIds((prev) => [...prev.filter((id) => !pageButtonIds.includes(id)), ...next]);

    if (next.length) {
      setCheckedKeys((prev) => (prev.includes(pageId) ? prev : [...prev, pageId]));
    }
  };

  const handleSubmit = async () => {
    if (!roleId) return;

    // 后端要求父级目录/页面一并提交，所以这里为每个选中节点补全祖先链
    const menuIds = new Set<string>();
    const addWithAncestors = (id: string) => {
      let current: string | undefined = id;
      while (current) {
        menuIds.add(current);
        current = parentOfMenu.get(current);
      }
    };
    checkedKeys.forEach((key) => addWithAncestors(String(key)));
    buttonIds.forEach(addWithAncestors);

    try {
      setSaving(true);
      await request(`/api/system/role/${roleId}/menus`, {
        method: 'PUT',
        data: { menuIds: [...menuIds] },
      });
      message.success('分配成功');
      await loadData(roleId);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  /** 页面行下方横向排开的按钮权限（第三层；没有按钮的节点保持单行） */
  const renderTitle = (node: any): ReactNode => {
    const options = buttonsByMenu.get(String(node.key));
    if (!options?.length) return node.title;

    return (
      <span onClick={(event) => event.stopPropagation()}>
        <span>{node.title}</span>
        <Checkbox.Group
          options={options}
          value={buttonIds}
          onChange={(values) => handleButtonsChange(String(node.key), values as string[])}
          style={{ display: 'block', paddingLeft: 24, paddingBottom: 4 }}
        />
      </span>
    );
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <Flex justify="space-between" align="center">
        <Space size={8}>
          <Typography.Text strong>菜单权限</Typography.Text>
          {record ? <Tag color="blue">{record.roleName}</Tag> : null}
        </Space>
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!record || !canSave}
            onClick={handleSubmit}
          />
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </Flex>

      <Divider style={{ margin: '12px 0' }} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Flex justify="center" align="center" style={{ paddingTop: 48 }}>
            <Spin />
          </Flex>
        ) : record && treeData.length ? (
          <Tree
            checkable
            defaultExpandAll
            treeData={treeData}
            titleRender={renderTitle}
            checkedKeys={checkedKeys}
            onCheck={handleCheck}
          />
        ) : (
          <Empty description="请选择左侧角色" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
}
