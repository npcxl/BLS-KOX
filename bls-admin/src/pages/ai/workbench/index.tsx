import type { BubbleListProps, ThoughtChainItemProps } from '@ant-design/x';
import {
  Bubble, Conversations, Sender, ThoughtChain, Welcome, XProvider,
} from '@ant-design/x';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { RobotOutlined, UserOutlined, GlobalOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Avatar, Button, Flex, message, Space, theme, Tooltip } from 'antd';
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
  layout: css`display:flex;flex:1;min-height:0;overflow:hidden;width:100%;height:calc(100vh - 112px);background:${token.colorBgContainer};border-radius:12px;`,
  side: css`background:${token.colorBgLayout}80;width:280px;height:100%;display:flex;flex-direction:column;padding:0 12px;box-sizing:border-box;flex-shrink:0;`,
  logo: css`display:flex;align-items:center;justify-content:start;padding:0 24px;box-sizing:border-box;gap:8px;margin:24px 0;span{font-weight:bold;color:${token.colorText};font-size:16px;}`,
  conversations: css`overflow-y:auto;margin-top:12px;padding:0;flex:1;.ant-conversations-list{padding-inline-start:0;}`,
  chat: css`flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;`,
  chatList: css`flex:1;min-height:0;overflow:hidden;display:flex;justify-content:center;`,
  placeholder: css`padding-top:100px;`,
  senderWrapper: css`flex-shrink:0;padding:0 20px 16px;`,
}));

// ==================== 代码块提取 + 复制 ====================
function extractCodeText(children: any): string {
  if (typeof children === 'string') return children.endsWith('\n') ? children.slice(0, -1) : children;
  if (Array.isArray(children)) return children.map(extractCodeText).join('');
  if (children?.props?.children) return extractCodeText(children.props.children);
  if (children?.value !== undefined) return String(children.value);
  return '';
}

