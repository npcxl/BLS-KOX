package com.bls.server.common;

import lombok.Getter;

/**
 * Application errors aligned with Koa backend AppError hierarchy.
 */
@Getter
public class AppException extends RuntimeException {

    private final int code;
    private final int httpStatus;

    public AppException(int code, String message, int httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public AppException(int code, String message) {
        this(code, message, 400);
    }

    // === Factory methods matching Koa error types ===

    public static AppException unauthorized(String message) {
        return new AppException(401, message, 401);
    }

    public static AppException sessionInvalid(String message) {
        return new AppException(40101, message, 401);
    }

    public static AppException forbidden(String message) {
        return new AppException(403, message, 403);
    }

    public static AppException notFound(String message) {
        return new AppException(404, message, 404);
    }

    public static AppException validationError(String message) {
        return new AppException(400, message, 400);
    }

    public static AppException badRequest(String message) {
        return new AppException(400, message, 400);
    }

    public static AppException conflict(String message) {
        return new AppException(409, message, 409);
    }

    public static AppException tooManyRequests(String message) {
        return new AppException(429, message, 429);
    }

    public static AppException internal(String message) {
        return new AppException(500, message, 500);
    }
}
