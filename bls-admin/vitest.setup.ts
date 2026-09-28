/**
 * Vitest 全局初始化
 *
 * - 注册 @testing-library/jest-dom 断言（toBeInTheDocument / toBeDisabled …）
 * - 每个测试后自动清理 DOM（@testing-library/react 会在 globals 可用时自动 cleanup，
 *   这里再显式兜底一次，避免多个测试文件混跑时残留）
 * - 兜底 `window.matchMedia`：jsdom **不实现**它，而 antd 与 framer-motion 都会读取
 *   （登录页动态背景 `AnimatedSaaSBackground` 的 `useReducedMotion` 就依赖它）。
 *   这里让 `prefers-reduced-motion` 恒为 `reduce` ⇒ 测试里不跑无限动画，
 *   既快又不会让 jsdom 一直忙在 requestAnimationFrame 上。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      // 只让「减少动效」为真，其它（断点等）保持 false，避免影响 antd 的响应式判断
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
