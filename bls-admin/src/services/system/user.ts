import { request } from '@umijs/max';

export type UpdateProfileBody = {
  userId: string;
  nickname?: string;
  realName?: string | null;
  gender?: '0' | '1' | '2';
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  remark?: string | null;
};

/** 更新个人资料 PUT /api/system/user/profile */
export async function updateProfile(body: UpdateProfileBody, options?: { [key: string]: any }) {
  return request<API.ResponseResult<null>>('/api/system/user/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
