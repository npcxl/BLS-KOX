import type { BubbleListProps, ThoughtChainItemProps } from '@ant-design/x';
import {
  Bubble, Conversations, Sender, ThoughtChain, Welcome, XProvider,
} from '@ant-design/x';
import type { TransformMessage } from '@ant-design/x-sdk';
import { AbstractChatProvider, AbstractXRequestClass, useXChat, useXConversations, XRequestOptions } from '@ant-design/x-sdk';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { RobotOutlined, UserOutlined, GlobalOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Avatar, Button, Flex, message, Space, theme, Tooltip } from 'antd';
import { createStyles } from 'antd-style';
import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import 'highlight.js/styles/github.css';

// ==================== i18n ====================
const t = {
  newConversation: '新对话',
  curConversation: '当前',
  rename: '重命名',
  delete: '删除',
  modelIsRunning: '模型运行中',
  modelExecutionCompleted: '模型执行完成',
  executionFailed: '执行失败',
  aborted: '已中止',
  requestAborted: '请求已取消',
  requestFailed: '请求失败，请重试',
  welcome: '你好，我是 KOX-AI',
  welcomeDescription: 'BLS-KOX-AI 基于大模型的多租户 SaaS 开发辅助工具。',
  deepThinking: '深度思考中',
  completeThinking: '思考完成',
  abortThinking: '思考已取消',
  errThinking: '思考出错',
  askOrInputUseSkills: '描述你的需求...',
  hotTopics: '热门话题',
  designGuide: '设计指南',
  whatCanIDo: '我能做什么？',
  generateModule: '生成 CRUD 模块',
  sqlHelper: 'SQL 助手',
  auditAnalysis: '审计分析',
  configReview: '配置审查',
};

// ==================== Style ====================
import '@ant-design/x-markdown/themes/light.css';
import './code-theme.css';

const useStyle = createStyles(({ token, css }) => ({
  layout: css`width:100%;height:calc(100vh - 112px);display:flex;background:${token.colorBgContainer};border-radius:12px;overflow:hidden;`,
  side: css`background:${token.colorBgLayout}80;width:280px;height:100%;display:flex;flex-direction:column;padding:0 12px;box-sizing:border-box;flex-shrink:0;`,
  logo: css`display:flex;align-items:center;justify-content:start;padding:0 24px;box-sizing:border-box;gap:8px;margin:24px 0;span{font-weight:bold;color:${token.colorText};font-size:16px;}`,
  conversations: css`overflow-y:auto;margin-top:12px;padding:0;flex:1;.ant-conversations-list{padding-inline-start:0;}`,
  chat: css`flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;height:100%;`,
  chatList: css`flex:1;overflow-y:auto;padding:16px 20px;min-height:0;`,
  placeholder: css`padding-top:64px;`,
  senderWrapper: css`flex-shrink:0;padding:0 20px 16px;`,
  sender: css`width:100%;max-width:940px;margin:0 auto 16px;`,
  senderPrompt: css`width:100%;max-width:840px;margin:0 auto;color:${token.colorText};`,
}));

// ==================== highlight.js 语言注册 ====================
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('md', markdown);

/** 从 react-markdown code children 中提取纯文本 */
function extractCodeText(children: any): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractCodeText).join('');
  // react-markdown sometimes wraps text in { type: 'text', value: 'xxx' } objects
  if (children?.props?.children) return extractCodeText(children.props.children);
  if (children?.value) return children.value;
  return String(children ?? '');
}

