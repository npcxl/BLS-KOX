import { PageContainer, ProCard } from '@ant-design/pro-components';
import {
  Avatar,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Select,
  Space,
  Upload,
  message,
} from 'antd';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import { useEffect, useMemo, useState } from 'react';
import { useModel } from '@umijs/max';
import { currentUser as queryCurrentUser } from '@/services/ant-design-pro/api';
import { updateProfile } from '@/services/system/user';
import { useDict } from '@/hooks/useDict';
import { useFileUpload } from '@/hooks/useFileUpload';

export type PersonalSettingsForm = {
  nickname?: string;
  realName?: string;
  gender?: '0' | '1' | '2';
  email?: string;
  phone?: string;
  avatar?: string;
  remark?: string;
};

function buildAvatarFileList(avatar?: string): UploadFile[] {
  if (!avatar) return [];
  return [{ uid: 'avatar', name: 'avatar', status: 'done', url: avatar }];
}


export default function AccountSettingsPage() {
  const [form] = Form.useForm<PersonalSettingsForm>();
  const { initialState, setInitialState } = useModel('@@initialState');
  const [loading, setLoading] = useState(false);
  const [avatarFileList, setAvatarFileList] = useState<UploadFile[]>([]);
  const { upload: uploadAvatar } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'avatar',
    },
  });

  const currentUser = initialState?.currentUser;

  useEffect(() => {
    if (!currentUser) return;
    form.setFieldsValue({
      nickname: currentUser.nickname,
      realName: currentUser.realName ?? undefined,
      gender: currentUser.gender ?? undefined,
      email: currentUser.email ?? undefined,
      phone: currentUser.phone ?? undefined,
      avatar: currentUser.avatar ?? undefined,
      remark: currentUser.remark ?? undefined,
    });
    setAvatarFileList(buildAvatarFileList(currentUser.avatar ?? undefined));
  }, [currentUser, form]);

  const avatarPreview = useMemo(
    () => currentUser?.avatar || avatarFileList[0]?.url,
    [avatarFileList, currentUser],
  );

  const resetForm = () => {
    if (!currentUser) return;
    form.setFieldsValue({
      nickname: currentUser.nickname,
      realName: currentUser.realName ?? undefined,
      gender: currentUser.gender ?? undefined,
      email: currentUser.email ?? undefined,
      phone: currentUser.phone ?? undefined,
      avatar: currentUser.avatar ?? undefined,
      remark: currentUser.remark ?? undefined,
    });
    setAvatarFileList(buildAvatarFileList(currentUser.avatar ?? undefined));
  };

  const uploadProps: UploadProps = {
    listType: 'picture-card',
    maxCount: 1,
    showUploadList: false,
    fileList: avatarFileList,
    beforeUpload: (file) => {
      const isImage = file.type?.startsWith('image/');
      if (!isImage) {
        message.error('只能上传图片');
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async (options) => {
      const rawFile = options.file as File;

      try {
        const res = await uploadAvatar({
          file: rawFile,
          filename: rawFile.name,
        });
        const data = (res as any)?.data ?? res;
        const url = data?.url ?? data?.fileUrl ?? data?.data?.url ?? data?.data?.fileUrl;
        if (!url) throw new Error('上传成功但未返回地址');

        const nextFile: UploadFile = {
          uid: `${Date.now()}`,
          name: rawFile.name,
          status: 'done',
          url,
        };
        setAvatarFileList([nextFile]);
        form.setFieldValue('avatar', url);
        await updateProfile({
          userId: currentUser.userId,
          nickname: form.getFieldValue('nickname')?.trim() ?? currentUser.nickname,
          realName: form.getFieldValue('realName')?.trim() ?? currentUser.realName,
          gender: form.getFieldValue('gender') ?? currentUser.gender ?? undefined,
          email: form.getFieldValue('email')?.trim() ?? currentUser.email,
          phone: form.getFieldValue('phone')?.trim() ?? currentUser.phone,
          avatar: url,
          remark: form.getFieldValue('remark')?.trim() ?? currentUser.remark,
        });

        const resUser = await queryCurrentUser({ url: '/api/auth/profile' });
        if (resUser.data) {
          localStorage.setItem('currentUser', JSON.stringify(resUser.data));
          setInitialState((state) => ({ ...state, currentUser: resUser.data }));
          form.setFieldsValue({
            nickname: resUser.data.nickname,
            realName: resUser.data.realName ?? undefined,
            gender: resUser.data.gender ?? undefined,
            email: resUser.data.email ?? undefined,
            phone: resUser.data.phone ?? undefined,
            avatar: resUser.data.avatar ?? undefined,
            remark: resUser.data.remark ?? undefined,
          });
          setAvatarFileList(buildAvatarFileList(resUser.data.avatar ?? undefined));
        }
        message.success('头像已自动保存');
        options.onSuccess?.(undefined as any);
      } catch (error) {
        options.onError?.(error as Error);
        message.error(error instanceof Error ? error.message : '头像上传失败');
      }
    },
  };

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
        gender: values.gender ?? currentUser.gender ?? undefined,
        email: values.email?.trim() ?? currentUser.email,
        phone: values.phone?.trim() ?? currentUser.phone,
        avatar: values.avatar?.trim() ?? currentUser.avatar,
        remark: values.remark?.trim() ?? currentUser.remark,
      });

      const res = await queryCurrentUser({ url: '/api/auth/profile' });
      if (res.data) {
        localStorage.setItem('currentUser', JSON.stringify(res.data));
        setInitialState((state) => ({ ...state, currentUser: res.data }));
        form.setFieldsValue({
          nickname: res.data.nickname,
          realName: res.data.realName ?? undefined,
          gender: res.data.gender ?? undefined,
          email: res.data.email ?? undefined,
          phone: res.data.phone ?? undefined,
          avatar: res.data.avatar ?? undefined,
          remark: res.data.remark ?? undefined,
        });
        setAvatarFileList(buildAvatarFileList(res.data.avatar ?? undefined));
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
                <Descriptions.Item label="昵称">{currentUser.nickname}</Descriptions.Item>
                <Descriptions.Item label="部门">{currentUser.deptName || '-'}</Descriptions.Item>
                <Descriptions.Item label="状态">{statusValueEnum[currentUser.status || '']?.text || '-'}</Descriptions.Item>
                <Descriptions.Item label="管理员">{yesNoValueEnum[currentUser.isAdmin || '']?.text || '-'}</Descriptions.Item>
              </Descriptions>
            </Space>
          </ProCard>
        </Col>
        <Col xs={24} lg={16}>
          <ProCard title="编辑个人资料" bordered>
            <Form form={form} layout="vertical" onFinish={onFinish}>
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
                <Col xs={24}>
                  <Form.Item label="头像上传" extra="上传图片后会自动保存">
                    <Upload {...uploadProps}>
                      {avatarFileList.length < 1 ? (
                        <Button type="dashed">上传头像</Button>
                      ) : (
                        <Avatar size={88} src={avatarPreview} />
                      )}
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
                <Button onClick={resetForm}>恢复</Button>
              </Space>
            </Form>
          </ProCard>
        </Col>
      </Row>
    </PageContainer>
  );
}
