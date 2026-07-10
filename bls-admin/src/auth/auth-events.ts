/**
 * 认证事件总线
 *
 * 提供 Token Refresh / Logout 事件，WebSocket 等组件可订阅。
 * 后续可扩展 BroadcastChannel 支持多标签页同步（P2）。
 */

type AuthEventHandler = (...args: any[]) => void;

const listeners = new Map<string, Set<AuthEventHandler>>();

export const authEvents = {
  on(event: 'token-refreshed' | 'logout', handler: AuthEventHandler): void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)?.add(handler);
  },

  off(event: 'token-refreshed' | 'logout', handler: AuthEventHandler): void {
    listeners.get(event)?.delete(handler);
  },

  emit(event: 'token-refreshed' | 'logout', ...args: any[]): void {
    listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch {
        // 事件处理异常不影响其他监听者
      }
    });
  },
};
