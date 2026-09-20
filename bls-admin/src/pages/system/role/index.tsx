import { PageContainer } from '@ant-design/pro-components';
import type { ProFormColumnsType } from '@ant-design/pro-components';
import { Splitter } from 'antd';
import { useState } from 'react';
import { useDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import CrudTablePage from '@/components/CrudTablePage';
import MenuAuthPanel from './components/MenuAuthPanel';

export type RoleRecord = {
  roleId: string;
  tenantId: string;
  roleName: string;
  roleKey: string;
  sortNum?: number;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

/**
 * 角色管理
 *
 * 左右分栏（antd Splitter）：
 * - 左侧：角色列表（默认独占整宽，操作列齐全）
 * - 右侧：菜单权限面板（默认固定 480px，点击角色行或操作列的「菜单权限」展开）
 *
 * 面板打开后，继续点击左侧其它行即切换成那一行的菜单权限（`rowClickToSelect` 让点行 = 选中行，
 * 选中态与高亮仍由表格 `rowSelection` 维护）。
 *
 * 右侧展开时会隐藏列表的操作列 —— 列表变窄，且此时主要交互对象是右侧的权限树；
 * 需要编辑/删除角色时点击右侧「收起」即可恢复操作列。
 */
function RolePageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { proColumns } = usePageConfig('system_role');

  const formColumns: ProFormColumnsType<RoleRecord>[] = [
    { title: '角色名称', dataIndex: 'roleName', formItemProps: { rules: [{ required: true, message: '请输入角色名称' }] } },
    { title: '角色标识', dataIndex: 'roleKey', formItemProps: { rules: [{ required: true, message: '请输入角色标识' }] } },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text])) },
    { title: '排序', dataIndex: 'sortNum', valueType: 'digit', initialValue: 0 },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  /** 右侧菜单权限面板是否展开（默认关闭 → 只显示左侧角色列表） */
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<RoleRecord | undefined>(undefined);

  const openAuthPanel = (record: RoleRecord) => {
    setCurrentRecord(record);
    setAuthPanelOpen(true);
  };

  const closeAuthPanel = () => {
    setAuthPanelOpen(false);
  };

  return (
    <PageContainer title="角色管理" subTitle="管理角色及其菜单权限">
      <Splitter style={{ height: 'calc(100vh - 200px)', minHeight: 420 }}>
        {/* antd Splitter 的 min/max/defaultSize 只接受数字(px)或 'NN%' 字符串，不能写 '360px' */}
        <Splitter.Panel min={360}>
          <div
            style={{
              height: '100%',
              overflow: 'auto',
              paddingRight: authPanelOpen ? 12 : 0,
            }}
          >
            <CrudTablePage<RoleRecord>
              embedded
              title="角色管理"
              rowKey="roleId"
              resource={{ basePath: '/api/system/role' }}
              columns={proColumns}
              formColumns={formColumns}
              scroll={{ x: 'max-content' }}
              /** 右侧展开时隐藏整列操作（编辑/删除等改由收起面板后操作） */
              showActions={!authPanelOpen}
              /** 点击整行即选中该角色，右侧面板随之切换成它的菜单权限（选中态/高亮由表格维护） */
              rowClickToSelect
              onSelectionChange={(rows) => {
                if (rows[0]) openAuthPanel(rows[0]);
              }}
              extraActions={(record) => [
                <a
                  key="auth"
                  onClick={() => {
                    openAuthPanel(record);
                  }}
                >
                  菜单权限
                </a>,
              ]}
              excelMetaKey="system-role"
              permissions={{
                create: "system:role:add",
                edit: "system:role:edit",
                remove: "system:role:remove",
                status: "system:role:status",
                import: "system:role:import",
                export: "system:role:export",
              }}
            />
          </div>
        </Splitter.Panel>

        {authPanelOpen && (
          /* 权限树三层（目录/页面 + 按钮横排），固定 480px 够放一行按钮；分隔条左右都能拖 */
          <Splitter.Panel defaultSize={480} min={360} max={720}>
            <MenuAuthPanel record={currentRecord} onClose={closeAuthPanel} />
          </Splitter.Panel>
        )}
      </Splitter>
    </PageContainer>
  );
}

export default RolePageInner;
