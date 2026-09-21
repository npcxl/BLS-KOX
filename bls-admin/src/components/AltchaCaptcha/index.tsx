/**
 * 第一层人机验证组件 —— ALTCHA 官方 Web Component 的 React 包装
 *
 * **只用于第一层（静默 Proof-of-Work）**：
 *   - `display="invisible"`：`auto="onload"` 后台求解，用户无感；
 *   - `display="standard"`：官方可见组件（仍需用户点击才求解），但它**不是第二层**，
 *     不能被当作图形人机验证使用 —— 第二层由 `TianaiCaptcha` 负责。
 *
 * 本组件不修改 ALTCHA 核心验证代码：challenge 拉取、PoW 求解、payload 生成全部由官方
 * `<altcha-widget>` 完成；这里只做挂载、事件转发与 Ant Design 视觉适配。
 */
import { Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import 'altcha';
import 'altcha/i18n/zh-cn';

/** ALTCHA 官方只支持这两种展示形态（不存在 "visible" 这个取值） */
export type AltchaDisplay = 'invisible' | 'standard';

/** 官方自定义元素（React 19 会以 unknown prop 方式 setAttribute，Svelte 端可正确接收） */
const AltchaWidget: React.ComponentType<any> = 'altcha-widget' as any;

export interface AltchaCaptchaHandle {
  /** 重新拉取 challenge 并求解（失败 / 过期时调用） */
  reset(): void;
}

export interface AltchaCaptchaProps {
  enabled: boolean;
  display: AltchaDisplay;
  /**
   * 挑战数据来源，两种都支持（官方 widget 原生行为）：
   *   - 以 `{` 开头的 **JSON 字符串** → 直接解析（本项目用这个：Koa `/api/captcha/generate` 是 POST，
   *     不是可 GET 的地址，所以由前端取回后内联给它）；
   *   - 其它字符串 → 当作 URL 去 GET 拉取。
   */
  challenge: string;
  /** 隐藏域字段名 */
  fieldName: string;
  /** 供重新挂载以刷新 challenge 的 key（父组件自增即可） */
  instanceKey?: number | string;
  /** 是否已拿到服务端凭证（true 时不显示加载提示） */
  solved?: boolean;
  onVerified: (payload: string) => void;
  onStateChange?: (state: string) => void;
  onExpired?: () => void;
  /** 组件报错（含非安全上下文：ALTCHA 需要 WebCrypto，HTTP 下不可用） */
  onError?: () => void;
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
  { enabled, display, challenge, fieldName, instanceKey, solved, onVerified, onStateChange, onExpired, onError },
  ref,
) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const verifiedRef = useRef(onVerified);
  verifiedRef.current = onVerified;
  const stateRef = useRef(onStateChange);
  stateRef.current = onStateChange;
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;
  const errorRef = useRef(onError);
  errorRef.current = onError;

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
    if (!el || !enabled || !challenge) return undefined;

    // ALTCHA 的 PoW 依赖 WebCrypto：非安全上下文（HTTP 且非 localhost）下官方代码会直接抛错，
    // 这里提前上报，避免界面一直停在"正在后台完成安全校验…"。
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      errorRef.current?.();
      return undefined;
    }

    const handleVerified = (ev: any) => {
      const payload = ev?.detail?.payload;
      if (typeof payload === 'string' && payload) verifiedRef.current(payload);
    };
    const handleState = (ev: any) => {
      const state = String(ev?.detail?.state ?? '');
      stateRef.current?.(state);
      if (state === 'expired') expiredRef.current?.();
      if (state === 'error') errorRef.current?.();
    };

    el.addEventListener('verified', handleVerified);
    el.addEventListener('statechange', handleState);
    return () => {
      el.removeEventListener('verified', handleVerified);
      el.removeEventListener('statechange', handleState);
    };
  }, [enabled, instanceKey, challenge]);

  // 可见（standard）形态下主动触发一次求解，保证用户立刻看到官方交互控件
  useEffect(() => {
    if (!enabled || display !== 'standard' || solved) return undefined;
    const timer = setTimeout(() => reset(), 0);
    return () => clearTimeout(timer);
  }, [display, enabled, solved, reset]);

  if (!enabled) return null;

  return (
    <div data-testid="altcha-captcha" style={{ width: '100%', marginBottom: 16 }}>
      {display === 'standard' ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          请完成下方安全校验
        </Typography.Text>
      ) : solved ? null : (
        // 静默求解中；拿到凭证后不再展示任何提示（对用户完全无感）
        <Typography.Text type="secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Spin size="small" /> 正在后台完成安全校验…
        </Typography.Text>
      )}
      <div style={{ opacity: display === 'standard' ? 1 : 0, height: display === 'standard' ? 'auto' : 0, overflow: 'hidden' }}>
        <AltchaWidget
          key={instanceKey}
          ref={elementRef}
          challenge={challenge}
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
