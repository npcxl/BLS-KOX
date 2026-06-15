import { queryOne } from '../../../core/database';
import { PageConfigMeta, UiFieldMeta } from './page-config.model';

const PAGE_META: Record<string, Omit<PageConfigMeta, 'fields'>> = {
  system_user: {
    pageCode: 'system_user',
    pageName: '用户管理',
    title: '用户管理',
    resourcePath: '/api/system/user',
    rowKey: 'userId',
    statusKey: 'status',
    isTree: false,
    parentKey: null,
    status: '0',
    remark: '用户管理页面配置',
  },
  system_dept: {
    pageCode: 'system_dept',
    pageName: '部门管理',
    title: '部门管理',
    resourcePath: '/api/system/dept',
    rowKey: 'deptId',
    statusKey: 'status',
    isTree: true,
    parentKey: 'parentId',
    status: '0',
    remark: '部门管理页面配置',
  },
  system_role: {
    pageCode: 'system_role',
    pageName: '角色管理',
    title: '角色管理',
    resourcePath: '/api/system/role',
    rowKey: 'roleId',
    statusKey: 'status',
    isTree: false,
    parentKey: null,
    status: '0',
    remark: '角色管理页面配置',
  },
  system_menu: {
    pageCode: 'system_menu',
    pageName: '菜单管理',
    title: '菜单管理',
    resourcePath: '/api/system/menu',
    rowKey: 'menuId',
    statusKey: 'status',
    isTree: true,
    parentKey: 'parentId',
    status: '0',
    remark: '菜单管理页面配置',
  },
  system_config: {
    pageCode: 'system_config',
    pageName: '系统参数',
    title: '系统参数',
    resourcePath: '/api/system/config',
    rowKey: 'configId',
    statusKey: 'status',
    isTree: false,
    parentKey: null,
    status: '0',
    remark: '系统参数页面配置',
  },
};

const FIELD_META: Record<string, UiFieldMeta[]> = {
  system_user: [
    { fieldKey: 'username', fieldLabel: '用户名', fieldScope: '2', fieldType: 'text', valueEnumKey: null, isSearch: true, isRequired: true, isCopyable: true, isEllipsis: true, isFormVisible: true, isTableVisible: true, width: null, sortNum: 1, defaultValue: null, placeholder: '请输入用户名', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'nickname', fieldLabel: '昵称', fieldScope: '2', fieldType: 'text', valueEnumKey: null, isSearch: false, isRequired: true, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: null, sortNum: 2, defaultValue: null, placeholder: '请输入昵称', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'realName', fieldLabel: '真实姓名', fieldScope: '2', fieldType: 'text', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: null, sortNum: 3, defaultValue: null, placeholder: '请输入真实姓名', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'phone', fieldLabel: '手机号', fieldScope: '2', fieldType: 'text', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: null, sortNum: 4, defaultValue: null, placeholder: '请输入手机号', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'email', fieldLabel: '邮箱', fieldScope: '2', fieldType: 'text', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: true, isFormVisible: true, isTableVisible: true, width: null, sortNum: 5, defaultValue: null, placeholder: '请输入邮箱', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'isAdmin', fieldLabel: '管理员', fieldScope: '2', fieldType: 'select', valueEnumKey: 'sys_yes_no', isSearch: false, isRequired: true, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: 100, sortNum: 6, defaultValue: '0', placeholder: null, propsJson: null, renderCode: 'statusTag', beforeSubmitCode: null },
    { fieldKey: 'status', fieldLabel: '状态', fieldScope: '2', fieldType: 'select', valueEnumKey: 'sys_status', isSearch: true, isRequired: true, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: 100, sortNum: 7, defaultValue: '0', placeholder: null, propsJson: null, renderCode: 'statusTag', beforeSubmitCode: null },
    { fieldKey: 'createTime', fieldLabel: '创建时间', fieldScope: '0', fieldType: 'dateTime', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: false, isTableVisible: true, width: 160, sortNum: 8, defaultValue: null, placeholder: null, propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'password', fieldLabel: '密码', fieldScope: '1', fieldType: 'password', valueEnumKey: null, isSearch: false, isRequired: true, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: false, width: null, sortNum: 9, defaultValue: null, placeholder: '新增时可为空，默认 123456', propsJson: null, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'deptId', fieldLabel: '部门', fieldScope: '1', fieldType: 'treeSelect', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: false, width: null, sortNum: 10, defaultValue: '000000', placeholder: '请选择部门', propsJson: { allowClear: true, showSearch: true, treeDefaultExpandAll: true, treeNodeFilterProp: 'title' }, renderCode: null, beforeSubmitCode: null },
    { fieldKey: 'roleIds', fieldLabel: '角色', fieldScope: '1', fieldType: 'select', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: false, width: null, sortNum: 11, defaultValue: null, placeholder: '请选择角色', propsJson: { mode: 'multiple' }, renderCode: null, beforeSubmitCode: 'joinComma' },
    { fieldKey: 'remark', fieldLabel: '备注', fieldScope: '2', fieldType: 'textarea', valueEnumKey: null, isSearch: false, isRequired: false, isCopyable: false, isEllipsis: false, isFormVisible: true, isTableVisible: true, width: null, sortNum: 12, defaultValue: null, placeholder: '请输入备注', propsJson: null, renderCode: null, beforeSubmitCode: null },
  ],
};

export class PageConfigService {
  async getByCode(pageCode: string): Promise<PageConfigMeta | null> {
    const base = PAGE_META[pageCode];
    if (!base) return null;
    return { ...base, fields: FIELD_META[pageCode] ?? [] };
  }

  async list() {
    return Object.values(PAGE_META).map((item) => ({ ...item, fields: undefined }));
  }

  async dbStub() {
    return queryOne('SELECT 1 AS ok');
  }
}
