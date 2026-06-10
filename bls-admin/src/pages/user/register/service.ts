import { request } from '@umijs/max';

export interface UserRegisterParams {
  mail: string;
  password: string;
  confirm: string;
  mobile: string;
  captcha: string;
  prefix: string;
}

export async function fakeRegister(params: UserRegisterParams) {
  return request<API.LoginResult>('/api/register', {
    method: 'POST',
    data: params,
  });
}
