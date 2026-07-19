import { useState, useRef, useCallback } from 'react';
import { message } from 'antd';

interface StreamState {
  /** 是否正在连接/接收 */
  loading: boolean;
  /** 累积的完整内容 */
  content: string;
  /** 最新的 chunk */
  latestChunk: string;
  /** 错误信息 */
  error: string | null;
  /** 是否已完成 */
  done: boolean;
}

/**
 * AI 流式输出 Hook
 *
 * 通过 WebSocket 连接到 /ws/ai，实时接收 AI 生成内容
 *
 * @example
 * const { stream, start } = useAiStream();
 * start('crud', { tableName: '...', description: '...' });
 * // stream.content 实时更新
 */
export function useAiStream() {
  const [stream, setStream] = useState<StreamState>({
    loading: false,
    content: '',
    latestChunk: '',
    error: null,
    done: false,
  });

  const wsRef = useRef<WebSocket | null>(null);

  const start = useCallback(
    (type: 'crud' | 'sql' | 'audit' | 'config', params: Record<string, any>) => {
      // 关闭之前的连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setStream({ loading: true, content: '', latestChunk: '', error: null, done: false });

      // 获取 token
      const token = localStorage.getItem('token')?.replace(/^Bearer\s+/i, '') || '';

      // 直接连 AI 服务，不走前端代理（避免 ws 代理兼容问题）
      const aiHost = window.location.hostname + ':7201';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${aiHost}/ws/ai`;

      let fullContent = '';
      let ws: WebSocket;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // 发送认证 + 请求参数
          ws.send(JSON.stringify({ type, token, params }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case 'start':
                // 流式开始
                break;
              case 'chunk':
                fullContent += data.content;
                setStream((prev) => ({
                  ...prev,
                  content: fullContent,
                  latestChunk: data.content,
                }));
                break;
              case 'done':
                setStream((prev) => ({
                  ...prev,
                  loading: false,
                  done: true,
                  content: fullContent,
                }));
                break;
              case 'error':
                setStream((prev) => ({
                  ...prev,
                  loading: false,
                  error: data.message,
                  done: true,
                }));
                message.error(data.message);
                break;
            }
          } catch {
            // 忽略非 JSON 消息
          }
        };

        ws.onerror = () => {
          setStream((prev) => ({
            ...prev,
            loading: false,
            error: 'WebSocket 连接失败',
            done: true,
          }));
          message.error('连接 AI 服务失败');
        };

        ws.onclose = () => {
          wsRef.current = null;
          setStream((prev) => ({
            ...prev,
            loading: false,
            done: prev.done || true,
          }));
        };
      } catch (err: any) {
        setStream((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
          done: true,
        }));
        message.error('无法创建 WebSocket 连接');
      }
    },
    [],
  );

  const stop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStream((prev) => ({ ...prev, loading: false, done: true }));
  }, []);

  return { stream, start, stop };
}
