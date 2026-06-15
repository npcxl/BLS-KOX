import type { Settings as LayoutSettings } from '@ant-design/pro-components';

let refreshSettingsHandler: (() => Promise<Partial<LayoutSettings>>) | undefined;

export function setRefreshGlobalSettingsHandler(
  handler?: () => Promise<Partial<LayoutSettings>>,
) {
  refreshSettingsHandler = handler;
}

export async function refreshGlobalSettings() {
  return refreshSettingsHandler?.() ?? {};
}
