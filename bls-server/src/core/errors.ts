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

export class SessionInvalidError extends AppError {
  constructor(message = '会话已失效，请重新登录') {
    super(message, 401, 40101);
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

/** 资源冲突（唯一约束冲突等），HTTP 409 */
export class ConflictError extends AppError {
  constructor(message = '资源已存在') {
    super(message, 409, 409);
  }
}

/**
 * 套餐权益不足（阶段三），HTTP 403 / code 40301。
 * 前端据此提示“当前套餐不包含该功能，请升级套餐”。
 */
export class EntitlementError extends AppError {
  constructor(message = '当前套餐不包含该功能，请升级套餐', details?: unknown) {
    super(message, 403, 40301, details);
    this.name = 'EntitlementError';
  }
}

/**
 * 配额超限（阶段三），HTTP 409 / code 40905。
 * 与 replay 的 40901-40904 区分，便于前端区分“配额不足”和“重复提交”。
 */
export class QuotaExceededError extends AppError {
  constructor(message = '资源配额已用尽，请升级套餐或释放资源', details?: unknown) {
    super(message, 409, 40905, details);
    this.name = 'QuotaExceededError';
  }
}

// ==================== 登录人机验证（captcha）====================
// 业务码段 40010-40019 / 50301，前端据此区分错误并驱动验证码流程。

/** 已开启人机验证但请求未携带 captchaTicket，HTTP 400 / code 40010 */
export class CaptchaRequiredError extends AppError {
  constructor(message = '请先完成人机验证') {
    super(message, 400, 40010, { errorCode: 'CAPTCHA_REQUIRED' });
    this.name = 'CaptchaRequiredError';
  }
}

/** captchaTicket 无效（绑定信息不匹配 / 场景不匹配 / 未经服务端签发），HTTP 400 / code 40011 */
export class CaptchaInvalidError extends AppError {
  constructor(message = '人机验证凭证无效，请重新验证') {
    super(message, 400, 40011, { errorCode: 'CAPTCHA_INVALID' });
    this.name = 'CaptchaInvalidError';
  }
}

/** captchaTicket / challenge 已过期或不复存在，HTTP 400 / code 40012 */
export class CaptchaExpiredError extends AppError {
  constructor(message = '人机验证已过期，请重新验证') {
    super(message, 400, 40012, { errorCode: 'CAPTCHA_EXPIRED' });
    this.name = 'CaptchaExpiredError';
  }
}

/** captchaTicket 已被消费（重放），HTTP 400 / code 40013 */
export class CaptchaReplayedError extends AppError {
  constructor(message = '人机验证凭证已被使用，请重新验证') {
    super(message, 400, 40013, { errorCode: 'CAPTCHA_REPLAYED' });
    this.name = 'CaptchaReplayedError';
  }
}

/**
 * 验证服务不可用（生产环境 Redis 不可用时 fail closed）。
 * HTTP 503 / code 50301 —— 明确拒绝，绝不绕过验证。
 */
export class CaptchaUnavailableError extends AppError {
  constructor(message = '人机验证服务暂不可用，请稍后重试') {
    super(message, 503, 50301, { errorCode: 'CAPTCHA_SERVICE_UNAVAILABLE' });
    this.name = 'CaptchaUnavailableError';
  }
}

/**
 * 人机验证**技术故障**（HTTP 503 / code 50302 / errorCode `TECHNICAL_ERROR`）。
 *
 * 与 `CaptchaUnavailableError` 的区别：50301 表示"我们自己没配好/Redis 挂了"，
 * 50302 专门表示**上游验证服务（TIANAI Java 服务）不可达、超时或返回异常**。
 * 两者都必须 fail closed，但语义上**绝不能**被当成"用户验证失败"（那会误封正常用户）。
 */
export class CaptchaTechnicalError extends AppError {
  constructor(message = '人机验证服务发生技术故障，请稍后重试') {
    super(message, 503, 50302, { errorCode: 'TECHNICAL_ERROR' });
    this.name = 'CaptchaTechnicalError';
  }
}
