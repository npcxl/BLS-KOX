import { useEffect, useRef } from 'react';
import { Avatar, Space, Typography } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  content: string;
  loading: boolean;
  done: boolean;
  userPrompt?: string;
  onDone?: (content: string) => void;
}

export default function AiStreamOutput({ content, loading, done, userPrompt, onDone }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && (loading || content)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, loading]);

  useEffect(() => {
    if (done && content && onDone) onDone(content);
  }, [done]);

  if (!loading && !content) return null;

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 450,
        overflow: 'auto',
        padding: '12px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* 用户消息 */}
      {userPrompt && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <div style={{ maxWidth: '80%' }}>
            <div style={{
              background: 'linear-gradient(135deg, #1677ff, #4096ff)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '16px 16px 4px 16px',
              fontSize: 14,
              lineHeight: 1.6,
              wordBreak: 'break-word',
            }}>
              {userPrompt}
            </div>
          </div>
          <Avatar size={32} icon={<UserOutlined />} style={{ background: '#1677ff', flexShrink: 0 }} />
        </div>
      )}

      {/* AI 回复 */}
      {(content || loading) && (
        <div style={{ display: 'flex', gap: 10 }}>
          <Avatar
            size={32}
            icon={<RobotOutlined />}
            style={{
              background: done ? '#52c41a' : '#722ed1',
              flexShrink: 0,
              animation: loading ? 'aiPulse 2s ease-in-out infinite' : 'none',
            }}
          />
          <div style={{ maxWidth: '85%', minWidth: 200 }}>
            <div style={{
              background: loading ? '#f9f0ff' : '#f6ffed',
              border: loading ? '1px solid #d3adf7' : '1px solid #b7eb8f',
              borderRadius: '4px 16px 16px 16px',
              padding: '12px 16px',
              fontSize: 14,
              lineHeight: 1.8,
              fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#262626',
              minHeight: 40,
              position: 'relative',
            }}>
              {content || (
                <span style={{ color: '#bfbfbf', fontStyle: 'italic' }}>...</span>
              )}
              {loading && (
                <span style={{
                  display: 'inline-block', width: 2, height: 18, background: '#722ed1',
                  marginLeft: 1, verticalAlign: 'text-bottom',
                  animation: 'cursorBlink 0.8s step-end infinite',
                }} />
              )}
            </div>
            {/* 小字提示 */}
            <div style={{ marginTop: 4, paddingLeft: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {loading ? 'AI 正在生成...' : 'DeepSeek · 生成完毕'}
              </Text>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes cursorBlink { 50% { opacity: 0; } }
        @keyframes aiPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(114,46,209,0.4); } 50% { box-shadow: 0 0 0 6px rgba(114,46,209,0); } }
      `}</style>
    </div>
  );
}
