import {
  AvatarDropdown,
  ErrorBoundary,
  Footer,
  LangDropdown,
  OfflineBanner,
} from "@/components";
import {
  currentUser as queryCurrentUser,
  publicSystemConfig,
  systemCurrent,
} from "@/services/ant-design-pro/api";
import {
  refreshGlobalSettings,
  setRefreshGlobalSettingsHandler,
} from "@/services/system/settings";
import * as AntIcons from "@ant-design/icons";
import type { Settings as LayoutSettings } from "@ant-design/pro-components";
import { SettingDrawer } from "@ant-design/pro-components";
import type { RequestConfig, RunTimeLayoutConfig } from "@umijs/max";
import { history, Link } from "@umijs/max";
import { message } from "antd";
import React from "react";
import defaultSettings from "../config/defaultSettings";
import { errorConfig } from "./requestErrorConfig";
import { ensureValidSession, redirectToLogin, setLoginPath } from "@/auth/auth-manager";
import {
  publicThemeConfig,
  themeCurrent,
  addTheme,
  updateTheme,
} from "@/services/ant-design-pro/api";
import { GlobalSearchModal } from "./components/RightContent/GlobalSearchModal";
import { GlobalRealtimeProvider } from "./components/GlobalRealtimeProvider";
import { TokenRefreshGuard } from "./components/TokenRefreshGuard";

const isDev = process.env.NODE_ENV === "development";
const loginPath = "/user/login";
const currentUserPath = "/api/auth/profile";

// 配置登录页路径，auth-manager 需要知道
setLoginPath(loginPath);

