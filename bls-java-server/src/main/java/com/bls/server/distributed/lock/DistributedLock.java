package com.bls.server.distributed.lock;

import java.lang.annotation.*;

/**
 * 分布式锁注解 —— 基于 Redis SET NX 实现。
 * <p>
 * 作用在方法上时，AOP 切面会在方法执行前尝试获取锁，执行后自动释放。
 * <p>
 * 使用示例：
 * <pre>
 *   {@code @DistributedLock(key = "order:create:#{#userId}", waitTime = 3, leaseTime = 10)}
 *   public void createOrder(String userId) { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DistributedLock {

    /** 锁的 Key（支持 SpEL 表达式），如 "order:#{#orderId}" */
    String key();

    /** Key 前缀，默认 "lock:" */
    String prefix() default "lock:";

    /** 获取锁的最大等待时间（秒），0 表示不等待，立即失败 */
    long waitTime() default 0;

    /** 锁的自动释放时间（秒），防止死锁 */
    long leaseTime() default 30;
}
