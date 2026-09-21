/**
 * 系统参数页 —— 「登录人机验证」开关与高级配置（ALTCHA 方案）
 *
 * 直接读写 sys_config 中的 sys.login.captcha.* 参数（与系统参数表格同一份数据），
 * 保存后后端会清空 Dynamic Config 缓存，配置立即生效。
 *
 * 注意：ALTCHA 的 HMAC 密钥、PoW 难度、Tianai 服务地址等**密钥类配置来自环境变量**
 * （`ALTCHA_HMAC_KEY` / `ALTCHA_COST` / `TIANAI_BASE_URL`），不在本页面暴露。
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
import { addResource, editResource, listResource } from '@/services/system/crud';
import type { ConfigRecord } from '../index';

const BASE_PATH = '/api/system/config';
const RESOURCE = { basePath: BASE_PATH, remove: false, status: false } as const;

export const CAPTCHA_KEYS = {
  enabled: 'sys.login.captcha.enabled',
  mode: 'sys.login.captcha.mode',
  provider: 'sys.login.captcha.provider',
  challengeTtlSeconds: 'sys.login.captcha.challengeTtlSeconds',
  tokenTtlSeconds: 'sys.login.captcha.tokenTtlSeconds',
  forceAfterFailures: 'sys.login.captcha.forceAfterFailures',
} as const;

/** 行不存在时新建用的展示名与默认值（与后端 Dynamic Config 默认值一致） */
const KEY_META: Record<string, { name: string; defaultValue: string; remark: string }> = {
  [CAPTCHA_KEYS.enabled]: { name: '登录人机验证开关', defaultValue: 'true', remark: '是否开启登录人机验证（ALTCHA）' },
  [CAPTCHA_KEYS.mode]: { name: '登录人机验证模式', defaultValue: 'adaptive', remark: 'off/adaptive/always' },
  [CAPTCHA_KEYS.provider]: { name: '人机验证提供方', defaultValue: 'altcha', remark: 'altcha=自托管 ALTCHA(默认)；tianai=独立验证码服务' },
  [CAPTCHA_KEYS.challengeTtlSeconds]: { name: '验证挑战有效期(秒)', defaultValue: '180', remark: 'ALTCHA challenge 有效期 30-900' },
  [CAPTCHA_KEYS.tokenTtlSeconds]: { name: '登录验证凭证有效期(秒)', defaultValue: '120', remark: '一次性 captchaToken 有效期 30-600' },
  [CAPTCHA_KEYS.forceAfterFailures]: { name: '连续失败要求可见验证次数', defaultValue: '3', remark: '同账号近期连续登录失败达到该值后不再完全静默 1-100' },
};

export interface CaptchaSettingValues {
  mode: 'off' | 'adaptive' | 'always';
  provider: 'altcha' | 'tianai';
  challengeTtlSeconds: number;
  tokenTtlSeconds: number;
  forceAfterFailures: number;
}

const DEFAULTS: CaptchaSettingValues = {
  mode: 'adaptive',
  provider: 'altcha',
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
  const provider = get(CAPTCHA_KEYS.provider, DEFAULTS.provider);
  return {
    mode: (['off', 'adaptive', 'always'].includes(mode) ? mode : DEFAULTS.mode) as CaptchaSettingValues['mode'],
    provider: (['altcha', 'tianai'].includes(provider) ? provider : DEFAULTS.provider) as CaptchaSettingValues['provider'],
    challengeTtlSeconds: Number(get(CAPTCHA_KEYS.challengeTtlSeconds, '180')) || DEFAULTS.challengeTtlSeconds,
    tokenTtlSeconds: Number(get(CAPTCHA_KEYS.tokenTtlSeconds, '120')) || DEFAULTS.tokenTtlSeconds,
    forceAfterFailures: Number(get(CAPTCHA_KEYS.forceAfterFailures, '3')) || DEFAULTS.forceAfterFailures,
  };
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

  /** 写入单个参数：存在则编辑，不存在则新增 */
  const writeKey = useCallback(
    async (key: string, value: string) => {
      const existing = rows.get(key);
      if (existing) {
        await editResource(RESOURCE, { configId: existing.configId, configValue: value } as any);
      } else {
        const meta = KEY_META[key];
        await addResource(RESOURCE, {
          configKey: key,
          configValue: value,
          configName: meta.name,
          configType: 'sys',
          status: '0',
          remark: meta.remark,
        } as any);
      }
    },
    [rows],
  );

  const handleToggleEnabled = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setSaving(true);
      try {
        await writeKey(CAPTCHA_KEYS.enabled, next ? 'true' : 'false');
        message.success(next ? '已开启登录人机验证' : '已关闭登录人机验证');
        await load();
        onSaved?.();
      } catch {
        setEnabled(previous);
        message.error('保存失败，请重试');
      } finally {
        setSaving(false);
      }
    },
    [enabled, load, onSaved, writeKey],
  );

  const handleSaveAdvanced = useCallback(async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await Promise.all([
        writeKey(CAPTCHA_KEYS.mode, values.mode),
        writeKey(CAPTCHA_KEYS.provider, values.provider),
        writeKey(CAPTCHA_KEYS.challengeTtlSeconds, String(values.challengeTtlSeconds)),
        writeKey(CAPTCHA_KEYS.tokenTtlSeconds, String(values.tokenTtlSeconds)),
        writeKey(CAPTCHA_KEYS.forceAfterFailures, String(values.forceAfterFailures)),
      ]);
      message.success('登录人机验证配置已更新，立即生效');
      await load();
      onSaved?.();
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验失败
      message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [form, load, onSaved, writeKey]);

  const summary = useMemo(() => {
    const values = toValues(rows);
    return [
      { label: '验证模式', value: values.mode },
      { label: '提供方', value: values.provider === 'altcha' ? 'ALTCHA（自托管）' : 'Tianai CAPTCHA' },
      { label: '凭证有效期', value: `${values.tokenTtlSeconds} 秒` },
      { label: '挑战有效期', value: `${values.challengeTtlSeconds} 秒` },
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
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 8 }}>
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
                      message="ALTCHA 密钥、PoW 难度与 Tianai 服务地址来自环境变量"
                      description="ALTCHA_HMAC_KEY（生产必填）、ALTCHA_COST、TIANAI_BASE_URL 由部署环境配置，不在本页面暴露。"
                    />
                    <Form.Item
                      label="验证模式"
                      name="mode"
                      extra="off=关闭；adaptive=默认静默（连续失败/高风险时转为可见验证）；always=始终显示可见组件"
                    >
                      <Select
                        options={[
                          { value: 'off', label: 'off（关闭）' },
                          { value: 'adaptive', label: 'adaptive（自适应，默认）' },
                          { value: 'always', label: 'always（始终可见）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="提供方"
                      name="provider"
                      extra="altcha=自托管 ALTCHA（默认，服务端校验 Proof-of-Work）；tianai=独立部署的 Tianai CAPTCHA 服务（仅在确需滑块拼图时启用，需配置 TIANAI_BASE_URL）"
                    >
                      <Select
                        options={[
                          { value: 'altcha', label: 'altcha（ALTCHA 自托管，默认）' },
                          { value: 'tianai', label: 'tianai（Tianai CAPTCHA 独立服务）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="验证挑战有效期（秒）"
                      name="challengeTtlSeconds"
                      extra="ALTCHA challenge 有效期（30-900）"
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
                      label="连续失败要求可见验证次数"
                      name="forceAfterFailures"
                      extra="同一账号近期连续登录失败达到该值后，不再完全静默，改为展示 ALTCHA 可见组件（1-100）"
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
