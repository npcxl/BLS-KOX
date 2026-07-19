/**
 * @name umi 的路由配置
 * @description 只支持 path,component,routes,redirect,wrappers,name,icon 的配置
 * @param path  path 只支持两种占位符配置，第一种是动态参数 :id 的形式，第二种是 * 通配符，通配符只能出现路由字符串的最后。
 * @param component 配置 location 和 path 匹配后用于渲染的 React 组件路径。可以是绝对路径，也可以是相对路径，如果是相对路径，会从 src/pages 开始找起。
 * @param routes 配置子路由，通常在需要为多个路径增加 layout 组件时使用。
 * @param redirect 配置路由跳转
 * @param wrappers 配置路由组件的包装组件，通过包装组件可以为当前的路由组件组合进更多的功能。 比如，可以用于路由级别的权限校验
 * @param name 配置路由的标题，默认读取国际化文件 menu.ts 中 menu.xxxx 的值，如配置 name 为 login，则读取 menu.ts 中 menu.login 的取值作为标题
 * @param icon 配置路由的图标，取值参考 https://ant.design/components/icon-cn， 注意去除风格后缀和大小写，如想要配置图标为 <StepBackwardOutlined /> 则取值应为 stepBackward 或 StepBackward，如想要配置图标为 <UserOutlined /> 则取值应为 user 或者 User
 * @doc https://umijs.org/docs/guides/routes
 */
export default [
  {
    path: "/user",
    layout: false,
    routes: [
      {
        path: "/user/login",
        name: "login",
        component: "./user/login",
      },
      {
        path: "/user",
        redirect: "/user/login",
      },
      {
        name: "register-result",
        icon: "checkCircle",
        path: "/user/register-result",
        component: "./user/register-result",
      },
      {
        name: "register",
        icon: "userAdd",
        path: "/user/register",
        component: "./user/register",
      },
      {
        name: "404",
        component: "./exception/404",
        path: "/user/*",
      },
    ],
  },
  {
    path: "/dashboard",
    name: "首页",
    icon: "home",
    component: "./dashboard",
  },
  {
    path: "/account",
    routes: [
      {
        path: "/account/settings",
        name: "个人设置",
        component: "./account/settings",
      },
      {
        path: "/account",
        redirect: "/account/settings",
      },
    ],
  },
  {
    path: "/system",
    name: "系统管理",
    routes: [
      {
        path: "/system/dept",
        name: "部门管理",
        component: "./system/dept",
      },
      {
        path: "/system/user",
        name: "用户管理",
        component: "./system/user",
      },
      {
        path: "/system/role",
        name: "角色管理",
        component: "./system/role",
      },
      {
        path: "/system/menu",
        name: "菜单管理",
        component: "./system/menu",
      },
      {
        path: "/system/config",
        name: "系统参数",
        component: "./system/config",
      },
      {
        path: "/system/dict",
        name: "字典管理",
        component: "./system/dict",
      },
      {
        path: "/system/theme",
        name: "主题配置",
        component: "./system/theme",
      },
      {
        path: "/system/page-config",
        name: "页面配置",
        component: "./system/page-config",
      },
      {
        path: "/system/log",
        name: "日志中心",
        routes: [
          {
            path: "/system/log/audit",
            name: "操作审计",
            component: "./system/log/audit",
          },
          {
            path: "/system/log/security",
            name: "安全日志",
            component: "./system/log/security",
          },
          {
            path: "/system/log/login",
            name: "登录日志",
            component: "./system/log/login",
          },
        ],
      },
      {
        path: "/system/security",
        name: "安全中心",
        icon: "SafetyCertificateOutlined",
        component: "./system/security",
      },
      {
        path: "/system/webhook",
        name: "Webhook",
        icon: "LinkOutlined",
        component: "./system/webhook",
      },
    ],
  },
  {
    path: "/file-config",
    name: "文件中心",
    routes: [
      {
        path: "/file-config/storage",
        name: "存储配置",
        component: "./system/file-config/storage",
      },
      {
        path: "/file-config/files",
        name: "文件管理",
        component: "./system/file-config/files",
      },
    ],
  },
  {
    path: "/tenant",
    name: "租户管理",
    hideInMenu: true,
    routes: [
      {
        path: "/tenant/list",
        name: "租户列表",
        component: "./system/tenant-package/tenant",
      },
      {
        path: "/tenant/package",
        name: "租户套餐",
        component: "./system/tenant-package/package",
      },
      {
        path: "/tenant",
        redirect: "/tenant/list",
      },
    ],
  },
  {
    path: "/ai",
    name: "AI 工作台",
    icon: "RobotOutlined",
    routes: [
      {
        path: "/ai/workbench",
        name: "AI 工作台",
        component: "./ai/workbench",
      },
      {
        path: "/ai/crud",
        name: "CRUD 生成",
        component: "./ai/crud",
      },
      {
        path: "/ai/sql",
        name: "SQL 助手",
        component: "./ai/sql",
      },
      {
        path: "/ai/audit",
        name: "审计分析",
        component: "./ai/audit",
      },
      {
        path: "/ai/config-review",
        name: "配置审查",
        component: "./ai/config-review",
      },
      {
        path: "/ai",
        redirect: "/ai/workbench",
      },
    ],
  },
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    component: "./exception/404",
    path: "/*",
  },
];
