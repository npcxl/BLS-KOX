import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10_000,
    include: ['src/**/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
