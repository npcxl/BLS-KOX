/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
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
