import type { BubbleListProps } from '@ant-design/x';
import { Bubble, Conversations, Sender, Welcome, XProvider } from '@ant-design/x';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { RobotOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons';
import { Avatar, Button, Flex, message, Space, theme } from 'antd';
import { createStyles } from 'antd-style';
import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import {
  getAiConversations,
  getAiConversationMessages,
  createAiConversation,
  saveConversationMessages,
  type AiMessage,
} from '@/services/ai/conversation';

// ==================== i18n ====================
const t = {
  newConversation: '新对话',
  modelIsRunning: '模型运行中',
  modelExecutionCompleted: '模型执行完成',
  executionFailed: '执行失败',
  aborted: '已中止',
  requestFailed: '请求失败，请重试',
  welcome: '你好，我是 KOX-AI',
  welcomeDescription: 'BLS-KOX-AI 基于大模型的多租户 SaaS 开发辅助工具。',
  askOrInputUseSkills: '描述你的需求...',
  delete: '删除',
};

// ==================== Style ====================
import '@ant-design/x-markdown/themes/light.css';
import './code-theme.css';

const useStyle = createStyles(({ token, css }) => ({
  layout: css`position:relative;width:100%;height:80vh;background:${token.colorBgContainer};border-radius:12px;overflow:hidden;`,
  side: css`position:absolute;left:0;top:0;bottom:0;width:280px;display:flex;flex-direction:column;padding:0 12px;box-sizing:border-box;background:${token.colorBgLayout}80;`,
  logo: css`display:flex;align-items:center;justify-content:start;padding:0 24px;box-sizing:border-box;gap:8px;margin:24px 0;span{font-weight:bold;color:${token.colorText};font-size:16px;}`,
  conversations: css`overflow-y:auto;margin-top:12px;padding:0;flex:1;.ant-conversations-list{padding-inline-start:0;}`,
  chat: css`position:absolute;left:280px;right:0;top:0;bottom:0;display:flex;flex-direction:column;`,
  chatList: css`flex:1;overflow-y:auto;padding:16px 20px;`,
  chatInner: css`max-width:940px;margin:0 auto;`,
  placeholder: css`padding-top:100px;max-width:940px;margin:0 auto;`,
  senderWrapper: css`flex-shrink:0;padding:0 20px 16px;`,
}));

// ==================== 通用复制函数 (含 fallback) ====================
async function copyText(text?: string) {
  const value = text || '';
  if (!value.trim()) { message.warning('没有可复制的内容'); return; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    message.success('已复制');
  } catch { message.error('复制失败，请手动选择复制'); }
}

// ==================== 代码块 ====================
function extractCodeText(children: any): string {
  if (typeof children === 'string') return children.endsWith('\n') ? children.slice(0, -1) : children;
  if (Array.isArray(children)) return children.map(extractCodeText).join('');
  if (children?.props?.children) return extractCodeText(children.props.children);
  if (children?.value !== undefined) return String(children.value);
  return '';
}

const CodeBlock = memo(function CodeBlock({ language, children }: { language?: string; children: string }) {
  const code = typeof children === 'string' ? children : '';
  return (
    <div style={{ margin: '12px 0', maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', borderRadius: '8px 8px 0 0', padding: '4px 16px', border: '1px solid #e1e4e8', borderBottom: 'none' }}>
        <span style={{ fontSize: 12, color: '#888' }}>{language || 'code'}</span>
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(code)} />
      </div>
      <pre style={{ background: '#f6f8fa', margin: 0, padding: '16px 20px', borderRadius: '0 0 8px 8px', border: '1px solid #e1e4e8', borderTop: 'none', overflowX: 'auto', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
});

// ==================== Think/Role 配置 ====================
const ThinkComponent = memo((props: ComponentProps) => {
  const [done, setDone] = useState(false);
  useEffect(() => { if (props.streamStatus === 'done') setDone(true); }, [props.streamStatus]);
  return <div style={{ padding: '4px 0', fontSize: 13, color: '#8c8c8c' }}>{done ? '思考完成' : '思考中...'}</div>;
});

const getBubbleRole = (): BubbleListProps['role'] => ({
  ai: {
    placement: 'start',
    typing: false,
    avatar: <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />,
    contentRender: (content: string, { status }: any) => {
      if (!content) return null;
      // 流式中纯文本，完成后 XMarkdown
      if (status === 'updating' || status === 'loading') {
        return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{content}</div>;
      }
      return (
        <XMarkdown openLinksInNewTab config={{ breaks: true }}
          components={{
            think: ThinkComponent,
            pre: ({ children }: any) => {
              const codeEl = React.Children.only(children);
              const lang = (codeEl?.props?.className || '').replace('language-', '') || undefined;
              return <CodeBlock language={lang}>{extractCodeText(codeEl?.props?.children)}</CodeBlock>;
            },
          }}
        >
          {content || ''}
        </XMarkdown>
      );
    },
  },
  user: { placement: 'end', avatar: <Avatar icon={<UserOutlined />} style={{ background: '#52c41a' }} /> },
});

// ==================== 消息类型 (带 status 控制渲染) ====================
interface UiMsg { id: string; role: 'user' | 'assistant'; content: string; status?: 'updating' | 'done' | 'error'; }

// ============================================================
export default function AiWorkbench() {
  const { styles } = useStyle();
  const { token: tk } = theme.useToken();

  const [conversations, setConversations] = useState<Array<{ key: string; label: string; group: string }>>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const activeKeyRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingContentRef = useRef('');
  const rafRef = useRef<number>(0);

  // ---- 流式更新 (节流) ----
  const updateAssistantMsg = useCallback((id: string, content: string) => {
    pendingContentRef.current = content;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, content: pendingContentRef.current } : m
      ));
      rafRef.current = 0;
    });
  }, []);

  // ---- 初始化 ----
  useEffect(() => {
    (async () => {
      const list = await getAiConversations();
      const items = list.map(c => ({ key: String(c.id), label: c.title || '新对话', group: '历史' }));
      setConversations(items);
      if (items.length > 0) {
        const firstKey = String(items[0].key);
        activeKeyRef.current = firstKey;
        setActiveKey(firstKey);
        const history = await getAiConversationMessages(firstKey);
        setMessages(history.map(m => ({ ...m, status: 'done' })));
      }
    })();
  }, []);

  // ---- 点击会话 ----
  const handleActiveChange = useCallback(async (key: string) => {
    const nextKey = String(key);
    if (!nextKey || nextKey === activeKeyRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRequesting(false);
    activeKeyRef.current = nextKey;
    setActiveKey(nextKey);
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const history = await getAiConversationMessages(nextKey);
      if (activeKeyRef.current === nextKey) setMessages(history.map(m => ({ ...m, status: 'done' })));
    } finally {
      if (activeKeyRef.current === nextKey) setLoadingMsgs(false);
    }
  }, []);

  // ---- 新建对话 ----
  const handleNewConversation = useCallback(async () => {
    abortRef.current?.abort(); abortRef.current = null; setIsRequesting(false);
    const created = await createAiConversation('新对话');
    const key = String(created?.id || `c_${Date.now()}`);
    activeKeyRef.current = key;
    setConversations(prev => [{ key, label: '新对话', group: '今天' }, ...prev]);
    setActiveKey(key);
    setMessages([]);
  }, []);

  // ---- 发送消息 (手动 SSE) ----
  const sendMessage = useCallback(async (content: string) => {
    const val = content.trim();
    if (!val || isRequesting) return;
    setInputValue('');

    let convId = activeKeyRef.current;
    if (!convId) {
      const created = await createAiConversation(val.slice(0, 20));
      convId = String(created?.id || `c_${Date.now()}`);
      setConversations(prev => [{ key: convId!, label: val.slice(0, 20), group: '今天' }, ...prev]);
      activeKeyRef.current = convId;
      setActiveKey(convId);
    }

    const userMsg: UiMsg = { id: `u_${Date.now()}`, role: 'user', content: val, status: 'done' };
    const aiId = `a_${Date.now()}`;
    const aiMsg: UiMsg = { id: aiId, role: 'assistant', content: '', status: 'updating' };
    const currentMessages = [...messages, userMsg];
    setMessages([...currentMessages, aiMsg]);
    setIsRequesting(true);

    const ctrl = new AbortController(); abortRef.current = ctrl;
    let full = '';

    try {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' },
        body: JSON.stringify({
          messages: [...currentMessages.filter(m => m.role === 'user' || m.role === 'assistant'), { role: 'user', content: val }].map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`请求失败(${res.status})`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('浏览器不支持流式响应');
      const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (!d || d === '[DONE]') continue;
          try {
            const chunk = JSON.parse(d).choices?.[0]?.delta?.content;
            if (chunk) { full += chunk; updateAssistantMsg(aiId, full); }
          } catch {}
        }
      }
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: full, status: 'done' } : m));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: `[错误] ${err.message}`, status: 'error' } : m));
      }
    } finally {
      setIsRequesting(false);
      abortRef.current = null;
    }

    // 保存到数据库
    const title = val.slice(0, 30);
    setConversations(prev => prev.map(c => c.key === convId ? { ...c, label: c.label === '新对话' ? title : c.label } : c));
    saveConversationMessages(convId!, [
      { role: 'user', content: val }, { role: 'assistant', content: full },
    ], title).catch(() => {});
  }, [isRequesting, messages, updateAssistantMsg]);

  // ---- 自动滚底 (消息内容区自身滚动) ----
  useEffect(() => {
    if (!isRequesting) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, isRequesting]);

  // ---- Bubble items ----
  const bubbleItems = React.useMemo(() =>
    messages.map(msg => ({
      key: msg.id,
      role: (msg.role === 'assistant' ? 'ai' : 'user') as 'ai' | 'user',
      content: msg.content,
      status: msg.status === 'updating' ? 'updating' : msg.status === 'error' ? 'error' : 'success',
    })),
  [messages]);

  return (
    <XProvider>
      <div className={styles.layout}>
        {/* Left sidebar */}
        <div className={styles.side}>
          <div className={styles.logo}>
            <RobotOutlined style={{ fontSize: 24, color: tk.colorPrimary }} />
            <span>KOX-AI</span>
          </div>
          <Conversations
            creation={{ onClick: handleNewConversation }}
            items={conversations}
            className={styles.conversations}
            activeKey={activeKey}
            onActiveChange={handleActiveChange}
          />
        </div>

        {/* Center chat */}
        <div className={styles.chat}>
          <div ref={scrollRef} className={styles.chatList}>
            {loadingMsgs ? (
              <Flex justify="center" style={{ paddingTop: 100 }}><span style={{ color: '#999' }}>加载中...</span></Flex>
            ) : bubbleItems.length ? (
              <div className={styles.chatInner}>
                <Bubble.List items={bubbleItems} role={getBubbleRole()} autoScroll={false} />
              </div>
            ) : (
              <Flex vertical gap={16} align="center" className={styles.placeholder}>
                <Welcome variant="borderless" icon={<RobotOutlined style={{ fontSize: 48, color: tk.colorPrimary }} />} title={t.welcome} description={t.welcomeDescription} />
                <Space size={8}>
                  {['CRUD 模块', 'SQL 助手', '审计分析', '配置审查'].map(label => (<Button key={label} onClick={() => sendMessage(label)}>{label}</Button>))}
                </Space>
              </Flex>
            )}
          </div>
          <div className={styles.senderWrapper}>
            <Sender value={inputValue} onChange={setInputValue}
              onSubmit={() => sendMessage(inputValue)}
              onCancel={() => { abortRef.current?.abort(); setIsRequesting(false); }}
              loading={isRequesting} placeholder={t.askOrInputUseSkills}
            />
          </div>
        </div>
      </div>
    </XProvider>
  );
}
