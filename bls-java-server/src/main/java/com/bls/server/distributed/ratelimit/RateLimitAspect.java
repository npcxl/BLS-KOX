package com.bls.server.distributed.ratelimit;

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
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

/**
 * {@link RateLimit} 注解的 AOP 切面实现。
 * <p>
 * 使用 Redis Lua 脚本实现原子 INCR + EXPIRE。
 * Lua 脚本：key 不存在时 SET + EXPIRE，存在时 INCR。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {

    private final StringRedisTemplate redisTemplate;
    private final DistributedMetrics metrics;
    private static final ExpressionParser SPEL_PARSER = new SpelExpressionParser();
    private static final ParameterNameDiscoverer PARAM_NAME_DISCOVERER = new DefaultParameterNameDiscoverer();

    private static final DefaultRedisScript<Long> RATE_LIMIT_SCRIPT;

    static {
        String lua = """
                local current = redis.call('INCR', KEYS[1])
                if current == 1 then
                    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
                end
                return current
                """;
        RATE_LIMIT_SCRIPT = new DefaultRedisScript<>(lua, Long.class);
    }

    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint pjp, RateLimit rateLimit) throws Throwable {
        String key = resolveKey(rateLimit, pjp);
        String fullKey = rateLimit.prefix() + key;

        Long current = redisTemplate.execute(
                RATE_LIMIT_SCRIPT,
                List.of(fullKey),
                String.valueOf(rateLimit.windowSeconds()));

        if (current != null && current > rateLimit.limit()) {
            metrics.recordRateLimitRejected();
            log.warn("[RateLimit] 触发限流 key={} current={} limit={}", fullKey, current, rateLimit.limit());
            throw AppException.tooManyRequests(rateLimit.message());
        }

        log.debug("[RateLimit] 放行 key={} current={} limit={}", fullKey, current, rateLimit.limit());
        return pjp.proceed();
    }

    private String resolveKey(RateLimit annotation, ProceedingJoinPoint pjp) {
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
            log.warn("[RateLimit] SpEL 解析失败 key={}, 使用原始值", keyExpr, e);
            return keyExpr;
        }
    }
}
