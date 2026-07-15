import { useQuery } from '@tanstack/react-query';
import { Button, Form, Input, List, Modal, message } from 'antd';
import React, { useState } from 'react';
import { request } from '@umijs/max';
import { queryCurrent } from '../service';

const maskPhone = (phone?: string | null) => {
  if (!phone) return '未绑定';
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
};

const maskEmail = (email?: string | null) => {
  if (!email || !email.includes('@')) return '未绑定';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
};

const SecurityView: React.FC = () => {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => queryCurrent().then((res) => res.data),
  });

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await request<{ code: number; message?: string }>(
        '/api/system/user/changePassword',
        {
          method: 'PUT',
          data: {
            oldPassword: values.oldPassword,
            newPassword: values.newPassword,
          },
        },
      );
      if (res.code === 200) {
        message.success('密码修改成功，请重新登录');
        form.resetFields();
        setPasswordModalOpen(false);
      } else {
        message.error(res.message || '密码修改失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '密码修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  const data = [
    {
      title: '账户密码',
      description: '建议定期更换密码以保障账户安全',
      action: (
        <a key="Modify" onClick={() => setPasswordModalOpen(true)}>
          修改
        </a>
      ),
    },
    {
      title: '密保手机',
      description: `已绑定手机：${maskPhone(currentUser?.phone)}`,
      action: <span style={{ color: '#999' }}>在基本设置中修改</span>,
    },
    {
      title: '备用邮箱',
      description: `已绑定邮箱：${maskEmail(currentUser?.email)}`,
      action: <span style={{ color: '#999' }}>在基本设置中修改</span>,
    },
  ];

  return (
    <>
      <List
        itemLayout="horizontal"
        dataSource={data}
        renderItem={(item) => (
          <List.Item actions={[item.action]}>
            <List.Item.Meta title={item.title} description={item.description} />
          </List.Item>
        )}
      />
      <Modal
        title="修改密码"
        open={passwordModalOpen}
        onCancel={() => {
          form.resetFields();
          setPasswordModalOpen(false);
        }}
        onOk={handleChangePassword}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入当前密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码长度不能少于6位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SecurityView;
