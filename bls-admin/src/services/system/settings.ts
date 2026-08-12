import type { Settings as LayoutSettings } from '@ant-design/pro-components';

let refreshSettingsHandler: (() => Promise<any>) | undefined;

export function setRefreshGlobalSettingsHandler(
  handler?: () => Promise<any>,
) {
  refreshSettingsHandler = handler;
}

export async function refreshGlobalSettings() {
  return refreshSettingsHandler?.() ?? {};
}