// ==================== 带复制按钮的代码块 ====================
function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  let html = '';
  if (language && hljs.getLanguage(language)) {
    html = hljs.highlight(children, { language }).value;
  } else {
    html = hljs.highlightAuto(children).value;
  }

  const doCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ position: 'relative', margin: '12px 0' }}>
      {/* 语言标签 + 复制按钮 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#f0f0f0', borderRadius: '8px 8px 0 0', padding: '4px 16px',
        border: '1px solid #e1e4e8', borderBottom: 'none',
      }}>
        <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
          {language || 'code'}
        </span>
        <Tooltip title={copied ? '已复制' : '复制代码'}>
          <Button type="text" size="small" icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
            onClick={doCopy} style={{ fontSize: 12 }} />
        </Tooltip>
      </div>
      <pre style={{
        background: '#f6f8fa', margin: 0, padding: '16px 20px',
        borderRadius: '0 0 8px 8px', border: '1px solid #e1e4e8', borderTop: 'none',
        overflowX: 'auto', fontSize: 13, lineHeight: 1.7,
      }}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

// ==================== Custom API Request ====================
interface KMsg { content: string; role: string }
interface KInput { messages?: Array<{ role: string; content: string }> }
type KOutput = string;

class KoxRequest extends AbstractXRequestClass<KInput, KOutput> {
  private _ctrl: AbortController | null = null;
  get manual() { return true; }
  get isRequesting() { return !!this._ctrl; }
  get isTimeout() { return false; }
  get isStreamTimeout() { return false; }
  get asyncHandler(): Promise<any> { return Promise.resolve(); }

  async run(params?: KInput): Promise<void> {
    const { callbacks } = this.options;
    callbacks?.onLoading?.();
    const ctrl = new AbortController(); this._ctrl = ctrl;
    const history = (params?.messages || []).filter(m => m.role === 'user' || m.role === 'assistant');
    try {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' },
        body: JSON.stringify({ messages: history, stream: true }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`请求失败(${res.status})`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response');
      const dec = new TextDecoder(); let buf = ''; const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try { const j = JSON.parse(d); const c = j.choices?.[0]?.delta?.content || ''; if (c) { chunks.push(c); callbacks?.onUpdate?.(chunks, new Headers()); } } catch {}
        }
      }
      callbacks?.onSuccess?.(chunks, new Headers());
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      callbacks?.onError?.(err);
    } finally { this._ctrl = null; }
  }
  abort(): void { this._ctrl?.abort(); }
}

class KoxProvider extends AbstractChatProvider<KMsg, KInput, KOutput> {
  transformParams(p: Partial<KInput>): KInput { return { ...p } as KInput; }
  transformLocalMessage(p: Partial<KInput>): KMsg {
    const m = p.messages?.[0];
    return { content: m?.content || '', role: m?.role || 'user' };
  }
  transformMessage(info: TransformMessage<KMsg, KOutput>): KMsg {
    const { originMessage, chunk } = info || {};
    const content = Array.isArray(chunk) ? chunk.join('') : (chunk !== undefined ? `${chunk}` : (originMessage?.content || ''));
    return { content, role: 'assistant' };
  }
}

const provCache = new Map<string, KoxProvider>();
const getProvider = (key: string) => {
  if (!provCache.has(key)) provCache.set(key, new KoxProvider({ request: new KoxRequest('/api/ai', { manual: false }) }));
  return provCache.get(key)!;
};

// ==================== Sub Components ====================
const ThinkComponent = memo((props: ComponentProps) => {
  const [title, setTitle] = useState(`${t.deepThinking}...`);
  const [loading, setLoading] = useState(true);
  React.useEffect(() => {
    if (props.streamStatus === 'done') { setTitle(t.completeThinking); setLoading(false); }
  }, [props.streamStatus]);
  return <div style={{ padding: '8px 0' }}><span style={{ color: '#8c8c8c', fontSize: 13 }}>{loading ? `${title}` : title}</span></div>;
});

const THOUGHT_CHAIN: Record<string, { title: string; status: string }> = {
  loading: { title: t.modelIsRunning, status: 'loading' },
  updating: { title: t.modelIsRunning, status: 'loading' },
  success: { title: t.modelExecutionCompleted, status: 'success' },
  error: { title: t.executionFailed, status: 'error' },
  abort: { title: t.aborted, status: 'abort' },
};

const role: BubbleListProps['role'] = {
  ai: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />,
    variant: 'filled',
    header: (_, { status }) => {
      const c = THOUGHT_CHAIN[status as string];
      return c ? (
        <ThoughtChain.Item style={{ marginBottom: 8 }} status={c.status as ThoughtChainItemProps['status']} variant="solid" icon={<GlobalOutlined />} title={c.title} />
      ) : null;
    },
    contentRender: (content: string, { status }) => (
      <XMarkdown
        streaming={{ hasNextChunk: status !== 'success' && status !== 'error' && status !== 'abort', enableAnimation: true }}
        openLinksInNewTab config={{ breaks: true }}
        components={{
          think: ThinkComponent,
          pre: ({ children }: any) => {
            // 从 <pre><code className="language-xxx">content</code></pre> 提取
            const codeEl = React.Children.only(children);
            const className: string = codeEl?.props?.className || '';
            const lang = className.replace('language-', '') || undefined;
            const text = extractCodeText(codeEl?.props?.children);
            return <CodeBlock language={lang}>{text}</CodeBlock>;
          },
        }}
      >
        {content || ''}
      </XMarkdown>
    ),
  },
  user: { placement: 'end', avatar: <Avatar icon={<UserOutlined />} style={{ background: '#52c41a' }} />, variant: 'shadow' },
};

const DEFAULT_CONV = [{ key: 'default', label: t.newConversation, group: '今天' }];

// ============================================================
// ChatPanel — 单个对话聊天区，用 key 重挂载加载历史消息
// ============================================================
function ChatPanel({ convKey, defaultMsgs }: { convKey: string; defaultMsgs: KMsg[] }) {
  const { onRequest, messages, isRequesting, abort } = useXChat<KMsg>({
    provider: getProvider(convKey),
    conversationKey: convKey,
    defaultMessages: defaultMsgs,
    requestPlaceholder: { role: 'assistant', content: '' },
    requestFallback: (_, { error }) => {
      if (error.name === 'AbortError') return { role: 'assistant', content: '' };
      return { role: 'assistant', content: `${t.requestFailed}: ${error.message}` };
    },
  });

  const [inputValue, setInputValue] = useState('');
  const [lastSavedIdx, setLastSavedIdx] = useState(-1);

  const onSubmit = (val: string) => {
    if (!val?.trim() || isRequesting) return;
    onRequest({ messages: [{ role: 'user', content: val.trim() }] });
    setInputValue('');
  };

  // Auto-save to DB when AI finishes responding
  useEffect(() => {
    if (messages.length < 2) return;
    const lastIdx = messages.length - 1;
    if (lastIdx <= lastSavedIdx) return;
    const lastMsg = messages[lastIdx];
    const prevMsg = messages[lastIdx - 1];
    if (lastMsg.status === 'success' && prevMsg.message?.role === 'user') {
      setLastSavedIdx(lastIdx);
      const userC = prevMsg.message.content || '';
      const aiC = lastMsg.message?.content || '';
      const token = localStorage.getItem('token') || '';
      fetch('/api/ai/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          id: convKey,
          title: userC.slice(0, 30),
          messages: [{ role: 'user', content: userC }, { role: 'assistant', content: aiC }],
        }),
      }).catch(() => {});
    }
  }, [messages]);

  const { token: tk } = theme.useToken();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {messages?.length ? (
          <Bubble.List autoScroll role={role}
            items={messages.map(i => ({
              key: i.id,
              role: (i.message?.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
              content: i.message?.content || '',
              status: i.status,
              loading: i.status === 'loading',
            }))}
          />
        ) : (
          <Flex vertical gap={16} align="center" className="ai-placeholder"
            style={{ paddingTop: 100 }}>
            <Welcome variant="borderless"
              icon={<RobotOutlined style={{ fontSize: 48, color: tk.colorPrimary }} />}
              title={t.welcome} description={t.welcomeDescription}
            />
          </Flex>
        )}
      </div>
      <div>
        <Sender value={inputValue} onChange={setInputValue}
          onSubmit={() => onSubmit(inputValue)} onCancel={abort}
          loading={isRequesting} placeholder={t.askOrInputUseSkills}
        />
      </div>
    </div>
  );
}

export default function AiWorkbench() {
  const { styles } = useStyle();
  const { token: tk } = theme.useToken();

  const {
    conversations, activeConversationKey, setActiveConversationKey, addConversation, setConversations,
  } = useXConversations({ defaultConversations: DEFAULT_CONV, defaultActiveConversationKey: 'default' });

  const [messageApi, contextHolder] = message.useMessage();
  // 当前对话的历史消息（从 DB 加载后缓存）
  const [chatInitMsgs, setChatInitMsgs] = useState<KMsg[]>([]);

  // Load conversations + first conversation's messages on mount
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('/api/ai/chat/conversations', { headers: { Authorization: token } })
      .then(res => res.json())
      .then(json => {
        const list: Array<{ id: string; title: string; updated_at: string }> = json.data || [];
        if (list.length > 0) {
          setConversations(list.map(c => ({ key: c.id, label: c.title || '新对话', group: '历史' })));
          const firstId = list[0].id;
          setActiveConversationKey(firstId);
          return fetch(`/api/ai/chat/conversations/${firstId}/messages`, { headers: { Authorization: token } });
        }
        return null;
      })
      .then(res => res?.json())
      .then(json => {
        const msgs: Array<{ role: string; content: string }> = json?.data || [];
        if (msgs.length > 0) {
          setChatInitMsgs(msgs.map((m, i) => ({
            id: `${i}`, message: { role: m.role as 'user' | 'assistant', content: m.content }, status: 'success' as const,
          })) as any);
        }
      })
      .catch(() => {});
  }, []);

  // 切换对话 → 从 API 加载历史
  const handleConversationChange = useCallback(async (newKey: string) => {
    if (!newKey || newKey === 'default') return;
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`/api/ai/chat/conversations/${newKey}/messages`, { headers: { Authorization: token } });
      const json = await res.json();
      const msgs: Array<{ role: string; content: string }> = json.data || [];
      setChatInitMsgs(msgs.map((m, i) => ({
        id: `${newKey}_${i}`, message: { role: m.role as 'user' | 'assistant', content: m.content }, status: 'success' as const,
      })) as any);
    } catch {
      setChatInitMsgs([]);
    }
    setActiveConversationKey(newKey);
  }, []);

  // 新建对话时同步到 DB
  const handleNewConversation = useCallback(() => {
    const key = `c_${Date.now()}`;
    addConversation({ key, label: '新对话' });
    setChatInitMsgs([]);
    setActiveConversationKey(key);
    fetch('/api/ai/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' },
      body: JSON.stringify({ id: key, title: '新对话', messages: [] }),
    }).catch(() => {});
  }, []);

  return (
    <XProvider>
      {contextHolder}
      <div className={styles.layout}>
        {/* Left sidebar */}
        <div className={styles.side}>
          <div className={styles.logo}>
            <RobotOutlined style={{ fontSize: 24, color: tk.colorPrimary }} />
            <span>KOX-AI</span>
          </div>
          <Conversations
            creation={{ onClick: handleNewConversation }}
            items={conversations.map(c => ({ key: c.key, label: c.label }))}
            className={styles.conversations}
            activeKey={activeConversationKey}
            onActiveChange={handleConversationChange}
          />
        </div>

        {/* Center chat — key 驱动重挂载加载历史消息 */}
        <div className={styles.chat}>
          <ChatPanel key={activeConversationKey} convKey={activeConversationKey} defaultMsgs={chatInitMsgs} />
        </div>
      </div>
    </XProvider>
  );
}