const CodeBlock = memo(function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const code = typeof children === 'string' ? children : '';
  const doCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [code]);
  return (
    <div style={{ margin: '12px 0', maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', borderRadius: '8px 8px 0 0', padding: '4px 16px', border: '1px solid #e1e4e8', borderBottom: 'none' }}>
        <span style={{ fontSize: 12, color: '#888' }}>{language || 'code'}</span>
        <Tooltip title={copied ? '已复制' : '复制'}>
          <Button type="text" size="small" icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />} onClick={doCopy} />
        </Tooltip>
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

const getBubbleRole = (streaming: boolean): BubbleListProps['role'] => ({
  ai: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />,
    variant: 'filled',
    header: (_, { status }) => {
      const c = ({ loading: { title: t.modelIsRunning, status: 'loading' }, success: { title: t.modelExecutionCompleted, status: 'success' }, error: { title: t.executionFailed, status: 'error' } } as any)[status === 'loading' || status === 'updating' ? 'loading' : status as string];
      return c ? <ThoughtChain.Item style={{ marginBottom: 8 }} status={c.status as any} variant="solid" icon={<GlobalOutlined />} title={c.title} /> : null;
    },
    contentRender: (content: string, { status }: any) => {
      // 卡顿优化: 流式输出中纯文本渲染，完成后转 XMarkdown
      if (streaming || status === 'updating' || status === 'loading') {
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
  user: { placement: 'end', avatar: <Avatar icon={<UserOutlined />} style={{ background: '#52c41a' }} />, variant: 'shadow' },
});

// ============================================================
export default function AiWorkbench() {
  const { styles } = useStyle();
  const { token: tk } = theme.useToken();

  // ---- 业务状态（不依赖 useXChat parsedMessages） ----
  const [conversations, setConversations] = useState<Array<{ key: string; label: string; group: string }>>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [messages, setMessages] = useState<AiMessage[]>([]);          // ← 唯一消息源
  const [inputValue, setInputValue] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const activeKeyRef = useRef('');
  const ctrlRef = useRef<AbortController | null>(null);

  // ---- 初始化: 加载会话列表 + 第一条会话的历史消息 ----
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
        setMessages(history);
      }
    })();
  }, []);

  // ---- 点击会话: abort 当前 + 加载新消息 ----
  const handleActiveChange = useCallback(async (key: string) => {
    const nextKey = String(key);
    if (!nextKey || nextKey === activeKeyRef.current) return;
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setIsRequesting(false);
    activeKeyRef.current = nextKey;
    setActiveKey(nextKey);
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const history = await getAiConversationMessages(nextKey);
      if (activeKeyRef.current === nextKey) setMessages(history);
    } finally {
      if (activeKeyRef.current === nextKey) setLoadingMsgs(false);
    }
  }, []);

  // ---- 新建对话 ----
  const handleNewConversation = useCallback(async () => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setIsRequesting(false);
    const created = await createAiConversation('新对话');
    const key = String(created?.id || `c_${Date.now()}`);
    activeKeyRef.current = key;
    setConversations(prev => [{ key, label: '新对话', group: '今天' }, ...prev]);
    setActiveKey(key);
    setMessages([]);
  }, []);

  // ---- 发送消息 ----
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

    // 1) 添加用户消息
    const userMsg: AiMessage = { id: `u_${Date.now()}`, role: 'user', content: val };
    setMessages(prev => [...prev, userMsg]);

    // 2) 添加空的 assistant 占位
    const aiId = `a_${Date.now()}`;
    const aiMsg: AiMessage = { id: aiId, role: 'assistant', content: '' };
    setMessages(prev => [...prev, aiMsg]);

    setIsRequesting(true);

    // 3) SSE 流式请求
    const ctrl = new AbortController(); ctrlRef.current = ctrl;
    let full = '';
    let raf: number | undefined;

    try {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: val }].filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })), stream: true }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`请求失败(${res.status})`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无响应');
      const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d);
            const chunk = j.choices?.[0]?.delta?.content || '';
            if (chunk) {
              full += chunk;
              // requestAnimationFrame 节流合并更新
              if (!raf) {
                raf = requestAnimationFrame(() => {
                  setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: full } : m));
                  raf = undefined;
                });
              }
            }
          } catch {}
        }
      }
      // 确保最后一次更新
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: full } : m));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: `[错误] ${err.message}` } : m));
      }
    } finally {
      setIsRequesting(false);
      ctrlRef.current = null;
    }

    // 4) 保存到数据库
    const title = val.slice(0, 30);
    setConversations(prev => prev.map(c => c.key === convId ? { ...c, label: c.label === '新对话' ? title : c.label } : c));
    saveConversationMessages(convId!, [
      { role: 'user', content: val },
      { role: 'assistant', content: full },
    ], title).catch(() => {});
  }, [isRequesting, messages]);

  // ---- 自动滚底 (手动兜底) ----
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isRequesting) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, isRequesting]);

  // ---- Bubble items ----
  const bubbleItems = React.useMemo(() =>
    messages.map(msg => ({
      key: msg.id,
      role: (msg.role === 'assistant' ? 'ai' : 'user') as 'ai' | 'user',
      content: msg.content,
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
              <Flex justify="center" style={{ paddingTop: 100, width: '100%' }}><span style={{ color: '#999' }}>加载中...</span></Flex>
            ) : bubbleItems.length ? (
              <Bubble.List
                items={bubbleItems}
                role={getBubbleRole(isRequesting)}
                autoScroll={false}
                styles={{
                  root: {
                    width: '100%',
                    maxWidth: 940,
                    height: '100%',
                    overflowY: 'auto',
                    padding: '16px 20px',
                  },
                }}
              />
            ) : (
              <Flex vertical gap={16} align="center" className={styles.placeholder}>
                <Welcome variant="borderless"
                  icon={<RobotOutlined style={{ fontSize: 48, color: tk.colorPrimary }} />}
                  title={t.welcome} description={t.welcomeDescription}
                />
                <Space size={8}>
                  {['CRUD 模块', 'SQL 助手', '审计分析', '配置审查'].map(label => (
                    <Button key={label} onClick={() => sendMessage(label)}>{label}</Button>
                  ))}
                </Space>
              </Flex>
            )}
          </div>
          <div className={styles.senderWrapper}>
            <Sender value={inputValue} onChange={setInputValue}
              onSubmit={() => sendMessage(inputValue)}
              onCancel={() => { ctrlRef.current?.abort(); setIsRequesting(false); }}
              loading={isRequesting} placeholder={t.askOrInputUseSkills}
            />
          </div>
        </div>
      </div>
    </XProvider>
  );
}
