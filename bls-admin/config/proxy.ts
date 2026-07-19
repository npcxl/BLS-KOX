/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
 *
 * 默认指向 Koa 后端 (6001)，AI 接口指向 AI 服务 (7201)。
 * 切换 Java 后端：将 /api/ 的 target 改为 http://localhost:8080
 */
export default {
  dev: {
    // AI 微服务（必须放在 /api/ 之前，否则被通用规则拦截）
    '/api/ai/': {
      target: 'http://localhost:7201',
      changeOrigin: true,
      timeout: 120000,
    },
    '/api/': {
      target: 'http://localhost:6001',
      changeOrigin: true,
    },
    '/ws/': {
      target: 'ws://localhost:6001',
      ws: true,
      changeOrigin: true,
    },
  },
};
