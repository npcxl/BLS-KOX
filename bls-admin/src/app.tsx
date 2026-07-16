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
import type { ProSettings, Settings as LayoutSettings } from "@ant-design/pro-components";
import { SettingDrawer } from "@ant-design/pro-components";
import type { RequestConfig, RunTimeLayoutConfig } from "@umijs/max";
import { history, Link } from "@umijs/max";
import { message } from "antd";
import React, { useRef } from "react";
import defaultSettings from "../config/defaultSettings";
import { errorConfig } from "./requestErrorConfig";
import { ensureValidSession, redirectToLogin, setLoginPath } from "@/auth/auth-manager";
import { tokenStore } from "@/auth/token-store";
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
  dashboardTitle = '首页'
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
      icon: <AntIcons.HomeOutlined />,
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
  settings?: ThemeLayoutSettings,
  systemMap?: Record<string, string>,
) {
  return (settings?.title as string) ?? systemMap?.title ?? defaultSettings.title;
}

function getHeaderLogo(
  settings?: ThemeLayoutSettings,
  systemMap?: Record<string, string>,
) {
  return (settings?.logo as string) ?? systemMap?.logo ?? undefined;
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
      splitMenus: toBoolean(theme.splitMenus, false),
      siderMenuType: theme.siderMenuType ?? 'sub',

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

type ThemeLayoutSettings = Partial<LayoutSettings> & {
  siderMenuType?: string;
  splitMenus?: boolean;
  locale?: boolean;
};

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
        tokenStore.setCurrentUser(msg.data);
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

  const refreshSettings = async (): Promise<{ theme?: ThemeLayoutSettings; themeMeta?: ThemeMeta }> => {
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
        return { theme: undefined, themeMeta: undefined };
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
    const mergedSettings: ThemeLayoutSettings = {
      ...defaultSettings,
      ...result.theme,
      title: result.theme.title ?? systemMap["sys.app.name"] ?? defaultSettings.title,
      logo:
        result.theme.logo ??
        systemMap["sys.app.logo"] ??
        (defaultSettings.logo as string | false),
    };

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
      settings: defaultSettings as ThemeLayoutSettings,
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
      settings: defaultSettings as ThemeLayoutSettings,
      settingDrawerOpen: false,
      systemMap: {},
    };
  }

  const systemMap = initialTheme.systemMap;
    const mergedSettings: ThemeLayoutSettings = {
      ...defaultSettings,
      ...initialTheme.theme,
      title: initialTheme.theme.title ?? systemMap["sys.app.name"] ?? defaultSettings.title,
      logo:
        initialTheme.theme.logo ??
        systemMap["sys.app.logo"] ??
        (defaultSettings.logo as string | false),
    };

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
  // 守卫：SettingDrawer 会在挂载时自动调用一次 onSettingChange，这里跳过首次自动同步
  const isFirstSettingChangeRef = useRef(true);

  const buildThemePayload = (settings: ThemeLayoutSettings) => ({
    navTheme: settings.navTheme,
    colorPrimary: settings.colorPrimary,
    layout: settings.layout,
    contentWidth: settings.contentWidth,
    fixedHeader: settings.fixedHeader ? 1 : 0,
    fixSiderbar: settings.fixSiderbar ? 1 : 0,
    colorWeak: settings.colorWeak ? 1 : 0,
    splitMenus: settings.splitMenus ? 1 : 0,
    siderMenuType: (settings as any).siderMenuType ?? 'sub',
    title: settings.title ?? "",
    logo:
      typeof (settings as any).logo === "string" && (settings as any).logo ? (settings as any).logo : null,
    iconfontUrl:
      typeof (settings as any).iconfontUrl === "string" && (settings as any).iconfontUrl
        ? (settings as any).iconfontUrl
        : null,
    tokenJson: JSON.stringify((settings as any).token ?? {}),
    tenantId: ((settings as any).tenantId as string | undefined) ?? undefined,
  });

  return {
    ...initialState?.settings,
      menuDataRender: () => {
        const dashboardTitle =
          initialState?.systemMap?.['sys.dashboard.name'] || '首页';
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
        (initialState?.settings as ThemeLayoutSettings)?.locale !== false;
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
    bgLayoutImgList: [],
    links: [],
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
            settings={(initialState?.settings ?? {}) as ProSettings}
            onSettingChange={async (settings) => {
              // SettingDrawer 挂载时会自动调用一次 onSettingChange 以同步 URL 参数，
              // 此处跳过首次自动触发，避免在用户未真正修改设置时就调用 /theme/edit
              if (isFirstSettingChangeRef.current) {
                isFirstSettingChangeRef.current = false;
                return;
              }

              const previousSettings = initialState?.settings ?? {};
              const themeMeta = initialState?.themeMeta ?? {};
              const optimisticSettings: ThemeLayoutSettings = {
                ...previousSettings,
                ...settings,
              };

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
                  } as any);
                } else {
                  await addTheme(payload as any);
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
