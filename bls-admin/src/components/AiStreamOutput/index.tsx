import { Typography, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

interface Props {
  content: string;
  loading: boolean;
  done: boolean;
  language?: string;
}

export default function AiStreamOutput({ content, loading, done, language = 'json' }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading && (
          <Tag icon={<LoadingOutlined spin />} color="processing">
            AI 正在生成...
          </Tag>
        )}
        {done && !loading && content && (
          <Tag icon={<CheckCircleOutlined />} color="success">
            生成完成
          </Tag>
        )}
      </div>
      <div
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
          minHeight: 120,
          maxHeight: 500,
          overflow: 'auto',
          fontFamily: "'Fira Code', 'Consolas', monospace",
          fontSize: 13,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          position: 'relative',
        }}
      >
        {content || (
          <span style={{ color: '#666' }}>
            {loading ? '...' : '// AI 生成的代码将在这里实时显示'}
          </span>
        )}
        {loading && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 16,
              background: '#d4d4d4',
              marginLeft: 1,
              animation: 'blink 1s step-end infinite',
              verticalAlign: 'text-bottom',
            }}
          />
        )}
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
