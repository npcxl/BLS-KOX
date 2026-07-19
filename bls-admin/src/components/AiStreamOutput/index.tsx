import { useEffect, useRef } from 'react';
import { Tag, Space, Typography } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  content: string;
  loading: boolean;
  done: boolean;
  onDone?: (content: string) => void;
}

export default function AiStreamOutput({ content, loading, done, onDone }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && (loading || content)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, loading]);

  // 完成后自动触发解析
  useEffect(() => {
    if (done && content && onDone) {
      onDone(content);
    }
  }, [done]);

  if (!loading && !content) return null;

  return (
    <div
      style={{
        background: '#fff',
        border: loading ? '1px solid #1677ff' : '1px solid #e8e8e8',
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 0.3s',
        boxShadow: loading ? '0 0 0 2px rgba(22,119,255,0.1)' : 'none',
      }}
    >
      {/* 头部状态 */}
      <div
        style={{
          padding: '10px 16px',
          background: loading
            ? 'linear-gradient(135deg, #e6f4ff, #bae0ff)'
            : done
            ? 'linear-gradient(135deg, #f6ffed, #d9f7be)'
            : '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={8}>
          <ThunderboltOutlined style={{ color: loading ? '#1677ff' : '#52c41a', fontSize: 16 }} />
          <Text strong style={{ color: loading ? '#1677ff' : '#389e0d' }}>
            {loading ? 'AI 正在思考...' : '生成完毕'}
          </Text>
        </Space>
        <Space size={8}>
          {loading && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: '#1677ff',
                    animation: `dotPulse 0.6s ease-in-out ${delay}s infinite`,
                  }}
                />
              ))}
            </span>
          )}
          {done && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
        </Space>
      </div>

      {/* 内容区 */}
      <div
        ref={scrollRef}
        style={{
          padding: '16px 20px',
          maxHeight: 400,
          overflow: 'auto',
          fontSize: 14,
          lineHeight: 1.8,
          fontFamily: "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#262626',
        }}
      >
        {content || (
          <span style={{ color: '#bfbfbf', fontStyle: 'italic' }}>等待模型响应...</span>
        )}
        {loading && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 18,
              background: '#1677ff',
              marginLeft: 1,
              verticalAlign: 'text-bottom',
              animation: 'cursorBlink 0.8s step-end infinite',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes cursorBlink { 50% { opacity: 0; } }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
