/**
 * 系统参数页 —— 「登录人机验证」开关与高级配置
 *
 * 直接读写 sys_config 中的 sys.login.captcha.* 参数（与系统参数表格同一份数据），
 * 保存后后端会清空 Dynamic Config 缓存，配置立即生效。
 */
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
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
  silentThreshold: 'sys.login.captcha.silentThreshold',
  forceAfterFailures: 'sys.login.captcha.forceAfterFailures',
  challengeTtlSeconds: 'sys.login.captcha.challengeTtlSeconds',
  tokenTtlSeconds: 'sys.login.captcha.tokenTtlSeconds',
  secondaryTypes: 'sys.login.captcha.secondaryTypes',
  maxAttempts: 'sys.login.captcha.maxAttempts',
  provider: 'sys.login.captcha.provider',
} as const;

/** 行不存在时新建用的展示名与默认值（与后端 Dynamic Config 默认值保持一致） */
const KEY_META: Record<string, { name: string; defaultValue: string; remark: string }> = {
  [CAPTCHA_KEYS.enabled]: { name: '登录人机验证开关', defaultValue: 'true', remark: '是否开启登录人机验证' },
  [CAPTCHA_KEYS.mode]: { name: '登录人机验证模式', defaultValue: 'adaptive', remark: 'off/adaptive/always' },
  [CAPTCHA_KEYS.silentThreshold]: { name: '静默验证通过阈值', defaultValue: '70', remark: '静默行为评分通过阈值 0-100' },
  [CAPTCHA_KEYS.forceAfterFailures]: { name: '连续失败强制二级次数', defaultValue: '3', remark: '同账号近期连续登录失败达到该值强制二级验证' },
  [CAPTCHA_KEYS.challengeTtlSeconds]: { name: '验证挑战有效期(秒)', defaultValue: '180', remark: 'challenge 有效期 30-900' },
  [CAPTCHA_KEYS.tokenTtlSeconds]: { name: '登录验证凭证有效期(秒)', defaultValue: '120', remark: 'captchaToken 有效期 30-600' },
  [CAPTCHA_KEYS.secondaryTypes]: { name: '二级验证类型', defaultValue: 'slider,rotate', remark: 'slider=滑块拼图,rotate=图像旋转' },
  [CAPTCHA_KEYS.maxAttempts]: { name: '单挑战最大尝试次数', defaultValue: '5', remark: '同一 challenge 超过该次数立即失效 1-20' },
  [CAPTCHA_KEYS.provider]: { name: '人机验证提供方', defaultValue: 'builtin', remark: '第一版仅内置实现 builtin' },
};

export interface CaptchaSettingValues {
  mode: 'off' | 'adaptive' | 'always';
  silentThreshold: number;
  forceAfterFailures: number;
  challengeTtlSeconds: number;
  tokenTtlSeconds: number;
  secondaryTypes: string[];
  maxAttempts: number;
  provider: string;
}

const DEFAULTS: CaptchaSettingValues = {
  mode: 'adaptive',
  silentThreshold: 70,
  forceAfterFailures: 3,
  challengeTtlSeconds: 180,
  tokenTtlSeconds: 120,
  secondaryTypes: ['slider', 'rotate'],
  maxAttempts: 5,
  provider: 'builtin',
};

