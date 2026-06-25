import { PageContainer, ProCard, ProFormDateRangePicker, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { App, Button, Card, Col, Form, Row, Space, Switch, Upload } from 'antd';
import type { ReactNode } from 'react';
import type { UploadProps } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';

const toggleItems = [
  '倒计时',
  '轮播图',
  '会刊区',
  '广告轮播',
  '会议日程',
  '新闻资讯',
  '特邀嘉宾',
  '下载中心',
  '合作伙伴',
];

const defaultHighlights = [
  { value: '40000+', label: '展览面积', sort: 1 },
  { value: '300+', label: '参展企业', sort: 2 },
  { value: '50+', label: '专题会议', sort: 3 },
  { value: '10,000+', label: '专业观众', sort: 4 },
];

const defaultPartner = [
  { name: '中国气象局', link: '#' },
  { name: '中国气象服务协会', link: '#' },
  { name: '腾讯', link: '#' },
];

const uploadProps: UploadProps = {
  listType: 'picture-card',
  maxCount: 1,
  beforeUpload: () => false,
  showUploadList: false,
};

function ImageUploadBox({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs text-gray-500">
        {title}
        {hint ? <span className="ml-2">{hint}</span> : null}
      </div>
      <Upload {...uploadProps}>
        <div style={{ display: 'flex', height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.45)' }}>
            <UploadOutlined style={{ marginBottom: 4, fontSize: 18 }} />
            <div>点击上传</div>
          </div>
        </div>
      </Upload>
    </div>
  );
}

export default function HomePageConfiguration() {
  const { message } = App.useApp();

  return (
    <PageContainer
      header={{ title: '首页配置', breadcrumb: {} }}
      extra={[
        <Button key="save" type="primary" onClick={() => message.success('已保存页面配置（当前为静态页面）')}>
          保存配置
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <ProCard title="首页模块开关" bordered bodyStyle={{ padding: 24 }}>
          <Row gutter={[24, 16]}>
            {toggleItems.map((item) => (
              <Col key={item} xs={24} sm={12} md={8} lg={6} xl={4}>
                <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700">{item}</span>
                  <Switch defaultChecked />
                </div>
              </Col>
            ))}
          </Row>
        </ProCard>

        <ProCard title="倒计时区" bordered bodyStyle={{ padding: 24 }}>
          <Form layout="vertical" initialValues={{
            exhibitionName: '第二届气象经济博览会',
            venue: '北京国家会议中心',
            expoTime: ['2026-10-22', '2026-10-24'],
            countdownTime: '10/22/2026 09:00 AM',
          }}>
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <ProFormText label="展会名称" name="exhibitionName" placeholder="请输入展会名称" />
              </Col>
              <Col xs={24} md={12}>
                <ProFormDateRangePicker label="展会日期" name="expoTime" />
              </Col>
              <Col xs={24} md={12}>
                <ProFormText label="举办地点" name="venue" placeholder="请输入举办地点" />
              </Col>
              <Col xs={24} md={12}>
                <ProFormText label="倒计时目标时间" name="countdownTime" placeholder="请选择目标时间" />
              </Col>
            </Row>
          </Form>
        </ProCard>

        <ProCard title="轮播图" bordered bodyStyle={{ padding: 24 }} extra={<Button type="link">+ 添加轮播图</Button>}>
          <Space direction="vertical" size={16} className="w-full">
            {[1].map((item) => (
              <Card key={item} className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <Row gutter={16} align="middle">
                  <Col xs={24} lg={8}>
                    <ImageUploadBox title="图片 宽度 1280 x 高度 580 px" />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="标题" name={`carouselTitle-${item}`} initialValue="第二届气象经济博览会" />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="链接" name={`carouselLink-${item}`} initialValue="#" />
                  </Col>
                </Row>
                <div className="mt-2 flex justify-end">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </div>
              </Card>
            ))}
          </Space>
        </ProCard>

        <ProCard title="展会概况" bordered bodyStyle={{ padding: 24 }} extra={<Button type="link">+ 添加统计项</Button>}>
          <Space direction="vertical" size={16} className="w-full">
            {defaultHighlights.map((item, index) => (
              <Card key={item.sort} className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <ProFormText label="数值" name={`highlightValue-${index}`} initialValue={item.value} />
                  </Col>
                  <Col xs={24} md={8}>
                    <ProFormText label="标签" name={`highlightLabel-${index}`} initialValue={item.label} />
                  </Col>
                  <Col xs={24} md={8}>
                    <ProFormText label="排序" name={`highlightSort-${index}`} initialValue={String(item.sort)} />
                  </Col>
                </Row>
                <div className="mt-2 flex justify-end">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </div>
              </Card>
            ))}
          </Space>
        </ProCard>

        <ProCard title="金融区" bordered bodyStyle={{ padding: 24 }} extra={<Button type="link">+ 添加金融区入口</Button>}>
          <Space direction="vertical" size={16} className="w-full">
            {[
              { name: '嘉宾注册', link: '/register' },
              { name: '展商注册', link: '/exhibitor-register' },
            ].map((item, index) => (
              <Card key={item.name} className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <Row gutter={16} align="middle">
                  <Col xs={24} md={8}>
                    <ProFormText label="名称" name={`financeName-${index}`} initialValue={item.name} />
                  </Col>
                  <Col xs={24} md={8}>
                    <ProFormText label="链接" name={`financeLink-${index}`} initialValue={item.link} />
                  </Col>
                  <Col xs={24} md={8}>
                    <ImageUploadBox title="图标" hint="建议 200 x 100 px" />
                  </Col>
                </Row>
                <div className="mt-2 flex justify-end">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </div>
              </Card>
            ))}
          </Space>
        </ProCard>

        <ProCard title="底部信息" bordered bodyStyle={{ padding: 24 }}>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <ProFormText label="展会名称" name="footerExhibitionName" initialValue="第二届气象经济博览会" />
            </Col>
            <Col xs={24} md={12}>
              <ProFormText label="展会日期与地点" name="footerDateVenue" initialValue="2026年10月22日 — 24日 北京国家会议中心" />
            </Col>
            <Col xs={24} md={12}>
              <ProFormText label="主办单位" name="footerOrganizer" initialValue="中国气象服务协会" />
            </Col>
            <Col xs={24} md={12}>
              <ProFormText label="联系电话" name="footerPhone" initialValue="010-12345678" />
            </Col>
            <Col xs={24} md={12}>
              <ProFormText label="联系邮箱" name="footerEmail" initialValue="contact@cmsa.org" />
            </Col>
            <Col xs={24} md={12}>
              <ProFormText label="版权信息" name="footerCopyright" initialValue="© 2026 中国气象服务协会 版权所有" />
            </Col>
          </Row>
        </ProCard>

        <ProCard title="SEO 与基础信息" bordered bodyStyle={{ padding: 24 }}>
          <Row gutter={24}>
            <Col xs={24}>
              <ProFormText label="页面标题" name="seoTitle" initialValue="第二届气象经济博览会 - 万象" />
            </Col>
            <Col xs={24}>
              <ProFormTextArea label="页面关键词" name="seoKeywords" initialValue="气象经济，博览会，气象科技，气候投融资" />
            </Col>
            <Col xs={24}>
              <ProFormTextArea
                label="页面描述"
                name="seoDescription"
                initialValue="第二届气象经济博览会将于 2026 年 10 月 22 日至 24 日举办，汇聚气象行业政企单位与专家。"
              />
            </Col>
          </Row>
        </ProCard>

        <ProCard title="广告图" bordered bodyStyle={{ padding: 24 }} extra={<Button type="link">+ 添加广告图</Button>}>
          <Space direction="vertical" size={16} className="w-full">
            {[1, 2].map((item) => (
              <Card key={item} className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <Row gutter={16} align="middle">
                  <Col xs={24} lg={8}>
                    <ImageUploadBox title="广告图 宽度 1920 x 高度 300 px" />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="Alt 文本" name={`adAlt-${item}`} initialValue={`广告位 ${item}`} />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="跳转链接" name={`adLink-${item}`} initialValue="#" />
                  </Col>
                </Row>
                <div className="mt-2 flex justify-end">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </div>
              </Card>
            ))}
          </Space>
        </ProCard>

        <ProCard title="合作伙伴" bordered bodyStyle={{ padding: 24 }} extra={<Button type="link">+ 添加合作伙伴</Button>}>
          <Space direction="vertical" size={16} className="w-full">
            {defaultPartner.map((item, index) => (
              <Card key={item.name} className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <Row gutter={16} align="middle">
                  <Col xs={24} lg={8}>
                    <ImageUploadBox title="Logo 宽度 200 x 高度 100 px" />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="名称" name={`partnerName-${index}`} initialValue={item.name} />
                  </Col>
                  <Col xs={24} lg={8}>
                    <ProFormText label="链接地址" name={`partnerLink-${index}`} initialValue={item.link} />
                  </Col>
                </Row>
                <div className="mt-2 flex justify-end">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </div>
              </Card>
            ))}
          </Space>
        </ProCard>
      </div>
    </PageContainer>
  );
}
