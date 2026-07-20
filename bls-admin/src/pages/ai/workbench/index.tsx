import { Bubble, Sender } from '@ant-design/x';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Flex, Typography, Avatar, theme } from 'antd';
import { useState, useRef, useCallback } from 'react';
import { tokenStore } from '@/auth/token-store';

const { Text } = Typography;

interface Message {
  key: string;
  role: 'user' | 'ai';
  content: string;
  status?: 'local' | 'loading' | 'success' | 'error';
}

const WELCOME: Message = {
  key: 'welcome',
  role: 'ai',
  content: '你好！我是 **KOX-AI**，BLS-KOX 的智能开发助手。\n\n我可以帮你：\n- 🏗️ **模块生成**：生成完整 CRUD 模块\n- 🔍 **SQL 助手**：自然语言转安全查询\n- 📊 **审计分析**：分析安全日志\n- ⚙️ **配置审查**：检查环境配置\n\n直接告诉我你需要什么吧！',
  status: 'success',
};

export default function AiWorkbench() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { token: t } = theme.useToken();

  const handleSend = useCallback((content: string) => {
    if (!content.trim() || loading) return;

    const userKey = `u-${Date.now()}`;
    const aiKey = `ai-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { key: userKey, role: 'user', content: content.trim(), status: 'local' },
      { key: aiKey, role: 'ai', content: '', status: 'loading' },
    ]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = '';

    fetch('/api/ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': tokenStore.getAccessToken() || '',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: content.trim() }],
        stream: true,
      }),
      signal: ctrl.signal,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`请求失败 (${res.status})`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response');
        const dec = new TextDecoder();
        let buf = '';
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
            try { const json = JSON.parse(d); if (json.content) { full += json.content; } } catch {}
          }
          setMessages(prev => prev.map(m => m.key === aiKey ? { ...m, content: full } : m));
        }
        setMessages(prev => prev.map(m => m.key === aiKey ? { ...m, status: 'success' } : m));
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setMessages(prev => prev.map(m => m.key === aiKey ? { ...m, content: `❌ ${err.message}`, status: 'error' } : m));
      })
      .finally(() => {
        setLoading(false);
        abortRef.current = null;
      });
  }, [loading]);

  return (
    <Flex vertical style={{ height: 'calc(100vh - 112px)', maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      <Flex align="center" gap={8} style={{ padding: '16px 0 12px', borderBottom: '1px solid #f0f0f0' }}>
        <RobotOutlined style={{ fontSize: 22, color: t.colorPrimary }} />
        <Text strong style={{ fontSize: 16 }}>KOX-AI</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>智能开发助手</Text>
      </Flex>

      <Bubble.List
        items={messages}
        autoScroll
        style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}
        role={{
          ai: {
            placement: 'start',
            avatar: <Avatar icon={<RobotOutlined />} style={{ background: t.colorPrimary }} />,
          },
          user: {
            placement: 'end',
            avatar: <Avatar icon={<UserOutlined />} style={{ background: t.colorSuccess }} />,
          },
        }}
      />

      <Sender
        onSubmit={handleSend}
        onCancel={() => abortRef.current?.abort()}
        loading={loading}
        placeholder="描述你的需求，例如：生成客户管理模块..."
        autoSize={{ minRows: 1, maxRows: 5 }}
        style={{ padding: '12px 0 16px' }}
      />
    </Flex>
  );
}
