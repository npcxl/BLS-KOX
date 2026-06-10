import type { CurrentUser } from '../shared/types/current-user';

declare module 'koa' {
  interface DefaultState {
    user?: CurrentUser;
  }
}
