/**
 * 系统参数页 —— 「登录人机验证」开关与高级配置（两级架构）
 *
 * 第一层：ALTCHA 静默 Proof-of-Work（primaryProvider，固定 altcha）
 * 第二层：Tianai 图形验证（secondaryProvider + secondaryType，策略命中时才出现）
 *
 * 保存走 `POST /api/system/config/batch`（后端**单事务** + Tianai 可用性预检），
 * 保存成功后后端清空 Dynamic Config 缓存，配置立即生效。
 *
 * 密钥类配置（ALTCHA_HMAC_KEY / ALTCHA_COST / TIANAI_BASE_URL）来自环境变量，不在本页面暴露。
 */
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  InputNumber,
  Select,
  Skeleton,
  Switch,
  Tag,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listResource } from '@/services/system/crud';
import { batchUpdateConfigs, type ConfigBatchItem } from '@/services/system/config';
import type { ConfigRecord } from '../index';

const BASE_PATH = '/api/system/config';
const RESOURCE = { basePath: BASE_PATH, remove: false, status: false } as const;

export const CAPTCHA_KEYS = {
  enabled: 'sys.login.captcha.enabled',
  mode: 'sys.login.captcha.mode',
  primaryProvider: 'sys.login.captcha.primaryProvider',
  secondaryProvider: 'sys.login.captcha.secondaryProvider',
  secondaryType: 'sys.login.captcha.secondaryType',
  challengeTtlSeconds: 'sys.login.captcha.challengeTtlSeconds',
  tokenTtlSeconds: 'sys.login.captcha.tokenTtlSeconds',
  forceAfterFailures: 'sys.login.captcha.forceAfterFailures',
} as const;

/** 行不存在时新建用的展示名与默认值（与后端 Dynamic Config 默认值一致） */
const KEY_META: Record<string, { name: string; defaultValue: string; remark: string }> = {
  [CAPTCHA_KEYS.enabled]: { name: '登录人机验证开关', defaultValue: 'true', remark: '是否开启登录人机验证' },
  [CAPTCHA_KEYS.mode]: { name: '登录人机验证模式', defaultValue: 'adaptive', remark: 'off/adaptive/always' },
  [CAPTCHA_KEYS.primaryProvider]: { name: '第一层人机验证提供方', defaultValue: 'altcha', remark: '第一层（静默）固定 altcha（Proof-of-Work）' },
  [CAPTCHA_KEYS.secondaryProvider]: { name: '第二层人机验证提供方', defaultValue: 'tianai', remark: '第二层（显式）tianai=独立图形验证码服务' },
  [CAPTCHA_KEYS.secondaryType]: { name: '第二层验证类型', defaultValue: 'blockPuzzle', remark: 'blockPuzzle=滑块拼图；clickWord=点选文字' },
  [CAPTCHA_KEYS.challengeTtlSeconds]: { name: '验证挑战有效期(秒)', defaultValue: '180', remark: 'challenge / 二级会话有效期 30-900' },
  [CAPTCHA_KEYS.tokenTtlSeconds]: { name: '登录验证凭证有效期(秒)', defaultValue: '120', remark: '一次性 captchaToken 有效期 30-600' },
  [CAPTCHA_KEYS.forceAfterFailures]: { name: '连续失败要求第二层次数', defaultValue: '3', remark: '同账号近期连续登录失败达到该值后必须完成第二层验证 1-100' },
};

export interface CaptchaSettingValues {
  mode: 'off' | 'adaptive' | 'always';
  primaryProvider: 'altcha' | 'tianai';
  secondaryProvider: 'altcha' | 'tianai';
  secondaryType: 'blockPuzzle' | 'clickWord';
  challengeTtlSeconds: number;
  tokenTtlSeconds: number;
  forceAfterFailures: number;
}

const DEFAULTS: CaptchaSettingValues = {
  mode: 'adaptive',
  primaryProvider: 'altcha',
  secondaryProvider: 'tianai',
  secondaryType: 'blockPuzzle',
  challengeTtlSeconds: 180,
  tokenTtlSeconds: 120,
  forceAfterFailures: 3,
};

