package com.bls.server.distributed.ratelimit;

import java.lang.annotation.*;

/**
 * 限流注解 —— 基于 Redis INCR 滑动窗口实现。
 * <p>
 * 使用示例：
 * <pre>
 *   {@code @RateLimit(key = "login:#{#ip}", limit = 20, windowSeconds = 60)}
 *   public ApiResponse login() { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RateLimit {

    /** 限流 Key（支持 SpEL），如 "login:ip:#{#ip}" */
    String key();

    /** Key 前缀，默认 "rate:" */
    String prefix() default "rate:";

    /** 时间窗口内允许的最大请求数 */
    long limit();

    /** 时间窗口（秒） */
    long windowSeconds() default 60;

    /** 超限时的提示信息 */
    String message() default "请求过于频繁，请稍后再试";
}
