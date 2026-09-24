/**
 * 系统参数页 —— 「登录人机验证」配置弹窗（两级架构）
 *
 * 入口：系统参数页**右上角工具栏**的「人机验证」按钮（页面上不再占用一整张卡片）。
 *
 * 第一层：ALTCHA Proof-of-Work（`captcha_primary_provider`，登录页可见确认框，浏览器本地求解）
 * 第二层：Tianai 图形验证（`captcha_tianai_enabled` + `captcha_secondary_type`，风控命中时才出现）
 *
 * ⚠ 配置键**只有**下面这 8 个扁平键（与后端 `dynamic-config.ts` 的 SCHEMA 一一对应）：
 *     login_captcha_enabled / captcha_primary_provider / captcha_fallback_provider /
 *     captcha_ticket_ttl / captcha_tianai_enabled / captcha_challenge_ttl /
 *     captcha_force_after_failures / captcha_secondary_type
 *   历史 `sys.login.captcha.*` 已由迁移改写，运行时不再维护两套键；`mode`（off/adaptive/always）
 *   没有后端实现，已删除。
 *
 * 保存走 `POST /api/system/config/batch`（后端白名单 + **单事务** + Tianai 可用性预检），
 * **8 个键一次提交**，不会出现"改了一半"；保存成功后后端清空 Dynamic Config 缓存，配置立即生效。
 *
 * 密钥类配置（ALTCHA_HMAC_KEY / ALTCHA_COST / TIANAI_BASE_URL）来自环境变量，不在本页面暴露。
 *
 * 交互：
 *   - **懒加载**：页面加载时不发请求（原来那张卡片每次进系统参数页都要分页扫 sys_config，
 *     行数超过 100 时最多会打 5 次列表接口），只有点开弹窗才读配置；
 *   - 首次成功读取后，按钮上带「已开启 / 已关闭」状态；
 *   - 读取失败时**禁用保存**，避免把默认值写回去覆盖线上配置。
 */
