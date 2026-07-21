export class AppError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(message: string, status = 500, code = status) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
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

export class ValidationError extends AppError {
  constructor(message = '参数错误') {
    super(message, 400, 400);
  }
}

export class RateLimitError extends AppError {
  constructor(message = '请求过于频繁，请稍后再试') {
    super(message, 429, 429);
  }
}

export class AIProviderError extends AppError {
  constructor(message = 'AI 服务暂时不可用') {
    super(message, 502, 502);
  }
}
