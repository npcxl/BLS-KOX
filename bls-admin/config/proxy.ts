/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
 * KOA 6001
 * Java 8080
 */
export default {
  dev: {
    '/api/': {
      // target: 'http://localhost:6001',
      target: 'http://localhost:8080',
      changeOrigin: true,
    },
    '/ws/': {
      //Koa target: 'ws://localhost:6001',
      target: 'ws://localhost:8080',
      ws: true,
      changeOrigin: true,
    },
  },
};
