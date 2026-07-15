import { currentUser as queryCurrentUser } from '@/services/ant-design-pro/api';

export async function queryCurrent() {
  return queryCurrentUser();
}
