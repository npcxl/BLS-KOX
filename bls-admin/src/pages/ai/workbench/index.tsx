import { Bubble, Sender, XProvider } from '@ant-design/x';
import { useXChat } from '@ant-design/x-sdk';
import XMarkdown from '@ant-design/x-markdown';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Flex, Typography, theme } from 'antd';
import { useMemo, useState } from 'react';
import { createKoxAiProvider } from '@/services/ai/chat-provider';

const { Text } = Typography;

export default function AiWorkbench() {
  const [input, setInput] = useState('');
  const { token: t } = theme.useToken();

  const provider = useMemo(() => createKoxAiProvider(), []);

  const { onRequest, parsedMessages, isRequesting, abort } = useXChat({
    provider,
    requestPlaceholder: {
      role: 'assistant',
      content: '',
    },
  });

  const handleSubmit = (content: string) => {
    const value = content.trim();
    if (!value) return;
    setInput('');
    onRequest({ messages: [{ role: 'user', content: value }] } as any);
  };

  return (
    <XProvider>
      <Flex vertical style={{ height: 'calc(100vh - 112px)', maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
        <Flex align="center" gap={8} style={{ padding: '16px 0 12px', borderBottom: '1px solid #f0f0f0' }}>
          <RobotOutlined style={{ fontSize: 22, color: t.colorPrimary }} />
          <Text strong style={{ fontSize: 16 }}>KOX-AI</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>智能开发助手</Text>
        </Flex>

        <Bubble.List
          autoScroll
          style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}
          items={parsedMessages.map((msg: any) => {
            const role = msg.message?.role === 'user' ? 'user' : 'ai';
            return {
              key: msg.id,
              role,
              content: msg.message?.content || '',
              loading: msg.status === 'loading',
            };
          })}
          role={{
            ai: {
              placement: 'start',
              avatar: <Avatar icon={<RobotOutlined />} style={{ background: t.colorPrimary }} />,
              contentRender: (content: string) => <XMarkdown>{content}</XMarkdown>,
            },
            user: {
              placement: 'end',
              avatar: <Avatar icon={<UserOutlined />} style={{ background: t.colorSuccess }} />,
            },
          }}
        />

        <Sender
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onCancel={abort}
          loading={isRequesting}
          placeholder="描述你的需求，例如：生成客户管理模块..."
          autoSize={{ minRows: 1, maxRows: 5 }}
          style={{ padding: '12px 0 16px' }}
        />
      </Flex>
    </XProvider>
  );
}