const PUBLIC_ROUTES = [loginPath, "/user/register", "/user/register-result"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

const ANT_ICON_MAP = AntIcons as unknown as Record<string, React.ComponentType>;

function resolveMenuIcon(icon?: string | null) {
  if (!icon) return undefined;
  const AntIconComponent = ANT_ICON_MAP[icon];
  return AntIconComponent ? <AntIconComponent /> : undefined;
}

/**
 * 以接口为准，不以路由配置
 * router.ts只是能访问什么页面硬性配置，这里软配置显示什么和怎么显示
 * */

function mapBackendMenus(
  menus: API.MenuTreeItem[] = [],
  dashboardTitle = '仪表盘'
): any[] {
  const backendMenus = menus
    .filter((item) => item.menuType !== "2" && item.path !== "/dashboard")
    .map((item) => ({
      key: item.path || item.menuId,
      path: item.path || undefined,
      name: item.menuName,
      icon: resolveMenuIcon(item.icon),
      locale: false,
      children: item.children
        ? mapBackendMenus(item.children, false)
        : undefined,
    }))
    .map((item) => {
      if (item.path === '/tenant') {
        return {
          ...item,
          children: [
            { key: '/tenant/list', path: '/tenant/list', name: '租户列表', locale: false },
            { key: '/tenant/package', path: '/tenant/package', name: '租户套餐', locale: false },
          ],
        };
      }
      if (item.path === '/system/log') {
        return {
          ...item,
          children: [
            { key: '/system/log/login', path: '/system/log/login', name: '登录日志', locale: false },
            { key: '/system/log/audit', path: '/system/log/audit', name: '操作审计', locale: false },
            { key: '/system/log/security', path: '/system/log/security', name: '安全日志', locale: false },
          ],
        };
      }
      return item;
    });

  return [
    {
      key: "/dashboard",
      path: "/dashboard",
      name: dashboardTitle,
      icon: <AntIcons.DashboardOutlined />,
      locale: false,
    },
    ...backendMenus,
  ];
}

function normalizeSelectedKeys(pathname: string) {
  if (pathname.startsWith('/system/')) return [pathname];
  if (pathname.startsWith('/tenant/')) return [pathname];
  if (pathname === '/dashboard') return ['/dashboard'];
  return [pathname];
}

function getHeaderTitle(
  settings?: Record<string, unknown>,
  systemMap?: Record<string, string>,
) {
  return (settings?.title as string) ?? systemMap?.title ?? defaultSettings.title;
}

function getHeaderLogo(
  settings?: Record<string, unknown>,
  systemMap?: Record<string, string>,
) {
  return (settings?.logo as string) ?? systemMap?.logo ?? defaultSettings.logo;
}

function buildSystemMap(systemList: API.SysConfig[]): Record<string, string> {
  return Object.fromEntries(
    systemList
      .filter(
        (
          item
        ): item is Required<Pick<API.SysConfig, "configKey" | "configValue">> &
          API.SysConfig =>
          Boolean(item.configKey && item.configValue !== undefined)
      )
      .map((item) => [item.configKey, item.configValue])
  );
}

function toBoolean(value: unknown, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseThemeSettings(theme: any): {
  settings: ThemeLayoutSettings;
  meta: ThemeMeta;
} {
  if (!theme) return { settings: {}, meta: {} };

  let token: Record<string, unknown> | undefined;

  const tokenSource = theme.tokenJson ?? theme.configValue;

  if (tokenSource) {
    try {
      const parsed = JSON.parse(tokenSource);
      token = parsed && typeof parsed === "object" ? parsed : undefined;
    } catch {
      token = undefined;
    }
  }

  return {
    settings: {
      navTheme: theme.navTheme,
      colorPrimary: theme.colorPrimary,
      layout: theme.layout,
      contentWidth: theme.contentWidth,

      fixedHeader: toBoolean(theme.fixedHeader, false),
      fixSiderbar: toBoolean(theme.fixSiderbar, true),
      colorWeak: toBoolean(theme.colorWeak, false),

      title: theme.title,
      logo: theme.logo ?? defaultSettings.logo,
      iconfontUrl: theme.iconfontUrl ?? defaultSettings.iconfontUrl,
      token,
    },
    meta: {
      themeId: theme.themeId ?? undefined,
      tenantId: theme.tenantId ?? undefined,
    },
  };
}

type ThemeLayoutSettings = Partial<LayoutSettings>;

type ThemeMeta = {
  themeId?: string;
  tenantId?: string;
};

export async function getInitialState(): Promise<{
  settings?: ThemeLayoutSettings;
  themeMeta?: ThemeMeta;
  currentUser?: API.CurrentUser;
  loading?: boolean;
  fetchUserInfo?: () => Promise<API.CurrentUser | undefined>;
  refreshSettings?: () => Promise<{
    theme: ThemeLayoutSettings;
    themeMeta: ThemeMeta;
  }>;
  settingDrawerOpen?: boolean;
  systemMap?: Record<string, string>;
}> {
  const fetchUserInfo = async () => {
    try {
      const msg = await queryCurrentUser({
        url: currentUserPath,
      });
      if (msg.data) {
        localStorage.setItem("currentUser", JSON.stringify(msg.data));
      }
      return msg.data;
    } catch (_error) {
      const { pathname, search, hash } = history.location;
      history.replace(
        `${loginPath}?redirect=${encodeURIComponent(pathname + search + hash)}`
      );
    }
    return undefined;
  };

  const fetchPublicSettings = async () => {
    const [themeRes, systemRes] = await Promise.all([
      publicThemeConfig({ skipErrorMessage: true }),
      publicSystemConfig({ skipErrorMessage: true }),
    ]);

    const theme = themeRes.data?.data ?? themeRes.data;
    const systemList = systemRes.data?.data ?? systemRes.data ?? [];
    const parsedTheme = parseThemeSettings(theme);

    return {
      theme: parsedTheme.settings,
      themeMeta: parsedTheme.meta,
      systemMap: buildSystemMap(systemList),
    };
  };

  /** 鉴权设置：不走 skipErrorHandler，让 401 正常触发 Refresh */
  const fetchAuthSettings = async () => {
    const [themeRes, systemRes] = await Promise.all([
      themeCurrent(),
      systemCurrent(),
    ]);

    const theme = themeRes.data?.data ?? themeRes.data;
    const systemList = systemRes.data?.data ?? systemRes.data ?? [];
    const parsedTheme = parseThemeSettings(theme);
    return {
      theme: parsedTheme.settings,
      themeMeta: parsedTheme.meta,
      systemMap: buildSystemMap(systemList),
    };
  };

  const refreshSettings = async () => {
    const { location } = history;
    const isLoggedIn = !isPublicRoute(location.pathname);

    let latest: {
      theme: ThemeLayoutSettings;
      themeMeta: ThemeMeta;
      systemMap: Record<string, string>;
    };

    if (isLoggedIn) {
      try {
        latest = await fetchAuthSettings();
      } catch {
        // Auth Settings 失败不静默 fallback，只保留现有值
        return {};
      }
    } else {
      latest = await fetchPublicSettings();
    }

    const systemTitle = latest.systemMap["sys.app.name"];
    const systemLogo = latest.systemMap["sys.app.logo"];
    const nextSettings = {
      ...defaultSettings,
      ...latest.theme,
      title: systemTitle ?? defaultSettings.title,
      logo:
        latest.theme.logo ??
        systemLogo ??
        (defaultSettings.logo as string | false),
    } as ThemeLayoutSettings;

    return {
      theme: nextSettings,
      themeMeta: latest.themeMeta,
    };
  };

  setRefreshGlobalSettingsHandler(refreshSettings);
  const { location } = history;

  // ====== 公开路由：直接加载 Public Settings ======
  if (isPublicRoute(location.pathname)) {
    const result = await fetchPublicSettings();
    const systemMap = result.systemMap;
    const mergedSettings = {
      ...defaultSettings,
      ...result.theme,
      title: result.theme.title ?? systemMap["sys.app.name"] ?? defaultSettings.title,
      logo:
        result.theme.logo ??
        systemMap["sys.app.logo"] ??
        (defaultSettings.logo as string | false),
    } as ThemeLayoutSettings;

    return {
      fetchUserInfo,
      refreshSettings,
      settings: mergedSettings,
      themeMeta: result.themeMeta,
      settingDrawerOpen: false,
      systemMap,
    };
  }

  // ====== 受保护路由：先恢复 Session ======
  const authState = await ensureValidSession();

  if (authState !== 'valid') {
    redirectToLogin();
    // 返回一个空的初始状态，避免页面渲染异常
    return {
      fetchUserInfo,
      refreshSettings,
      settings: defaultSettings,
      settingDrawerOpen: false,
      systemMap: {},
    };
  }

  // Session 有效 → 加载受保护的初始数据
  let initialTheme: {
    theme: ThemeLayoutSettings;
    themeMeta: ThemeMeta;
    systemMap: Record<string, string>;
  };

  try {
    initialTheme = await fetchAuthSettings();
  } catch {
    // Auth Settings 失败 → 直接跳登录（不 fallback public）
    redirectToLogin();
    return {
      fetchUserInfo,
      refreshSettings,
      settings: defaultSettings,
      settingDrawerOpen: false,
      systemMap: {},
    };
  }

  const systemMap = initialTheme.systemMap;
  const mergedSettings = {
    ...defaultSettings,
    ...initialTheme.theme,
    title: initialTheme.theme.title ?? systemMap["sys.app.name"] ?? defaultSettings.title,
    logo:
      initialTheme.theme.logo ??
      systemMap["sys.app.logo"] ??
      (defaultSettings.logo as string | false),
  } as ThemeLayoutSettings;

  // 加载用户信息
  const currentUser = await fetchUserInfo();

  return {
    fetchUserInfo,
    refreshSettings,
    currentUser,
    settings: mergedSettings,
    themeMeta: initialTheme.themeMeta,
    settingDrawerOpen: false,
    systemMap,
  };
}

export const layout: RunTimeLayoutConfig = ({
  initialState,
  setInitialState,
}) => {
  const buildThemePayload = (settings: ThemeLayoutSettings) => ({
    navTheme: settings.navTheme,
    colorPrimary: settings.colorPrimary,
    layout: settings.layout,
    contentWidth: settings.contentWidth,
    fixedHeader: settings.fixedHeader ? 1 : 0,
    fixSiderbar: settings.fixSiderbar ? 1 : 0,
    colorWeak: settings.colorWeak ? 1 : 0,
    title: settings.title ?? "",
    logo:
      typeof settings.logo === "string" && settings.logo ? settings.logo : null,
    iconfontUrl:
      typeof settings.iconfontUrl === "string" && settings.iconfontUrl
        ? settings.iconfontUrl
        : null,
    tokenJson: JSON.stringify(settings.token ?? {}),
    tenantId: (settings.tenantId as string | undefined) ?? undefined,
  });

  return {
    ...initialState?.settings,
      menuDataRender: () => {
        const dashboardTitle =
          initialState?.systemMap?.['sys.dashboard.name'] || '仪表盘';
        return mapBackendMenus(initialState?.currentUser?.menus, dashboardTitle);
      },
    selectedKeys: normalizeSelectedKeys(history.location.pathname),
    menuItemRender: (item, dom) => {
      if (item.path) {
        return (
          <Link to={item.path} prefetch>
            {dom}
          </Link>
        );
      }
      return dom;
    },
    actionsRender: () => {
      const localeEnabled =
        (initialState?.settings as { locale?: boolean })?.locale !== false;
      return [
        <GlobalSearchModal key="global-search" />,
        localeEnabled && <LangDropdown key="lang" />,
      ].filter(Boolean);
    },
    avatarProps: {
      src:
        initialState?.currentUser?.avatar ||
        initialState?.systemMap?.["sys.user.defaultAvatar"],
      title:
        initialState?.currentUser?.nickname ||
        initialState?.currentUser?.username ||
        initialState?.systemMap?.["sys.app.name"] ||
        defaultSettings.title,
      render: (_, avatarChildren) => (
        <AvatarDropdown>{avatarChildren}</AvatarDropdown>
      ),
    },
    footerRender: () => <Footer />,
    onPageChange: () => {
      const { location } = history;
      if (!initialState?.currentUser && location.pathname !== loginPath) {
        history.replace(
          `${loginPath}?redirect=${encodeURIComponent(
            location.pathname + location.search + location.hash
          )}`
        );
      }
    },
    bgLayoutImgList: [
      {
        src: "https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/D2LWSqNny4sAAAAAAAAAAAAAFl94AQBr",
        left: 85,
        bottom: 100,
        height: "303px",
      },
      {
        src: "https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/C2TWRpJpiC0AAAAAAAAAAAAAFl94AQBr",
        bottom: -68,
        right: -45,
        height: "303px",
      },
      {
        src: "https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/F6vSTbj8KpYAAAAAAAAAAAAAFl94AQBr",
        bottom: 0,
        left: 0,
        width: "331px",
      },
    ],
    links: isDev
      ? [
          <Link key="openapi" to="baidu.com" target="_blank">
            <span>@Baolongshen</span>
          </Link>,
        ]
      : [],
    ErrorBoundary,
    menuHeaderRender: undefined,
    childrenRender: (children) => {
      return (
        <>
          {children}
          <SettingDrawer
            disableUrlParams
            enableDarkTheme
            collapse={initialState?.settingDrawerOpen}
            onCollapseChange={(open) => {
              setInitialState((s) => ({
                ...s,
                settingDrawerOpen: open,
              }));
            }}
            settings={initialState?.settings}
            onSettingChange={async (settings) => {
              const previousSettings = initialState?.settings ?? {};
              const themeMeta = initialState?.themeMeta ?? {};
              const optimisticSettings = {
                ...previousSettings,
                ...settings,
              } as ThemeLayoutSettings;

              setInitialState((s) => ({
                ...s,
                settings: optimisticSettings,
              }));

              const currentTenantId =
                themeMeta.tenantId ?? initialState?.currentUser?.tenantId;
              const themeId = themeMeta.themeId;
              const payload = {
                ...buildThemePayload(optimisticSettings),
                tenantId: currentTenantId,
              };
              try {
                if (themeId) {
                  await updateTheme({
                    themeId,
                    ...payload,
                  });
                } else {
                  await addTheme(payload);
                }

                const latest = await refreshGlobalSettings();
                message.success("主题设置已更新");
                setInitialState((s) => ({
                  ...s,
                  settings: {
                    ...defaultSettings,
                    ...(latest.theme ?? {}),
                  },
                  themeMeta: latest.themeMeta ?? themeMeta,
                }));
              } catch (error) {
                message.error("主题设置更新失败，正在恢复配置");
                console.error("update theme failed", error);
                try {
                  const restored = await refreshGlobalSettings();
                  setInitialState((s) => ({
                    ...s,
                    settings: {
                      ...defaultSettings,
                      ...(restored.theme ?? {}),
                    },
                    themeMeta: restored.themeMeta ?? themeMeta,
                  }));
                } catch {
                  setInitialState((s) => ({
                    ...s,
                    settings: previousSettings,
                    themeMeta,
                  }));
                }
              }
            }}
          />
        </>
      );
    },
    ...initialState?.settings,
    title: getHeaderTitle(initialState?.settings, initialState?.systemMap),
    logo: getHeaderLogo(initialState?.settings, initialState?.systemMap),
  };
};

// ====== 请求配置 ======
// 生产环境使用同源 Nginx 反代 /api，不暴露外部地址
const requestConfig: RequestConfig = {
  baseURL: isDev ? "" : "",
  ...errorConfig,
};

export { requestConfig as request };

export function rootContainer(container: React.ReactNode) {
  return (
    <>
      <OfflineBanner />
      <ErrorBoundary>
        <TokenRefreshGuard>
          <GlobalRealtimeProvider>{container}</GlobalRealtimeProvider>
        </TokenRefreshGuard>
      </ErrorBoundary>
    </>
  );
}
