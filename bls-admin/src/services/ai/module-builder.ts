import { request } from '@umijs/max';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chatCompletions(messages: ChatMessage[], stream = true) {
  return request('/api/ai/chat/completions', {
    method: 'POST',
    data: { messages, stream },
    // For stream, handle response manually in component
    ...(stream ? { responseType: 'stream' } : {}),
  });
}
