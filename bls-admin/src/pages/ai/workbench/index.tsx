import { Conversations, Sender, Welcome, XProvider } from '@ant-design/x';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { RobotOutlined, CopyOutlined, DownOutlined } from '@ant-design/icons';
import { Button, Flex, message, Select, Space, Tag, theme } from 'antd';
import { createStyles } from 'antd-style';
import React, { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import 'highlight.js/styles/github.css';
import {
  getAiConversations,
  getAiConversationMessages,
  createAiConversation,
  saveConversationMessages,
  getAiModels,
} from '@/services/ai/conversation';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('jsx', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);

// ==================== i18n ====================
const t = {
  newConversation: '新对话',
  welcome: '你好，我是 KOX-AI',
  welcomeDescription: 'BLS-KOX-AI 基于大模型的多租户 SaaS 开发辅助工具。',
  askOrInputUseSkills: '描述你的需求...',
};

// ==================== Styles ====================
import '@ant-design/x-markdown/themes/light.css';
import './code-theme.css';

const useStyle = createStyles(({ token, css }) => ({
  workbench: css`
    display: flex;
    width: 100%;
    height: calc(100vh - 120px);
    background: ${token.colorBgContainer};
    border-radius: 12px;
    overflow: hidden;
  `,
  sidebar: css`
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: 0 12px;
    box-sizing: border-box;
    background: ${token.colorBgLayout}80;
  `,
  logo: css`
    padding: 0 24px;
    margin: 24px 0;
  `,
  logoText: css`
    font-weight: 800;
    font-size: 32px;
    background: linear-gradient(90deg, #1677ff, #52c41a, #faad14, #f5222d, #1677ff);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: logoShimmer 3s linear infinite;
    @keyframes logoShimmer {
      0% { background-position: 0% 50%; }
      100% { background-position: 300% 50%; }
    }
  `,
  conversations: css`
    overflow-y: auto;
    margin-top: 12px;
    padding: 0;
    flex: 1;
    .ant-conversations-list { padding-inline-start: 0; }
  `,
  chatMain: css`
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `,
  messageScroller: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 24px;
  `,
  messageList: css`
    max-width: 900px;
    margin: 0 auto;
  `,
  inputDock: css`
    flex-shrink: 0;
    padding: 12px 20px 16px;
    background: linear-gradient(180deg, rgba(255,255,255,0.82), #fff 32%);
  `,
  chatInputBox: css`
    max-width: 880px;
    margin: 0 auto;
    border: 1px solid #d6dde6;
    border-radius: 28px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    padding: 8px 8px 8px 16px;
    transition: border-color 0.2s, box-shadow 0.2s;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    &:focus-within {
      border-color: #1677ff;
      box-shadow: 0 8px 28px rgba(22, 119, 255, 0.18);
    }
  `,
  inputMain: css`
    flex: 1;
    min-width: 0;
  `,
  inputToolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 4px;
    gap: 8px;
  `,
  modelSelect: css`
    color: #6b7280;
    font-size: 12px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.15s;
    &:hover { background: #f3f4f6; }
  `,
  placeholder: css`
    padding-top: 100px;
    max-width: 900px;
    margin: 0 auto;
  `,
  msgRow: css`
    margin-bottom: 28px;
    &:last-child { margin-bottom: 0; }
  `,
  msgUser: css`
    text-align: right;
  `,
  msgAi: css`
    text-align: left;
  `,
  msgText: css`
    font-size: 15px;
    line-height: 1.8;
    color: #1f2937;
    word-break: break-word;
  `,
  msgBubbleUser: css`
    display: inline-block;
    max-width: 75%;
    padding: 10px 16px;
    border-radius: 18px;
    border-bottom-right-radius: 6px;
    background: ${token.colorPrimary};
    color: #fff;
    font-size: 15px;
    line-height: 1.75;
    word-break: break-word;
    white-space: pre-wrap;
  `,
}));

// ==================== 复制 ====================
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

function normalizeLanguage(language?: string) {
  const lang = (language || '').toLowerCase();
  if (lang === 'typescript' || lang === 'tsx') return 'typescript';
  if (lang === 'javascript' || lang === 'jsx') return 'javascript';
  if (lang === 'shell' || lang === 'sh') return 'bash';
  return lang;
}

const CodeBlock = memo(function CodeBlock({ language, children }: { language?: string; children: string }) {
  const code = typeof children === 'string' ? children : '';
  const lang = normalizeLanguage(language);
  const highlighted = useMemo(() => {
    if (!code) return '';
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [code, lang]);

  return (
    <div className="ai-code-block" style={{ margin: '12px 0', maxWidth: '100%' }}>
      <div className="ai-code-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', borderRadius: '8px 8px 0 0', padding: '4px 16px', border: '1px solid #e1e4e8', borderBottom: 'none' }}>
        <span style={{ fontSize: 12, color: '#888' }}>{language || 'code'}</span>
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(code)} />
      </div>
      <pre className="hljs ai-code-pre" style={{ background: '#f6f8fa', margin: 0, padding: '16px 20px', borderRadius: '0 0 8px 8px', border: '1px solid #e1e4e8', borderTop: 'none', overflowX: 'auto', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        <code className={lang ? `language-${lang}` : undefined} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
});

// ==================== 段落级流式渲染 ====================
const StreamBlock = memo(function StreamBlock({ text, isLast }: { text: string; isLast: boolean }) {
  return (
    <div className={`ai-stream-block ${isLast ? '' : 'ai-stream-block-done'}`}>
      {text}
      {isLast && <span className="ai-stream-cursor" />}
    </div>
  );
});

/** 按双换行切割成段落，最后一段为未完成段落 */
function splitParagraphs(content: string): { done: string[]; current: string } {
  if (!content) return { done: [], current: '' };
  const parts = content.split(/\n\n/);
  if (parts.length === 1) return { done: [], current: parts[0] };
  const done = parts.slice(0, -1);
  const current = parts[parts.length - 1];
  return { done, current };
}

const StreamingParagraphs = memo(function StreamingParagraphs({ content }: { content: string }) {
  const { done, current } = useMemo(() => splitParagraphs(content), [content]);
  return (
    <div className="ai-streaming-text">
      {done.map((para, i) => (
        <div key={i} className="ai-stream-block ai-stream-block-done">
          {para}
        </div>
      ))}
      {current && <StreamBlock text={current} isLast />}
    </div>
  );
});

const ThinkComponent = memo((props: ComponentProps) => {
  const [done, setDone] = useState(false);
  useEffect(() => { if (props.streamStatus === 'done') setDone(true); }, [props.streamStatus]);
  return <div style={{ padding: '4px 0', fontSize: 13, color: '#8c8c8c' }}>{done ? '思考完成' : '思考中...'}</div>;
});

// ==================== 消息内容渲染 ====================
function MessageContent({ content, status }: { content: string; status?: 'updating' | 'done' | 'error' }) {
  if (status === 'updating') {
    return <StreamingParagraphs content={content} />;
  }
  if (status === 'error') {
    return <div className="ai-message-error">{content}</div>;
  }
  if (!content) return null;
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
      {content}
    </XMarkdown>
  );
}

// ==================== 消息类型 ====================
interface UiMsg { id: string; role: 'user' | 'assistant'; content: string; status?: 'updating' | 'done' | 'error'; }

// ==================== 单条消息 ====================
const ChatMessage = memo(function ChatMessage({ msg }: { msg: UiMsg }) {
  const { styles } = useStyle();
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgUser : styles.msgAi}`}>
      {isUser ? (
        <div className={styles.msgBubbleUser}>{msg.content}</div>
      ) : (
        <div className={styles.msgText}>
          <MessageContent content={msg.content} status={msg.status} />
        </div>
      )}
    </div>
  );
});

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
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; value: string; modelType: string; provider: string }>>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const activeKeyRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectedModelRef = useRef('');

  // ---- 自动滚底 ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: isRequesting ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, isRequesting]);

  // ---- 初始化 ----
  useEffect(() => {
    (async () => {
      const [list, modelsRes] = await Promise.all([
        getAiConversations(),
        getAiModels().catch(() => ({ provider: '', currentModel: '', models: [] })),
      ]);
      const items = list.map(c => ({ key: String(c.id), label: c.title || '新对话', group: '历史' }));
      setConversations(items);

      if (modelsRes.models.length > 0) {
        setModelOptions(modelsRes.models);
        const initialModel = modelsRes.currentModel || modelsRes.models[0]?.value || '';
        setSelectedModel(initialModel);
        selectedModelRef.current = initialModel;
      }

      if (items.length > 0) {
        const firstKey = String(items[0].key);
        activeKeyRef.current = firstKey;
        setActiveKey(firstKey);
        const history = await getAiConversationMessages(firstKey);
        setMessages(history.map(m => ({ ...m, status: 'done' as const })));
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
      if (activeKeyRef.current === nextKey) setMessages(history.map(m => ({ ...m, status: 'done' as const })));
    } finally {
      if (activeKeyRef.current === nextKey) setLoadingMsgs(false);
    }
  }, []);

  // ---- 切换模型 ----
  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    selectedModelRef.current = value;
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

  // ---- 发送消息 (SSE 流式) ----
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
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setIsRequesting(true);

    const ctrl = new AbortController(); abortRef.current = ctrl;
    let full = '';

    try {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' },
        body: JSON.stringify({
          messages: [
            ...messages.filter(m => m.role === 'user' || m.role === 'assistant'),
            { role: 'user', content: val },
          ].map(m => ({ role: m.role, content: m.content })),
          model: selectedModelRef.current || undefined,
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`请求失败(${res.status})`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('浏览器不支持流式响应');

      const dec = new TextDecoder();
      let buf = ''; 
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
            const parsed = JSON.parse(d);
            // 检查是否有错误
            if (parsed.error) {
              throw new Error(parsed.error.message || 'AI 服务异常');
            }
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              full += chunk;
              setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: full, status: 'updating' } : m));
            }
          } catch (e: any) {
            // JSON parse error — might be partial chunk, ignore
            if (e.message && !e.message.includes('JSON')) {
              throw e; // re-throw real errors
            }
          }
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
    const currentConversation = conversations.find(c => c.key === convId);
    const shouldUpdateTitle = currentConversation?.label === '新对话';
    const title = shouldUpdateTitle ? val.slice(0, 30) : undefined;
    setConversations(prev => prev.map(c => c.key === convId ? { ...c, label: shouldUpdateTitle ? title! : c.label } : c));
    saveConversationMessages(convId!, [
      { role: 'user', content: val }, { role: 'assistant', content: full },
    ], title).catch(() => {});
  }, [isRequesting, messages]);

  return (
    <XProvider>
      <div className={styles.workbench}>
        {/* 左侧会话列表 */}
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoText}>KOX-AI</span>
          </div>
          <Conversations
            creation={{ onClick: handleNewConversation }}
            items={conversations}
            className={styles.conversations}
            activeKey={activeKey}
            onActiveChange={handleActiveChange}
          />
        </aside>

        {/* 右侧聊天区 */}
        <main className={styles.chatMain}>
          <div ref={scrollRef} className={styles.messageScroller}>
            {loadingMsgs ? (
              <Flex justify="center" style={{ paddingTop: 100 }}>
                <span style={{ color: '#999' }}>加载中...</span>
              </Flex>
            ) : messages.length ? (
              <div className={styles.messageList}>
                {messages.map(msg => (
                  <ChatMessage key={msg.id} msg={msg} />
                ))}
              </div>
            ) : (
              <Flex vertical gap={16} align="center" className={styles.placeholder}>
                <Welcome variant="borderless" icon={<RobotOutlined style={{ fontSize: 48, color: tk.colorPrimary }} />} title={t.welcome} description={t.welcomeDescription} />
                <Space size={8}>
                  {['CRUD 模块', 'SQL 助手', '审计分析', '配置审查'].map(label => (
                    <Button key={label} onClick={() => sendMessage(label)}>{label}</Button>
                  ))}
                </Space>
              </Flex>
            )}
          </div>
          <div className={styles.inputDock}>
            <div className={`${styles.chatInputBox} ai-chat-input-box`}>
              <div className={styles.inputMain}>
                <Sender
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={() => sendMessage(inputValue)}
                  onCancel={() => { abortRef.current?.abort(); setIsRequesting(false); }}
                  loading={isRequesting}
                  placeholder={t.askOrInputUseSkills}
                  style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}
                />
                <div className={styles.inputToolbar}>
                  {selectedModel && modelOptions.length > 0 && (
                    <Select
                      size="small"
                      variant="borderless"
                      value={selectedModel}
                      loading={modelLoading}
                      onChange={handleModelChange}
                      suffixIcon={<DownOutlined />}
                      style={{ minWidth: 180, color: '#6b7280', fontSize: 12 }}
                      popupMatchSelectWidth={false}
                      optionLabelProp="label"
                    >
                      {modelOptions.map(opt => (
                        <Select.Option key={opt.value} value={opt.value} label={opt.label}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag
                              color={opt.modelType === 'local' ? 'green' : 'blue'}
                              style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}
                            >
                              {opt.modelType === 'local' ? '本地' : 'API'}
                            </Tag>
                            <span>{opt.label}</span>
                          </span>
                        </Select.Option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </XProvider>
  );
}
