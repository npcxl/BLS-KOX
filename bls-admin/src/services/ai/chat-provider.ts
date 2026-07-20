import { OpenAIChatProvider, XRequest } from '@ant-design/x-sdk';
import { tokenStore } from '@/auth/token-store';

export function createKoxAiProvider() {
  return new OpenAIChatProvider({
    request: XRequest('/api/ai/chat/completions', {
      manual: true,
      params: {
        stream: true,
      },
      headers: {
        Authorization: tokenStore.getAccessToken() || '',
      },
    }),
  });
}