function toBoolean(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

function toValues(rows: Map<string, ConfigRecord>): CaptchaSettingValues {
  const get = (key: string, fallback: string) => String(rows.get(key)?.configValue ?? fallback);
  const mode = get(CAPTCHA_KEYS.mode, DEFAULTS.mode);
  const primaryProvider = get(CAPTCHA_KEYS.primaryProvider, DEFAULTS.primaryProvider);
  const secondaryProvider = get(CAPTCHA_KEYS.secondaryProvider, DEFAULTS.secondaryProvider);
  const secondaryType = get(CAPTCHA_KEYS.secondaryType, DEFAULTS.secondaryType);
  return {
    mode: (['off', 'adaptive', 'always'].includes(mode) ? mode : DEFAULTS.mode) as CaptchaSettingValues['mode'],
    primaryProvider: (['altcha', 'tianai'].includes(primaryProvider) ? primaryProvider : DEFAULTS.primaryProvider) as CaptchaSettingValues['primaryProvider'],
    secondaryProvider: (['altcha', 'tianai'].includes(secondaryProvider) ? secondaryProvider : DEFAULTS.secondaryProvider) as CaptchaSettingValues['secondaryProvider'],
    secondaryType: (['blockPuzzle', 'clickWord'].includes(secondaryType) ? secondaryType : DEFAULTS.secondaryType) as CaptchaSettingValues['secondaryType'],
    challengeTtlSeconds: Number(get(CAPTCHA_KEYS.challengeTtlSeconds, '180')) || DEFAULTS.challengeTtlSeconds,
    tokenTtlSeconds: Number(get(CAPTCHA_KEYS.tokenTtlSeconds, '120')) || DEFAULTS.tokenTtlSeconds,
    forceAfterFailures: Number(get(CAPTCHA_KEYS.forceAfterFailures, '3')) || DEFAULTS.forceAfterFailures,
  };
}

/** 组装批量更新项（保持 sys_config 行的展示名 / 备注） */
function toBatchItems(entries: Array<[string, string]>): ConfigBatchItem[] {
  return entries.map(([configKey, configValue]) => {
    const meta = KEY_META[configKey];
    return {
      configKey,
      configValue,
      ...(meta ? { configName: meta.name, configType: 'sys', remark: meta.remark } : {}),
    };
  });
}

export interface CaptchaSettingPanelProps {
  /** 是否可编辑（编辑操作需要 system:config:edit / add 权限） */
  canEdit?: boolean;
  onSaved?: () => void;
}

export default function CaptchaSettingPanel({ canEdit = true, onSaved }: CaptchaSettingPanelProps) {
  const [form] = Form.useForm<CaptchaSettingValues>();
  const [rows, setRows] = useState<Map<string, ConfigRecord>>(new Map());
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // pageSize 上限为 100（后端约定），sys_config 行数远小于该值
      const res = await listResource<ConfigRecord>(RESOURCE, { pageNum: 1, pageSize: 100 });
      const list = ((res as any)?.data ?? []) as ConfigRecord[];
      const map = new Map<string, ConfigRecord>();
      for (const row of list) {
        if (Object.values(CAPTCHA_KEYS).includes(row.configKey as any)) map.set(row.configKey, row);
      }
      setRows(map);
      setEnabled(toBoolean(map.get(CAPTCHA_KEYS.enabled)?.configValue ?? KEY_META[CAPTCHA_KEYS.enabled].defaultValue));
      form.setFieldsValue(toValues(map));
    } catch {
      message.error('加载登录人机验证配置失败');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 批量事务保存（后端失败整体回滚，不会出现"改了一半"） */
  const saveBatch = useCallback(
    async (entries: Array<[string, string]>, successText: string) => {
      setSaving(true);
      try {
        await batchUpdateConfigs(toBatchItems(entries));
        message.success(successText);
        await load();
        onSaved?.();
        return true;
      } catch (err: any) {
        message.error(err?.response?.data?.message ?? '保存失败，请重试');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, onSaved],
  );

  const handleToggleEnabled = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      const ok = await saveBatch(
        [[CAPTCHA_KEYS.enabled, next ? 'true' : 'false']],
        next ? '已开启登录人机验证' : '已关闭登录人机验证',
      );
      if (!ok) setEnabled(previous);
    },
    [enabled, saveBatch],
  );

  const handleSaveAdvanced = useCallback(async () => {
    let values: CaptchaSettingValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 表单校验失败
    }
    await saveBatch(
      [
        [CAPTCHA_KEYS.mode, values.mode],
        [CAPTCHA_KEYS.primaryProvider, values.primaryProvider],
        [CAPTCHA_KEYS.secondaryProvider, values.secondaryProvider],
        [CAPTCHA_KEYS.secondaryType, values.secondaryType],
        [CAPTCHA_KEYS.challengeTtlSeconds, String(values.challengeTtlSeconds)],
        [CAPTCHA_KEYS.tokenTtlSeconds, String(values.tokenTtlSeconds)],
        [CAPTCHA_KEYS.forceAfterFailures, String(values.forceAfterFailures)],
      ],
      '登录人机验证配置已更新，立即生效',
    );
  }, [form, saveBatch]);

  const summary = useMemo(() => {
    const values = toValues(rows);
    return [
      { label: '验证模式', value: values.mode },
      { label: '第一层', value: 'ALTCHA（静默 Proof-of-Work）' },
      {
        label: '第二层',
        value: values.secondaryProvider === 'tianai'
          ? `Tianai（${values.secondaryType === 'clickWord' ? '点选文字' : '滑块拼图'}）`
          : '未启用',
      },
      { label: '凭证有效期', value: `${values.tokenTtlSeconds} 秒` },
      { label: '挑战有效期', value: `${values.challengeTtlSeconds} 秒` },
      { label: '连续失败升档', value: `${values.forceAfterFailures} 次` },
    ];
  }, [rows]);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <span>
          登录人机验证{' '}
          <Tag color={enabled ? 'green' : 'default'} style={{ marginLeft: 4 }}>
            {enabled ? '已开启' : '已关闭'}
          </Tag>
        </span>
      }
      extra={
        <Switch
          checked={enabled}
          checkedChildren="开启"
          unCheckedChildren="关闭"
          disabled={!canEdit || saving || loading}
          onChange={handleToggleEnabled}
        />
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 8 }}>
            {summary.map((item) => (
              <Descriptions.Item key={item.label} label={item.label}>
                {item.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
          <Collapse
            ghost
            items={[
              {
                key: 'advanced',
                label: '高级配置',
                children: (
                  <Form<CaptchaSettingValues>
                    form={form}
                    layout="vertical"
                    initialValues={DEFAULTS}
                    disabled={!canEdit}
                  >
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="密钥与服务地址来自环境变量"
                      description="ALTCHA_HMAC_KEY（生产必填）、ALTCHA_COST、TIANAI_BASE_URL 由部署环境配置，不在本页面暴露。启用第二层前请先确保 Tianai 服务可用，否则保存会被拒绝。"
                    />
                    <Form.Item
                      label="验证模式"
                      name="mode"
                      extra="off=关闭；adaptive=默认静默（连续失败/高风险时要求第二层）；always=始终要求第二层"
                    >
                      <Select
                        options={[
                          { value: 'off', label: 'off（关闭）' },
                          { value: 'adaptive', label: 'adaptive（自适应，默认）' },
                          { value: 'always', label: 'always（始终要求第二层）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="第一层提供方（静默）"
                      name="primaryProvider"
                      extra="固定 altcha：浏览器后台完成 Proof-of-Work，服务端校验，用户无感"
                    >
                      <Select
                        options={[{ value: 'altcha', label: 'altcha（ALTCHA 自托管，默认）' }]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="第二层提供方（显式）"
                      name="secondaryProvider"
                      extra="tianai=独立部署的 Tianai CAPTCHA 服务；需配置 TIANAI_BASE_URL，保存时会做可用性预检"
                    >
                      <Select
                        options={[
                          { value: 'tianai', label: 'tianai（Tianai CAPTCHA，默认）' },
                          { value: 'altcha', label: 'altcha（不使用第二层，不推荐）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="第二层验证类型"
                      name="secondaryType"
                      extra="blockPuzzle=滑块拼图；clickWord=点选文字（均支持键盘操作）"
                    >
                      <Select
                        options={[
                          { value: 'blockPuzzle', label: 'blockPuzzle（滑块拼图）' },
                          { value: 'clickWord', label: 'clickWord（点选文字）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="验证挑战有效期（秒）"
                      name="challengeTtlSeconds"
                      extra="ALTCHA challenge 与第二层会话的有效期（30-900）"
                      rules={[{ required: true, message: '请输入有效期' }]}
                    >
                      <InputNumber min={30} max={900} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="登录凭证有效期（秒）"
                      name="tokenTtlSeconds"
                      extra="一次性 captchaToken 有效期，默认 120（30-600）"
                      rules={[{ required: true, message: '请输入有效期' }]}
                    >
                      <InputNumber min={30} max={600} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="连续失败要求第二层次数"
                      name="forceAfterFailures"
                      extra="同一账号近期连续登录失败达到该值后，必须完成第二层 Tianai 验证（1-100）"
                      rules={[{ required: true, message: '请输入次数' }]}
                    >
                      <InputNumber min={1} max={100} style={{ width: 180 }} />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={saving}
                        disabled={!canEdit}
                        onClick={handleSaveAdvanced}
                      >
                        保存高级配置
                      </Button>
                      <Button icon={<ReloadOutlined />} onClick={load} disabled={saving}>
                        重新加载
                      </Button>
                    </div>
                  </Form>
                ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}
