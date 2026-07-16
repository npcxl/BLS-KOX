package com.bls.server.distributed.lock;

import cn.hutool.core.util.StrUtil;
import com.bls.server.common.AppException;
import com.bls.server.distributed.metrics.DistributedMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * {@link DistributedLock} 注解的 AOP 切面实现。
 * <p>
 * 基于 Redis SET NX PX 实现轻量级分布式锁，无需引入 Redisson。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class DistributedLockAspect {

    private final StringRedisTemplate redisTemplate;
    private final DistributedMetrics metrics;
    private static final ExpressionParser SPEL_PARSER = new SpelExpressionParser();
    private static final ParameterNameDiscoverer PARAM_NAME_DISCOVERER = new DefaultParameterNameDiscoverer();

    @Around("@annotation(distributedLock)")
    public Object around(ProceedingJoinPoint pjp, DistributedLock distributedLock) throws Throwable {
        String lockKey = resolveKey(distributedLock, pjp);
        String lockValue = UUID.randomUUID().toString();
        String fullKey = distributedLock.prefix() + lockKey;

        // 尝试获取锁
        boolean acquired = false;
        if (distributedLock.waitTime() > 0) {
            // 自旋等待
            long deadline = System.currentTimeMillis() + distributedLock.waitTime() * 1000;
            while (System.currentTimeMillis() < deadline) {
                if (Boolean.TRUE.equals(redisTemplate.opsForValue()
                        .setIfAbsent(fullKey, lockValue, distributedLock.leaseTime(), TimeUnit.SECONDS))) {
                    acquired = true;
                    break;
                }
                Thread.sleep(100);
            }
        } else {
            acquired = Boolean.TRUE.equals(redisTemplate.opsForValue()
                    .setIfAbsent(fullKey, lockValue, distributedLock.leaseTime(), TimeUnit.SECONDS));
        }

        if (!acquired) {
            metrics.recordLockFailed();
            log.warn("[DistributedLock] 获取锁失败 key={}", fullKey);
            throw AppException.conflict("操作太频繁，请稍后再试");
        }

        metrics.recordLockAcquired();
        log.debug("[DistributedLock] 获取锁成功 key={} value={}", fullKey, lockValue);
        try {
            return pjp.proceed();
        } finally {
            // Lua 脚本：仅当 value 匹配时才删除（防止误删他人锁）
            String script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
            redisTemplate.execute(
                    new org.springframework.data.redis.core.script.DefaultRedisScript<>(script, Long.class),
                    java.util.List.of(fullKey),
                    lockValue);
            log.debug("[DistributedLock] 释放锁 key={}", fullKey);
        }
    }

    private String resolveKey(DistributedLock annotation, ProceedingJoinPoint pjp) {
        String keyExpr = annotation.key();
        if (!keyExpr.contains("#")) {
            return keyExpr;
        }
        try {
            MethodSignature signature = (MethodSignature) pjp.getSignature();
            Method method = signature.getMethod();
            EvaluationContext context = new StandardEvaluationContext();
            String[] paramNames = PARAM_NAME_DISCOVERER.getParameterNames(method);
            Object[] args = pjp.getArgs();
            if (paramNames != null) {
                for (int i = 0; i < paramNames.length; i++) {
                    context.setVariable(paramNames[i], args[i]);
                }
            }
            return SPEL_PARSER.parseExpression(keyExpr).getValue(context, String.class);
        } catch (Exception e) {
            log.warn("[DistributedLock] SpEL 解析失败 key={}, 使用原始值", keyExpr, e);
            return keyExpr;
        }
    }
}