import { ReloadOutlined, SafetyOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Button, Tag, message } from 'antd';
import {
  ModalForm,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { useCallback, useRef, useState } from 'react';
import { listResource } from '@/services/system/crud';
import { batchUpdateConfigs, type ConfigBatchItem } from '@/services/system/config';
import type { ConfigRecord } from '../index';

const BASE_PATH = '/api/system/config';
const RESOURCE = { basePath: BASE_PATH, remove: false, status: false } as const;

/** 唯一正式的 8 个配置键 */
export const CAPTCHA_KEYS = {
  enabled: 'login_captcha_enabled',
  primaryProvider: 'captcha_primary_provider',
  fallbackProvider: 'captcha_fallback_provider',
  ticketTtl: 'captcha_ticket_ttl',
  tianaiEnabled: 'captcha_tianai_enabled',
  challengeTtl: 'captcha_challenge_ttl',
  forceAfterFailures: 'captcha_force_after_failures',
  secondaryType: 'captcha_secondary_type',
} as const;

const ALL_KEYS: readonly string[] = Object.values(CAPTCHA_KEYS);

/** 行不存在时新建用的展示名与默认值（与后端 Dynamic Config 默认值保持一致） */
const KEY_META: Record<string, { name: string; defaultValue: string; remark: string }> = {
  [CAPTCHA_KEYS.enabled]: { name: '登录人机验证开关', defaultValue: 'true', remark: '是否开启登录人机验证（关闭后第一层 Proof-of-Work 也不再执行）' },
  [CAPTCHA_KEYS.primaryProvider]: { name: '第一层人机验证提供方', defaultValue: 'ALTCHA', remark: '第一层（Proof-of-Work）固定 ALTCHA：ALTCHA/TIANAI' },
  [CAPTCHA_KEYS.fallbackProvider]: { name: '第二层人机验证提供方', defaultValue: 'TIANAI', remark: '第二层（显式）固定 TIANAI：ALTCHA/TIANAI' },
  [CAPTCHA_KEYS.ticketTtl]: { name: '登录凭证有效期(秒)', defaultValue: '120', remark: '一次性 captchaTicket 有效期 30-600' },
  [CAPTCHA_KEYS.tianaiEnabled]: { name: '启用第二层 Tianai', defaultValue: 'false', remark: '部署 Tianai 并配置 TIANAI_BASE_URL 后才开启；开启后风控命中即 fail closed' },
  [CAPTCHA_KEYS.challengeTtl]: { name: '验证挑战有效期(秒)', defaultValue: '180', remark: 'ALTCHA challenge / 第二层会话有效期 30-900' },
  [CAPTCHA_KEYS.forceAfterFailures]: { name: '连续失败要求第二层次数', defaultValue: '3', remark: '同账号近期连续登录失败达到该值后必须完成第二层验证 1-100' },
  [CAPTCHA_KEYS.secondaryType]: { name: '第二层验证类型', defaultValue: 'blockPuzzle', remark: 'blockPuzzle=滑块拼图（SLIDER）；clickWord=点选文字（WORD_IMAGE_CLICK）' },
};

export interface CaptchaSettingValues {
  captchaEnabled: boolean;
  primaryProvider: 'ALTCHA' | 'TIANAI';
  fallbackProvider: 'ALTCHA' | 'TIANAI';
  secondaryType: 'blockPuzzle' | 'clickWord';
  tianaiEnabled: boolean;
  challengeTtlSeconds: number;
  ticketTtlSeconds: number;
  forceAfterFailures: number;
}

const DEFAULTS: CaptchaSettingValues = {
  captchaEnabled: true,
  primaryProvider: 'ALTCHA',
  fallbackProvider: 'TIANAI',
  secondaryType: 'blockPuzzle',
  tianaiEnabled: false,
  challengeTtlSeconds: 180,
  ticketTtlSeconds: 120,
  forceAfterFailures: 3,
};

function toBoolean(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

function toValues(rows: Map<string, ConfigRecord>): CaptchaSettingValues {
  const get = (key: string, fallback: string) => String(rows.get(key)?.configValue ?? fallback);
  const primaryProvider = get(CAPTCHA_KEYS.primaryProvider, DEFAULTS.primaryProvider);
  const fallbackProvider = get(CAPTCHA_KEYS.fallbackProvider, DEFAULTS.fallbackProvider);
  const secondaryType = get(CAPTCHA_KEYS.secondaryType, DEFAULTS.secondaryType);
  return {
    captchaEnabled: toBoolean(get(CAPTCHA_KEYS.enabled, DEFAULTS.captchaEnabled ? 'true' : 'false')),
    primaryProvider: (['ALTCHA', 'TIANAI'].includes(primaryProvider) ? primaryProvider : DEFAULTS.primaryProvider) as CaptchaSettingValues['primaryProvider'],
    fallbackProvider: (['ALTCHA', 'TIANAI'].includes(fallbackProvider) ? fallbackProvider : DEFAULTS.fallbackProvider) as CaptchaSettingValues['fallbackProvider'],
    secondaryType: (['blockPuzzle', 'clickWord'].includes(secondaryType) ? secondaryType : DEFAULTS.secondaryType) as CaptchaSettingValues['secondaryType'],
    tianaiEnabled: toBoolean(get(CAPTCHA_KEYS.tianaiEnabled, DEFAULTS.tianaiEnabled ? 'true' : 'false')),
    challengeTtlSeconds: Number(get(CAPTCHA_KEYS.challengeTtl, '180')) || DEFAULTS.challengeTtlSeconds,
    ticketTtlSeconds: Number(get(CAPTCHA_KEYS.ticketTtl, '120')) || DEFAULTS.ticketTtlSeconds,
    forceAfterFailures: Number(get(CAPTCHA_KEYS.forceAfterFailures, '3')) || DEFAULTS.forceAfterFailures,
  };
}

/** 组装批量更新项（保持 sys_config 行的展示名 / 备注；键必须是后端白名单内的扁平键） */
export function toBatchItems(entries: Array<[string, string]>): ConfigBatchItem[] {
  return entries
    .filter(([configKey]) => ALL_KEYS.includes(configKey))
    .map(([configKey, configValue]) => {
      const meta = KEY_META[configKey];
      return {
        configKey,
        configValue,
        ...(meta ? { configName: meta.name, configType: 'sys', remark: meta.remark } : {}),
      };
    });
}

/**
 * 读取人机验证相关的 sys_config 行。
 *
 * ⚠ 配置表行数可能远超单页上限（100），因此必须**分页扫描**直到找齐 8 个键，
 * 不能只取第一页再过滤 —— 那会让面板永远读不到配置、保存时又用默认值覆盖线上值。
 */
export async function loadCaptchaRows(
  fetcher: typeof listResource = listResource,
  maxPages = 5,
): Promise<Map<string, ConfigRecord>> {
  const found = new Map<string, ConfigRecord>();
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const res = await fetcher<ConfigRecord>(RESOURCE, { pageNum, pageSize: 100 });
    const list = (((res as any)?.data ?? []) as ConfigRecord[]);
    for (const row of list) {
      if (ALL_KEYS.includes(row.configKey)) found.set(row.configKey, row);
    }
    if (found.size >= ALL_KEYS.length || list.length < 100) break;
  }
  return found;
}

export interface CaptchaSettingPanelProps {
  /** 是否可编辑（编辑操作需要 system:config:edit / add 权限） */
  canEdit?: boolean;
  onSaved?: () => void;
}

export default function CaptchaSettingPanel({ canEdit = true, onSaved }: CaptchaSettingPanelProps) {
  const formRef = useRef<ProFormInstance<CaptchaSettingValues>>();
  const [rows, setRows] = useState<Map<string, ConfigRecord>>(new Map());
  /** 弹窗开关 */
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 最近一次读取是否失败：失败必须禁止保存，否则会把默认值写回线上 */
  const [loadFailed, setLoadFailed] = useState(false);
  /** 是否成功读过一次（未读过时按钮上不显示状态，避免页面加载即请求） */
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const map = await loadCaptchaRows();
      setRows(map);
      formRef.current?.setFieldsValue(toValues(map));
      setLoadFailed(false);
      setLoaded(true);
    } catch {
      setLoadFailed(true);
      message.error('加载登录人机验证配置失败，已禁止保存以免覆盖线上配置');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 打开时才读配置（懒加载）；关闭只收起弹窗，不重新请求 */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void load();
    },
    [load],
  );

  /** 批量事务保存（后端失败整体回滚，不会出现"改了一半"） */
  const saveBatch = useCallback(
    async (entries: Array<[string, string]>, successText: string) => {
      setSaving(true);
      try {
        await batchUpdateConfigs(toBatchItems(entries));
        message.success(successText);
        setLoaded(false);
        setRows(new Map());
        onSaved?.();
        setOpen(false);
        return true;
      } catch (err: any) {
        message.error(err?.response?.data?.message ?? '保存失败，请重试');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onSaved],
  );

  /** 8 个键一次提交 */
  const handleFinish = useCallback(
    async (values: CaptchaSettingValues) =>
      saveBatch(
        [
          [CAPTCHA_KEYS.enabled, values.captchaEnabled ? 'true' : 'false'],
          [CAPTCHA_KEYS.primaryProvider, values.primaryProvider],
          [CAPTCHA_KEYS.fallbackProvider, values.fallbackProvider],
          [CAPTCHA_KEYS.secondaryType, values.secondaryType],
          [CAPTCHA_KEYS.tianaiEnabled, values.tianaiEnabled ? 'true' : 'false'],
          [CAPTCHA_KEYS.challengeTtl, String(values.challengeTtlSeconds)],
          [CAPTCHA_KEYS.ticketTtl, String(values.ticketTtlSeconds)],
          [CAPTCHA_KEYS.forceAfterFailures, String(values.forceAfterFailures)],
        ],
        '登录人机验证配置已更新，立即生效',
      ),
    [saveBatch],
  );

  const enabled = toBoolean(
    rows.get(CAPTCHA_KEYS.enabled)?.configValue ?? KEY_META[CAPTCHA_KEYS.enabled].defaultValue,
  );

  return (
    <>
      <Button icon={<SafetyOutlined />} onClick={() => handleOpenChange(true)}>
        人机验证
        {loaded ? (
          <Tag
            color={enabled ? 'green' : 'default'}
            style={{ marginInlineStart: 6, marginInlineEnd: 0 }}
          >
            {enabled ? '已开启' : '已关闭'}
          </Tag>
        ) : null}
      </Button>

      <ModalForm<CaptchaSettingValues>
        title="登录人机验证 · 配置"
        open={open}
        onOpenChange={handleOpenChange}
        width={640}
        layout="vertical"
        grid
        rowProps={{ gutter: 16 }}
        formRef={formRef}
        initialValues={toValues(rows)}
        modalProps={{
          styles: { body: { maxHeight: 'calc(80vh - 160px)', overflowY: 'auto', overflowX: 'hidden' } },
        }}
        submitter={{
          searchConfig: { submitText: '保存', resetText: '取消' },
          render: (_props, dom) => [
            <Button key="reload" icon={<ReloadOutlined />} onClick={() => { void load(); }} disabled={saving || loading}>
              重新加载
            </Button>,
            ...dom,
          ],
          submitButtonProps: {
            loading: saving,
            disabled: !canEdit || loadFailed,
            icon: <SaveOutlined />,
          },
        }}
        onFinish={handleFinish}
      >
        {loadFailed ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="配置读取失败，暂不能保存"
            description="为避免把默认值写回线上，请先点左下角「重新加载」；仍失败则检查网络或 system:config 权限。"
          />
        ) : (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="密钥与服务地址来自环境变量，不在本页编辑"
            description="ALTCHA_HMAC_KEY、ALTCHA_COST、TIANAI_BASE_URL 由部署环境配置。启用第二层前请先确保 Tianai 服务可用（保存时后端会做健康检查，不可用会被拒绝）。"
          />
        )}

        <ProFormSwitch
          name="captchaEnabled"
          label="登录人机验证总开关"
          colProps={{ span: 24 }}
          tooltip="关闭后登录页不再做任何人机验证（第一层 Proof-of-Work 也一并关闭）。仅在内网/调试时短期关闭，公网环境务必保持开启。"
        />
        <ProFormSwitch
          name="tianaiEnabled"
          label="启用第二层图形验证（Tianai）"
          colProps={{ span: 24 }}
          tooltip="默认关闭。部署 Tianai 并配置 TIANAI_BASE_URL 后再开启；开启后一旦风控要求第二层而服务不可用，登录会 fail closed（不会静默降级为仅第一层）。"
        />
        <ProFormSelect
          name="primaryProvider"
          label="第一层提供方（Proof-of-Work）"
          colProps={{ span: 12 }}
          tooltip="固定 ALTCHA：登录页展示「我不是机器人」确认框，浏览器本地完成 Proof-of-Work，服务端校验并签发一次性凭证。"
          options={[{ value: 'ALTCHA', label: 'ALTCHA（自托管，默认）' }]}
        />
        <ProFormSelect
          name="fallbackProvider"
          label="第二层提供方（显式）"
          colProps={{ span: 12 }}
          tooltip="固定 TIANAI：独立部署的 Tianai CAPTCHA 服务，由 Koa 通过内网代理，浏览器永不直连。"
          options={[{ value: 'TIANAI', label: 'TIANAI（Tianai CAPTCHA，默认）' }]}
        />
        <ProFormSelect
          name="secondaryType"
          label="第二层验证类型"
          colProps={{ span: 12 }}
          tooltip="blockPuzzle=滑块拼图（官方 SLIDER）；clickWord=点选文字（官方 WORD_IMAGE_CLICK），两者都支持键盘与触摸。"
          options={[
            { value: 'blockPuzzle', label: 'blockPuzzle（滑块拼图）' },
            { value: 'clickWord', label: 'clickWord（点选文字）' },
          ]}
        />
        <ProFormDigit
          name="forceAfterFailures"
          label="连续失败要求第二层次数"
          colProps={{ span: 12 }}
          tooltip="同一账号近期连续登录失败达到该值后，必须完成第二层 Tianai 验证。"
          min={1}
          max={100}
          rules={[{ required: true, message: '请输入次数' }]}
          fieldProps={{ style: { width: '100%' } }}
        />
        <ProFormDigit
          name="challengeTtlSeconds"
          label="验证挑战有效期（秒）"
          colProps={{ span: 12 }}
          tooltip="ALTCHA challenge 与第二层会话的有效期（30-900）。"
          min={30}
          max={900}
          rules={[{ required: true, message: '请输入有效期' }]}
          fieldProps={{ style: { width: '100%' } }}
        />
        <ProFormDigit
          name="ticketTtlSeconds"
          label="登录凭证有效期（秒）"
          colProps={{ span: 12 }}
          tooltip="一次性 captchaTicket 的有效期（30-600）。"
          min={30}
          max={600}
          rules={[{ required: true, message: '请输入有效期' }]}
          fieldProps={{ style: { width: '100%' } }}
        />
      </ModalForm>
    </>
  );
}
