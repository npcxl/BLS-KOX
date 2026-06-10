import { useMutation } from '@tanstack/react-query';
import { history, Link } from '@umijs/max';
import { Button, Form, Input, message, Space } from 'antd';
import type { Store } from 'antd/es/form/interface';
import type { FC } from 'react';
import { fakeRegister } from './service';
import useStyles from './styles';

const FormItem = Form.Item;

const Register: FC = () => {
  const { styles } = useStyles();
  const [form] = Form.useForm();

  const { isPending: submitting, mutate: register } = useMutation({
    mutationFn: (formValues: Store) => {
      return fakeRegister({
        mail: formValues.email,
        password: formValues.password,
        confirm: formValues.confirm,
        mobile: formValues.mobile,
        captcha: formValues.captcha,
        prefix: '86',
      });
    },
    onSuccess: (data, params) => {
      if (data.status === 'ok') {
        message.success('注册成功！');
        history.push({
          pathname: `/user/register-result?account=${params.mail}`,
        });
      }
    },
  });

  const onFinish = (values: Store) => {
    register(values);
  };

  const checkConfirm = (_: unknown, value: string) => {
    if (value && value !== form.getFieldValue('password')) {
      return Promise.reject(new Error('两次输入的密码不匹配'));
    }
    return Promise.resolve();
  };

  return (
    <div className={styles.main}>
      <h3>注册账号</h3>
      <Form form={form} name="UserRegister" onFinish={onFinish} layout="vertical">
        <FormItem
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱地址' },
            { type: 'email', message: '邮箱地址格式错误' },
          ]}
        >
          <Input size="large" placeholder="请输入邮箱" />
        </FormItem>

        <FormItem
          name="password"
          label="密码"
          rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input size="large" type="password" placeholder="请输入密码" />
        </FormItem>

        <FormItem
          name="confirm"
          label="确认密码"
          rules={[
            { required: true, message: '请再次输入密码' },
            { validator: checkConfirm },
          ]}
        >
          <Input size="large" type="password" placeholder="请再次输入密码" />
        </FormItem>

        <FormItem
          name="mobile"
          label="手机号"
          rules={[
            { required: true, message: '请输入手机号' },
            { pattern: /^\d{11}$/, message: '手机号格式错误' },
          ]}
        >
          <Input size="large" placeholder="请输入手机号" />
        </FormItem>

        <FormItem
          name="captcha"
          label="验证码"
          rules={[{ required: true, message: '请输入验证码' }]}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input size="large" placeholder="请输入验证码" />
            <Button size="large">获取验证码</Button>
          </Space.Compact>
        </FormItem>

        <FormItem>
          <div className={styles.footer}>
            <Button
              size="large"
              loading={submitting}
              className={styles.submit}
              type="primary"
              htmlType="submit"
            >
              <span>注册</span>
            </Button>
            <Link to="/user/login" prefetch>
              <span>返回登录</span>
            </Link>
          </div>
        </FormItem>
      </Form>
    </div>
  );
};

export default Register;
