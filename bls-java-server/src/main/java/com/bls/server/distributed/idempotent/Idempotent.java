package com.bls.server.distributed.idempotent;

import java.lang.annotation.*;

/**
 * 幂等注解 —— 基于 Redis 缓存请求结果，防止重复提交。
 * <p>
 * 作用在方法上时，AOP 切面会：
 * <ol>
 *   <li>用 Idempotency-Key 请求头作为幂等键</li>
 *   <li>首次请求执行方法并缓存结果（TTL 默认 600s）</li>
 *   <li>重复请求直接返回缓存结果</li>
 * </ol>
 * <p>
 * 使用示例：
 * <pre>
 *   {@code @Idempotent(prefix = "order:create")}
 *   public ApiResponse createOrder() { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Idempotent {

    /** Key 前缀，默认 "idempotent:" */
    String prefix() default "idempotent:";

    /** 幂等结果缓存时间（秒） */
    long ttlSeconds() default 600;
}
