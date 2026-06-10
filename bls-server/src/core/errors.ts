export class AppError extends Error {
  readonly status: number;
  readonly code: number;
  readonly details?: unknown;

  constructor(message: string, status = 500, code = status, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未登录或登录已过期') {
    super(message, 401, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '无访问权限') {
    super(message, 403, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 404, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = '参数错误', details?: unknown) {
    super(message, 400, 400, details);
  }
}
