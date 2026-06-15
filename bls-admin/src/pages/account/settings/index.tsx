import { PageContainer, ProCard } from '@ant-design/pro-components';
import { Avatar, Button, Col, Descriptions, Form, Input, Row, Select, Space, Switch, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useEffect, useMemo, useState } from 'react';
import { useModel } from '@umijs/max';
import { currentUser as queryCurrentUser } from '@/services/ant-design-pro/api';
import { updateProfile } from '@/services/system/user';
import { useDict } from '@/hooks/useDict';

export type PersonalSettingsForm = {
  nickname?: string;
  realName?: string;
  gender?: '0' | '1' | '2';
  email?: string;
  phone?: string;
  avatar?: string;
  remark?: string;
  status?: '0' | '1';
  username?: string;
  deptName?: string;
};

function buildAvatarFileList(avatar?: string) {
  if (!avatar) return [] as UploadFile[];
  return [
    {
      uid: 'avatar',
      name: 'avatar',
      status: 'done',
      url: avatar,
    },
  ];
}

export default function AccountSettingsPage() {
  const [form] = Form.useForm<PersonalSettingsForm>();
  const { initialState, setInitialState } = useModel('@@initialState');
  const [loading, setLoading] = useState(false);
  const [avatarFileList, setAvatarFileList] = useState<UploadFile[]>([]);

  const currentUser = initialState?.currentUser;

  useEffect(() => {
    if (!currentUser) return;
    const values: PersonalSettingsForm = {
      username: currentUser.username,
      nickname: currentUser.nickname,
      realName: currentUser.realName,
      gender: currentUser.gender,
      email: currentUser.email,
      phone: currentUser.phone,
      avatar: currentUser.avatar,
      remark: currentUser.remark,
      status: currentUser.status,
      deptName: currentUser.deptName,
    };
    form.setFieldsValue(values);
    setAvatarFileList(buildAvatarFileList(currentUser.avatar));
  }, [currentUser, form]);

  const avatarPreview = useMemo(() => currentUser?.avatar || avatarFileList[0]?.url, [avatarFileList, currentUser]);

  const onFinish = async (values: PersonalSettingsForm) => {
    if (!currentUser?.userId) {
      message.error('未获取到当前用户信息');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        userId: currentUser.userId,
        nickname: values.nickname?.trim() ?? currentUser.nickname,
        realName: values.realName?.trim() ?? currentUser.realName,
        gender: values.gender ?? currentUser.gender,
        email: values.email?.trim() ?? currentUser.email,
        phone: values.phone?.trim() ?? currentUser.phone,
        avatar: values.avatar?.trim() ?? currentUser.avatar,
        remark: values.remark?.trim() ?? currentUser.remark,
      });

      const res = await queryCurrentUser({ skipErrorHandler: true, url: '/api/auth/profile' });
      if (res.data) {
        localStorage.setItem('currentUser', JSON.stringify(res.data));
        setInitialState((state) => ({ ...state, currentUser: res.data }));
      }
      message.success('个人信息已更新');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <PageContainer title="个人设置">
        <ProCard>
          <div>暂无用户信息，请重新登录后再试。</div>
        </ProCard>
      </PageContainer>
    );
  }
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { valueEnum: yesNoValueEnum } = useDict('sys_yes_no');
  const { options: genderOptions } = useDict('sys_gender');

  return (
    <PageContainer title="个人设置">
      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <ProCard title="账号信息" bordered>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Avatar size={88} src={avatarPreview} />
              <Descriptions column={1} size="small">
                <Descriptions.Item label="用户名">{currentUser.username}</Descriptions.Item>
                <Descriptions.Item label="部门">{currentUser.deptName || '-'}</Descriptions.Item>
                <Descriptions.Item label="状态">{statusValueEnum[currentUser.status || '']?.text || '-'}</Descriptions.Item>
                <Descriptions.Item label="管理员">{yesNoValueEnum[currentUser.isAdmin || '']?.text || '-'}</Descriptions.Item>
              </Descriptions>
            </Space>
          </ProCard>
        </Col>
        <Col xs={24} lg={16}>
          <ProCard title="编辑个人资料" bordered>
            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={currentUser}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
                    <Input placeholder="请输入昵称" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="realName" label="真实姓名">
                    <Input placeholder="请输入真实姓名" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="gender" label="性别">
                    <Select options={genderOptions} allowClear placeholder="请选择性别" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="phone" label="手机号">
                    <Input placeholder="请输入手机号" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="email" label="邮箱">
                    <Input placeholder="请输入邮箱" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="avatar" label="头像地址">
                    <Input placeholder="请输入头像地址" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="头像预览">
                    <Upload
                      listType="picture-card"
                      fileList={avatarFileList}
                      maxCount={1}
                      beforeUpload={() => false}
                      onChange={(info) => {
                        setAvatarFileList(info.fileList);
                        const nextAvatar = info.fileList[0]?.url || info.file.response?.url || currentUser.avatar || '';
                        form.setFieldValue('avatar', nextAvatar);
                      }}
                    >
                      {avatarFileList.length < 1 ? '上传' : null}
                    </Upload>
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name="remark" label="备注">
                    <Input.TextArea rows={4} placeholder="请输入备注" />
                  </Form.Item>
                </Col>
              </Row>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  保存修改
                </Button>
                <Button onClick={() => form.setFieldsValue(currentUser)}>恢复</Button>
              </Space>
            </Form>
          </ProCard>
        </Col>
      </Row>
    </PageContainer>
  );
}
