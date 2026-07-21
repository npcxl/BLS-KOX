export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function getAuthorization() {
  const token = localStorage.getItem('token') || '';
  if (!token) return '';
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

export async function chatCompletions(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal; onChunk?: (content: string) => void },
): Promise<string> {
  const res = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthorization(),
    },
    body: JSON.stringify({ messages, stream: true }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`请求失败 (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);

        if (json.error?.message) {
          throw new Error(json.error.message);
        }

        const delta = json.choices?.[0]?.delta?.content || '';
        if (!delta) continue;

        fullContent += delta;
        options?.onChunk?.(fullContent);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }

  return fullContent;
}
