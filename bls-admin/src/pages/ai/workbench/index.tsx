import { PageContainer } from '@ant-design/pro-components';
import { Card, Row, Col, Typography, Space, Button, Statistic } from 'antd';
import {
  RobotOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  AuditOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { history } from '@umijs/max';

const { Title, Paragraph, Text } = Typography;

const tools = [
  {
    key: 'crud',
    title: 'CRUD 生成器',
    desc: '根据自然语言描述，自动生成建表 SQL、CRUD 配置、菜单建议和权限码',
    icon: <CodeOutlined style={{ fontSize: 36, color: '#1677ff' }} />,
    path: '/ai/crud',
    color: '#e6f4ff',
  },
  {
    key: 'sql',
    title: 'SQL 助手',
    desc: '自然语言转只读 SQL，内置安全防护，自动注入租户隔离条件',
    icon: <ConsoleSqlOutlined style={{ fontSize: 36, color: '#52c41a' }} />,
    path: '/ai/sql',
    color: '#f6ffed',
  },
  {
    key: 'audit',
    title: '审计分析',
    desc: '分析登录失败、接口访问、限流等安全日志，输出风险等级与建议',
    icon: <AuditOutlined style={{ fontSize: 36, color: '#faad14' }} />,
    path: '/ai/audit',
    color: '#fffbe6',
  },
  {
    key: 'config',
    title: '配置审查',
    desc: '检查 .env、docker-compose 等配置文件，发现弱密码、默认密钥等问题',
    icon: <SafetyOutlined style={{ fontSize: 36, color: '#ff4d4f' }} />,
    path: '/ai/config-review',
    color: '#fff2f0',
  },
];

export default function AiWorkbench() {
  return (
    <PageContainer
      header={{
        title: (
          <Space>
            <RobotOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <span>AI 工作台</span>
          </Space>
        ),
        subTitle: '基于大模型的 AI 开发辅助工具集',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* 工具卡片 */}
        <Row gutter={[16, 16]}>
          {tools.map((tool) => (
            <Col xs={24} sm={12} key={tool.key}>
              <Card
                hoverable
                style={{ height: '100%', borderTop: `3px solid ${tool.icon.props.style.color}` }}
                styles={{ body: { padding: 24 } }}
                onClick={() => history.push(tool.path)}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 12,
                      background: tool.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {tool.icon}
                    </div>
                    <Button type="link" icon={<ArrowRightOutlined />}>
                      开始使用
                    </Button>
                  </div>
                  <div>
                    <Title level={5} style={{ marginBottom: 4 }}>{tool.title}</Title>
                    <Paragraph type="secondary" style={{ marginBottom: 0, minHeight: 44 }}>
                      {tool.desc}
                    </Paragraph>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {/* 使用提示 */}
        <Card
          title={<Space><ThunderboltOutlined style={{ color: '#1677ff' }} /><span>使用说明</span></Space>}
          style={{ marginTop: 24 }}
        >
          <Row gutter={[24, 12]}>
            <Col xs={24} md={8}>
              <Text strong>1. 认证方式</Text>
              <Paragraph type="secondary" style={{ marginTop: 4, fontSize: 13 }}>
                所有 AI 接口自动携带当前登录用户的 JWT Token 和租户信息，无需额外配置。
              </Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Text strong>2. 安全防护</Text>
              <Paragraph type="secondary" style={{ marginTop: 4, fontSize: 13 }}>
                SQL 助手仅生成只读 SELECT 语句，自动拦截写操作。所有请求经过限流和审计记录。
              </Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Text strong>3. 仅生成建议</Text>
              <Paragraph type="secondary" style={{ marginTop: 4, fontSize: 13 }}>
                AI 服务不直接连接数据库，所有输出仅为分析建议，需人工审核后执行。
              </Paragraph>
            </Col>
          </Row>
        </Card>
      </div>
    </PageContainer>
  );
}
