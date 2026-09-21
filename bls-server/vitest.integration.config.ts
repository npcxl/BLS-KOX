import { defineConfig } from 'vitest/config';

/**
 * 集成测试专用配置（阶段七）
 *
 * 与单元测试严格分离：
 *   - 单元测试（vitest.config.ts）只跑 src/**，**不连接**真实 MySQL / Redis
 *   - 集成测试只跑 tests/integration/**，要求真实的 MySQL + Redis
 *
 * 运行：`INTEGRATION_TEST=true npm run test:integration`
 * 未显式开启时全部跳过（describe.skip），因此在无数据库的机器上也不会失败。
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 集成测试共享一个数据库，串行执行避免相互干扰
    fileParallelism: false,
    sequence: { concurrent: false },
    environment: 'node',
  },
});
