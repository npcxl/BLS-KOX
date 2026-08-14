/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
 *
 * Default backend: bls-rust-server (6002). 
 * AI streaming target: AI service (7201).
 * To use 
 * Koa: point /api/ target back to http://localhost:6001; 
 * Java: http://localhost:8080
 */
export default {
  dev: {
    // AI 相关接口（对话管理 / 模型列表 / 流式对话）统一走 Rust 后端
    // Rust 后端已内置 AI Provider 抽象层，直接对接 OpenAI 兼容接口
    '/api/ai/': {
      target: 'http://localhost:6002',
      changeOrigin: true,
      proxyTimeout: 300000,
    },
    '/api/': {
      target: 'http://localhost:6002',
      changeOrigin: true,
    },
    '/ws/': {
      target: 'ws://localhost:6002',
      ws: true,
      changeOrigin: true,
    },
  },
};
