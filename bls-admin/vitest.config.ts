/**
 * Vitest 配置（前端流程测试）
 *
 * 只跑 `src/**\/*.test.ts(x)`；环境用 jsdom，便于对 hook / 组件做真实渲染测试。
 * 说明：依赖 `vitest` / `jsdom` / `@testing-library/react` 均由 umi 生态带入 node_modules。
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@@': resolve(__dirname, 'src/.umi'),
    },
  },
  test: {
    // 前端以组件/hook 测试为主，默认 jsdom；纯 Node 场景可在文件头声明
    // `/** @vitest-environment node */`
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15_000,
    // @testing-library/react 依赖全局 afterEach 做自动 cleanup，
    // 否则同一文件内的多次 render 会互相污染（"Found multiple elements"）
    globals: true,
    // 注意：不要开 restoreMocks —— 既有测试在 vi.mock 工厂里一次性设置
    // mockImplementation，恢复后会失效（refresh-manager.test.ts 就依赖它）
  },
});
