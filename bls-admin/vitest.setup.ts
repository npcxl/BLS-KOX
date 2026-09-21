/**
 * Vitest 全局初始化
 *
 * - 注册 @testing-library/jest-dom 断言（toBeInTheDocument / toBeDisabled …）
 * - 每个测试后自动清理 DOM（@testing-library/react 会在 globals 可用时自动 cleanup，
 *   这里再显式兜底一次，避免多个测试文件混跑时残留）
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
