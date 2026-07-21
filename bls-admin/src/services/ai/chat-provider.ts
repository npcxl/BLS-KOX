import { tokenStore } from '@/auth/token-store';

export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at?: string;
}

const BASE = '/api/ai/chat';

function authHeaders(): Record<string, string> {
  const token = tokenStore.getAccessToken() || '';
  return { 'Content-Type': 'application/json', Authorization: token };
}

/** 流式聊天 */
export function chatStream(
  messages: Array<{ role: string; content: string }>,
  opts: { signal?: AbortSignal; onChunk: (full: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages, stream: true }),
      signal: opts.signal,
    }).then(async res => {
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response');
      const dec = new TextDecoder();
      let buf = '', full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const json = JSON.parse(d);
            const c = json.choices?.[0]?.delta?.content || json.content || '';
            if (c) { full += c; opts.onChunk(full); }
          } catch { /* skip */ }
        }
      }
      resolve(full);
    }).catch(reject);
  });
}

/** 获取对话列表 */
export async function getConversations(): Promise<Conversation[]> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${BASE}/conversations`, { headers: authHeaders(), signal: ctrl.signal });
    clearTimeout(timeout);
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

/** 获取对话消息 */
export async function getConversationMessages(id: string): Promise<ConversationMessage[]> {
  const res = await fetch(`${BASE}/conversations/${id}/messages`, { headers: authHeaders() });
  const json = await res.json();
  return json.data || [];
}

/** 保存对话 */
export async function saveConversation(data: {
  id?: string;
  title?: string;
  messages?: Array<{ role: string; content: string }>;
}): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data || { id: '' };
}

/** 删除对话 */
export async function deleteConversation(id: string): Promise<void> {
  await fetch(`${BASE}/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
