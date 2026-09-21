/**
 * ALTCHA 人机验证组件（官方 Web Component 的 React 包装）
 *
 * - **不修改 ALTCHA 核心验证代码**：PoW 求解、challenge 拉取、payload 生成全部由官方
 *   `<altcha-widget>` 完成；本组件只负责挂载、事件转发与 Ant Design 视觉适配。
 * - `display="invisible"`：`auto="onload"` 后台求解，用户无感；
 *   `display="visible"`：策略要求人工交互时展示官方可见组件（含官方内置的无障碍支持）。
 * - 中文文案来自官方 i18n（`altcha/i18n/zh-cn`）；颜色 / 尺寸通过官方 CSS 变量定制。
 */
import { Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import 'altcha';
import 'altcha/i18n/zh-cn';
import type { CaptchaDisplay } from '@/services/auth/captcha';

/** 官方自定义元素（React 19 会以 unknown prop 方式 setAttribute，Svelte 端可正确接收） */
const AltchaWidget: React.ComponentType<any> = 'altcha-widget' as any;

export interface AltchaCaptchaHandle {
  /** 重新拉取 challenge 并求解（失败 / 过期 / 需要可见交互时调用） */
  reset(): void;
}

export interface AltchaCaptchaProps {
  enabled: boolean;
  display: CaptchaDisplay;
  /** 官方 widget 的 challenge 地址（可带 username 查询参数） */
  challengeUrl: string;
  /** 隐藏域字段名 */
  fieldName: string;
  /** 供重新挂载以刷新 challenge 的 key（父组件自增即可） */
  instanceKey?: number | string;
  /** 已有 payload 时置为已验证状态，避免重复求解 */
  solved?: boolean;
  onVerified: (payload: string) => void;
  onStateChange?: (state: string) => void;
  onExpired?: () => void;
}

/** 与 Ant Design 主题对齐的 ALTCHA 样式变量（官方支持的定制方式） */
const ALTCHA_THEME_VARS: React.CSSProperties = {
  ['--altcha-max-width' as any]: '100%',
  ['--altcha-border-width' as any]: '1px',
  ['--altcha-border-radius' as any]: '8px',
  ['--altcha-color-base' as any]: '#ffffff',
  ['--altcha-color-base-content' as any]: 'rgba(0, 0, 0, 0.88)',
  ['--altcha-color-neutral' as any]: 'rgba(0, 0, 0, 0.06)',
  ['--altcha-color-neutral-content' as any]: 'rgba(0, 0, 0, 0.45)',
  ['--altcha-color-primary' as any]: '#1677ff',
  ['--altcha-color-primary-content' as any]: '#ffffff',
  ['--altcha-color-error' as any]: '#ff4d4f',
  ['--altcha-color-error-content' as any]: '#ffffff',
  ['--altcha-color-success' as any]: '#52c41a',
  ['--altcha-checkbox-border-color' as any]: '#d9d9d9',
  ['--altcha-checkbox-border-radius' as any]: '4px',
  ['--altcha-checkbox-outline' as any]: '2px solid rgba(22, 119, 255, 0.2)',
  ['--altcha-input-border-radius' as any]: '6px',
  ['--altcha-padding' as any]: '8px 12px',
  ['--altcha-transition-duration' as any]: '150ms',
};

const AltchaCaptcha: React.ForwardRefRenderFunction<AltchaCaptchaHandle, AltchaCaptchaProps> = (
  { enabled, display, challengeUrl, fieldName, instanceKey, solved, onVerified, onStateChange, onExpired },
  ref,
) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const verifiedRef = useRef(onVerified);
  verifiedRef.current = onVerified;
  const stateRef = useRef(onStateChange);
  stateRef.current = onStateChange;
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  /** 重新求解：清空状态并让官方 widget 再跑一次 PoW */
  const reset = useCallback(() => {
    const el: any = elementRef.current;
    if (!el) return;
    try {
      el.reset?.('unverified');
      el.verify?.();
    } catch {
      /* 官方 widget 尚未就绪时忽略 */
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    const el: any = elementRef.current;
    if (!el || !enabled) return undefined;

    const handleVerified = (ev: any) => {
      const payload = ev?.detail?.payload;
      if (typeof payload === 'string' && payload) verifiedRef.current(payload);
    };
    const handleState = (ev: any) => {
      const state = String(ev?.detail?.state ?? '');
      stateRef.current?.(state);
      if (state === 'expired') expiredRef.current?.();
    };

    el.addEventListener('verified', handleVerified);
    el.addEventListener('statechange', handleState);
    return () => {
      el.removeEventListener('verified', handleVerified);
      el.removeEventListener('statechange', handleState);
    };
  }, [enabled, instanceKey]);

  // 切换为可见组件后，主动触发一次求解，保证用户立刻看到官方交互控件
  useEffect(() => {
    if (!enabled || display !== 'visible' || solved) return undefined;
    const timer = setTimeout(() => reset(), 0);
    return () => clearTimeout(timer);
  }, [display, enabled, solved, reset]);

  if (!enabled) return null;

  return (
    <div data-testid="altcha-captcha" style={{ width: '100%', marginBottom: 16 }}>
      {display === 'visible' ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          为保障账号安全，请完成下方验证
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Spin size="small" /> 正在后台完成安全校验…
        </Typography.Text>
      )}
      <div style={{ opacity: display === 'visible' ? 1 : 0, height: display === 'visible' ? 'auto' : 0, overflow: 'hidden' }}>
        <AltchaWidget
          key={instanceKey}
          ref={elementRef}
          challenge={challengeUrl}
          auto="onload"
          display={display}
          language="zh-cn"
          name={fieldName}
          theme="default"
          hideFooter
          hideLogo
          workers={2}
          style={ALTCHA_THEME_VARS}
        />
      </div>
    </div>
  );
};

export default React.forwardRef(AltchaCaptcha);
