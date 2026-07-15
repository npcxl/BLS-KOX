import { UploadOutlined } from '@ant-design/icons';
import {
  ProForm,
  ProFormText,
} from '@ant-design/pro-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useModel } from '@umijs/max';
import { Button, message } from 'antd';
import React, { useState } from 'react';
import { queryCurrent } from '../service';
import { updateProfile } from '@/services/system/user';
import { useFileUpload } from '@/hooks/useFileUpload';
import useStyles from './index.style';

const BaseView: React.FC = () => {
  const { styles } = useStyles();
  const queryClient = useQueryClient();
  const { initialState } = useModel('@@initialState');
  const fetchUserInfo = initialState?.fetchUserInfo;

  const { data: currentUser, isLoading: loading } = useQuery({
    queryKey: ['current-user'],
    queryFn: () =>
      queryCurrent().then((res) => ({
        userId: res.data?.userId,
        name: res.data?.nickname || res.data?.username,
        avatar: res.data?.avatar,
        email: (res.data as any)?.email,
        phone: (res.data as any)?.phone,
      })),
  });

  const getAvatarURL = () => {
    if (currentUser?.avatar) {
      return currentUser.avatar;
    }
    return 'https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png';
  };

  const handleFinish = async (values: any) => {
    const res = await updateProfile({
      userId: currentUser?.userId || '',
      nickname: values.name,
      email: values.email,
      phone: values.phone,
    });
    if (res.code === 200) {
      message.success('更新基本信息成功');
      await fetchUserInfo?.();
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    }
  };

  return (
    <div className={styles.baseView}>
      {loading ? null : (
        <>
          <div className={styles.left}>
            <ProForm
              layout="vertical"
              onFinish={handleFinish}
              submitter={{
                searchConfig: {
                  submitText: '更新基本信息',
                },
                render: (_, dom) => dom[1],
              }}
              initialValues={currentUser ?? {}}
              requiredMark={false}
            >
              <ProFormText
                width="md"
                name="name"
                label="昵称"
                rules={[
                  {
                    required: true,
                    message: '请输入您的昵称!',
                  },
                ]}
              />
              <ProFormText
                width="md"
                name="email"
                label="邮箱"
                rules={[
                  {
                    type: 'email',
                    message: '请输入有效的邮箱地址!',
                  },
                ]}
              />
              <ProFormText
                width="md"
                name="phone"
                label="手机号"
              />
            </ProForm>
          </div>
          <div className={styles.right}>
            <AvatarView avatar={getAvatarURL()} fetchUserInfo={fetchUserInfo} />
          </div>
        </>
      )}
    </div>
  );
};
export default BaseView;

const AvatarView = ({ avatar, fetchUserInfo }: { avatar: string; fetchUserInfo?: () => Promise<any> }) => {
  const { styles } = useStyles();
  const queryClient = useQueryClient();
  const [avatarUrl, setAvatarUrl] = useState(avatar);

  const { uploading, upload } = useFileUpload({
    defaultData: { accessType: 'public', moduleName: 'avatar' },
    onSuccess: async (result) => {
      if (result.url) {
        const res = await updateProfile({ userId: '', avatar: result.url } as any);
        if (res.code === 200) {
          setAvatarUrl(result.url);
          await fetchUserInfo?.();
          queryClient.invalidateQueries({ queryKey: ['current-user'] });
          message.success('头像更新成功');
        } else {
          message.error(res.message || '头像更新失败');
        }
      } else {
        message.error('获取头像URL失败');
      }
    },
    onError: () => {
      message.error('头像上传失败');
    },
  });

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        upload({ file, filename: file.name });
      }
    };
    input.click();
  };

  return (
    <>
      <div className={styles.avatar_title}>头像</div>
      <div className={styles.avatar}>
        <img src={avatarUrl || avatar} alt="avatar" />
      </div>
      <div className={styles.button_view}>
        <Button loading={uploading} onClick={handleFileSelect}>
          <UploadOutlined />
          更换头像
        </Button>
      </div>
    </>
  );
};
