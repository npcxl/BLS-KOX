import { request } from '@umijs/max';
import { App, Modal, Tree } from 'antd';
import React, { useEffect, useState } from 'react';
import type { PackageRecord } from '../index';

type MenuAuthModalProps = {
  open: boolean;
  onCancel: () => void;
  record?: PackageRecord;
};

export default function MenuAuthModal({ open, onCancel, record }: MenuAuthModalProps) {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
  const [halfCheckedKeys, setHalfCheckedKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (open && record) {
      loadData();
    } else {
      setTreeData([]);
      setCheckedKeys([]);
      setHalfCheckedKeys([]);
    }
  }, [open, record]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [menuRes, authRes] = await Promise.all([
        request('/api/system/menu/list'),
        request(`/api/system/package/${record?.packageId}/menus`),
      ]);
      const data = menuRes.data || [];
      const formatTree = (list: any[]): any[] => {
        return list.map((item) => ({
          title: item.menuName,
          key: item.menuId,
          children: item.children ? formatTree(item.children) : undefined,
        }));
      };
      setTreeData(formatTree(data));
      
      const allChecked = authRes.data || [];
      
      // Calculate strict checked keys (leaf nodes only) to prevent Antd Tree from auto-checking parent nodes incorrectly
      const parentKeys = new Set<string>();
      const traverse = (list: any[]) => {
        list.forEach((item) => {
          if (item.children && item.children.length > 0) {
            parentKeys.add(item.menuId);
            traverse(item.children);
          }
        });
      };
      traverse(data);
      
      const strictCheckedKeys = allChecked.filter((key: string) => !parentKeys.has(key));
      setCheckedKeys(strictCheckedKeys);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = (checked: any, info: any) => {
    if (Array.isArray(checked)) {
      setCheckedKeys(checked);
      setHalfCheckedKeys(info.halfCheckedKeys || []);
    } else {
      setCheckedKeys(checked.checked);
      setHalfCheckedKeys(checked.halfCheckedKeys || []);
    }
  };

  const handleSubmit = async () => {
    if (!record) return;
    const menuIds = [...checkedKeys, ...halfCheckedKeys];
    try {
      setLoading(true);
      await request(`/api/system/package/${record.packageId}/menus`, {
        method: 'PUT',
        data: { menuIds },
      });
      message.success('分配成功');
      onCancel();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="菜单权限"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <Tree
          checkable
          checkStrictly={false}
          treeData={treeData}
          checkedKeys={checkedKeys}
          onCheck={handleCheck}
          defaultExpandAll
        />
      </div>
    </Modal>
  );
}