function toBoolean(raw?: string | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

function toValues(rows: Map<string, ConfigRecord>): CaptchaSettingValues {
  const get = (key: string, fallback: string) => String(rows.get(key)?.configValue ?? fallback);
  const types = get(CAPTCHA_KEYS.secondaryTypes, DEFAULTS.secondaryTypes.join(','))
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t === 'slider' || t === 'rotate');
  return {
    mode: (['off', 'adaptive', 'always'].includes(get(CAPTCHA_KEYS.mode, DEFAULTS.mode))
      ? get(CAPTCHA_KEYS.mode, DEFAULTS.mode)
      : DEFAULTS.mode) as CaptchaSettingValues['mode'],
    silentThreshold: Number(get(CAPTCHA_KEYS.silentThreshold, '70')) || DEFAULTS.silentThreshold,
    forceAfterFailures: Number(get(CAPTCHA_KEYS.forceAfterFailures, '3')) || DEFAULTS.forceAfterFailures,
    challengeTtlSeconds: Number(get(CAPTCHA_KEYS.challengeTtlSeconds, '180')) || DEFAULTS.challengeTtlSeconds,
    tokenTtlSeconds: Number(get(CAPTCHA_KEYS.tokenTtlSeconds, '120')) || DEFAULTS.tokenTtlSeconds,
    secondaryTypes: types.length ? types : DEFAULTS.secondaryTypes,
    maxAttempts: Number(get(CAPTCHA_KEYS.maxAttempts, '5')) || DEFAULTS.maxAttempts,
    provider: get(CAPTCHA_KEYS.provider, DEFAULTS.provider),
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
        writeKey(CAPTCHA_KEYS.silentThreshold, String(values.silentThreshold)),
        writeKey(CAPTCHA_KEYS.forceAfterFailures, String(values.forceAfterFailures)),
        writeKey(CAPTCHA_KEYS.challengeTtlSeconds, String(values.challengeTtlSeconds)),
        writeKey(CAPTCHA_KEYS.tokenTtlSeconds, String(values.tokenTtlSeconds)),
        writeKey(CAPTCHA_KEYS.secondaryTypes, values.secondaryTypes.join(',')),
        writeKey(CAPTCHA_KEYS.maxAttempts, String(values.maxAttempts)),
        writeKey(CAPTCHA_KEYS.provider, values.provider),
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
      { label: '二级验证类型', value: values.secondaryTypes.join(' / ') },
      { label: '静默阈值', value: String(values.silentThreshold) },
      { label: '最大尝试次数', value: String(values.maxAttempts) },
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
                    <Form.Item
                      label="验证模式"
                      name="mode"
                      extra="off=关闭；adaptive=静默评分不足或命中风险时进入二级；always=始终二级"
                    >
                      <Select
                        options={[
                          { value: 'off', label: 'off（关闭）' },
                          { value: 'adaptive', label: 'adaptive（自适应）' },
                          { value: 'always', label: 'always（始终二级）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="静默验证通过阈值"
                      name="silentThreshold"
                      extra="静默行为评分达到该值即无感放行（0-100）"
                      rules={[{ required: true, message: '请输入阈值' }]}
                    >
                      <InputNumber min={0} max={100} step={5} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="连续失败强制二次验证次数"
                      name="forceAfterFailures"
                      extra="同一账号近期连续登录失败达到该次数后强制进入二级（1-100）"
                      rules={[{ required: true, message: '请输入次数' }]}
                    >
                      <InputNumber min={1} max={100} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="验证挑战有效期（秒）"
                      name="challengeTtlSeconds"
                      rules={[{ required: true, message: '请输入有效期' }]}
                    >
                      <InputNumber min={30} max={900} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="登录凭证有效期（秒）"
                      name="tokenTtlSeconds"
                      rules={[{ required: true, message: '请输入有效期' }]}
                    >
                      <InputNumber min={30} max={600} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      label="二级验证类型"
                      name="secondaryTypes"
                      extra="至少选择一种；两种都选时随机使用"
                      rules={[{ required: true, message: '请至少选择一种验证类型' }]}
                    >
                      <Checkbox.Group
                        options={[
                          { value: 'slider', label: '滑块拼图' },
                          { value: 'rotate', label: '图像旋转' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="单挑战最大尝试次数"
                      name="maxAttempts"
                      extra="同一 challenge 超过该次数立即失效（1-20）"
                      rules={[{ required: true, message: '请输入次数' }]}
                    >
                      <InputNumber min={1} max={20} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item label="提供方" name="provider" extra="第一版仅内置实现（builtin）">
                      <Select
                        style={{ width: 180 }}
                        options={[{ value: 'builtin', label: 'builtin（内置）' }]}
                      />
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
