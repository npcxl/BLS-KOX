/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
 *
 * 默认指向 Koa 后端 (6001)。
 * 切换 Java 后端：将 target 改为 http://localhost:8080
 */
export default {
  dev: {
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
