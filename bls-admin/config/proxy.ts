/**
 * @name 代理配置
 * @doc https://umijs.org/docs/guides/proxy
 *
 * 默认指向 Koa 后端 (6001)，AI 接口指向 AI 服务 (7201)。
 * 切换 Java 后端：将 /api/ 的 target 改为 http://localhost:8080
 * 切换 Rust 后端：将 /api/ 的 target 改为 http://localhost:6002
 */
export default {
  dev: {
    // AI 对话管理 → Koa 后端 (bls-server)
    '/api/ai/chat/conversations': {
      target: 'http://localhost:6001',
      changeOrigin: true,
    },
    // AI 流式接口 → AI 微服务 (7201)
    '/api/ai/': {
      target: 'http://localhost:7201',
      changeOrigin: true,
      proxyTimeout: 300000,
    },
    '/api/': {
      target: 'http://localhost:6001',
      changeOrigin: true,
      /**
       * 显式超时。不配的话，dev proxy 在拿不到上游响应时会把 ECONNREFUSED/超时统一
       * 表现成 **504 Gateway Timeout**，而真正的原因往往是：
       *   - Koa 正在 `tsx watch` 重启（改了 bls-server 下任意文件就会重启，窗口内请求必失败）；
       *   - Koa 侧某个接口自身很慢（例如冷启动时的公网 IP 解析）。
       * 配成 60s 后行为可预期；排障时先直连 `http://127.0.0.1:6001/...` 确认 Koa 是否正常。
       */
      proxyTimeout: 60000,
    },
    '/ws/': {
      target: 'ws://localhost:6001',
      ws: true,
      changeOrigin: true,
    },
  },
};
