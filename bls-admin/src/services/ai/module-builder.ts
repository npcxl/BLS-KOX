import { request } from '@umijs/max';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chatCompletions(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal; onChunk?: (chunk: string) => void },
): Promise<string> {
  const token = localStorage.getItem('token') || '';
  const res = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ messages, stream: true }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`请求失败 (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const dec = new TextDecoder();
  let buf = '';
  let full = '';

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
        if (json.content) {
          full += json.content;
          options?.onChunk?.(full);
        }
      } catch { /* skip */ }
    }
  }
  return full;
}
