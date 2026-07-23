import { request } from '@umijs/max';

export interface AiConversation {
  id: string;
  title: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AiMessage {
  id: string;
  conversation_id?: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  createdAt?: string;
}

export async function getAiConversations() {
  const res = await request<{ code: number; data: AiConversation[] }>(
    '/api/ai/chat/conversations',
  );
  return res.data || [];
}

export async function getAiConversationMessages(conversationId: string) {
  const res = await request<{ code: number; data: AiMessage[] }>(
    `/api/ai/chat/conversations/${conversationId}/messages`,
  );
  return res.data || [];
}

export async function createAiConversation(title: string, id?: string) {
  const res = await request<{ code: number; data: AiConversation }>(
    '/api/ai/chat/conversations',
    { method: 'POST', data: { title, id } },
  );
  return res.data;
}

export async function saveConversationMessages(
  conversationId: string,
  msgs: Array<{ role: string; content: string }>,
  title?: string,
) {
  const res = await request<{ code: number; data: AiConversation }>(
    '/api/ai/chat/conversations',
    { method: 'POST', data: { id: conversationId, title, messages: msgs } },
  );
  return res.data;
}

export async function deleteAiConversation(conversationId: string) {
  return request(`/api/ai/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

export async function renameAiConversation(conversationId: string, title: string) {
  const res = await request<{ code: number; data: { id: string; title: string } }>(
    `/api/ai/chat/conversations/${conversationId}`,
    { method: 'PUT', data: { title } },
  );
  return res.data;
}

export interface AiModelsResult {
  provider: string;
  currentModel: string;
  models: Array<{ label: string; value: string }>;
}

export async function getAiModels(): Promise<AiModelsResult> {
  const res = await request<{ code: number; data: AiModelsResult }>('/api/ai/models');
  return res.data || { provider: '', currentModel: '', models: [] };
}
