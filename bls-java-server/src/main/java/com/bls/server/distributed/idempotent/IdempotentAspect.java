package com.bls.server.distributed.idempotent;

import cn.hutool.json.JSONUtil;
import com.bls.server.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.concurrent.TimeUnit;

/**
 * {@link Idempotent} 注解的 AOP 切面实现。
 * <p>
 * 基于 Redis SET NX 实现请求级幂等控制：
 * 1. 从 Idempotency-Key 请求头获取幂等键
 * 2. Redis SET NX 抢占处理权
 * 3. 完成/失败后释放锁并缓存结果
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class IdempotentAspect {

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    private static final String LOCK_SUFFIX = ":lock";
    private static final String RESULT_SUFFIX = ":result";

    private final StringRedisTemplate redisTemplate;

    @Around("@annotation(idempotent)")
    public Object around(ProceedingJoinPoint pjp, Idempotent idempotent) throws Throwable {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return pjp.proceed();
        }

        HttpServletRequest request = attrs.getRequest();
        String idempotencyKey = request.getHeader(IDEMPOTENCY_HEADER);
        if (!StringUtils.hasText(idempotencyKey)) {
            // 没有幂等键，直接放行
            return pjp.proceed();
        }

        String lockKey = idempotent.prefix() + idempotencyKey + LOCK_SUFFIX;
        String resultKey = idempotent.prefix() + idempotencyKey + RESULT_SUFFIX;

        // 1. 检查是否已有缓存结果
        String cachedResult = redisTemplate.opsForValue().get(resultKey);
        if (cachedResult != null) {
            log.debug("[Idempotent] 命中缓存 key={}", idempotencyKey);
            return JSONUtil.toBean(cachedResult, ApiResponse.class);
        }

        // 2. 尝试获取处理锁
        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, "processing", 60, TimeUnit.SECONDS);
        if (!Boolean.TRUE.equals(acquired)) {
            log.warn("[Idempotent] 重复请求 key={}", idempotencyKey);
            throw new RuntimeException("请求正在处理中，请勿重复提交");
        }

        try {
            // 3. 执行目标方法
            Object result = pjp.proceed();
            // 4. 缓存结果
            redisTemplate.opsForValue().set(resultKey,
                    JSONUtil.toJsonStr(result),
                    idempotent.ttlSeconds(), TimeUnit.SECONDS);
            return result;
        } catch (Throwable e) {
            // 5. 失败时释放锁
            redisTemplate.delete(lockKey);
            throw e;
        }
    }
}
