package com.bls.server.distributed.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 分布式能力相关 Prometheus 指标。
 */
@Component
@RequiredArgsConstructor
public class DistributedMetrics {

    private final MeterRegistry meterRegistry;

    private Counter rateLimitRejected;
    private Counter idempotentConflict;
    private Counter idempotentHit;
    private Counter lockFailed;
    private Counter lockAcquired;

    @PostConstruct
    public void init() {
        rateLimitRejected = Counter.builder("bls_ratelimit_rejected_total")
                .description("Rate limit rejected count")
                .register(meterRegistry);

        idempotentConflict = Counter.builder("bls_idempotent_conflict_total")
                .description("Idempotent conflict count")
                .register(meterRegistry);

        idempotentHit = Counter.builder("bls_idempotent_cache_hit_total")
                .description("Idempotent cache hit count")
                .register(meterRegistry);

        lockFailed = Counter.builder("bls_lock_failed_total")
                .description("Distributed lock acquire failed count")
                .register(meterRegistry);

        lockAcquired = Counter.builder("bls_lock_acquired_total")
                .description("Distributed lock acquired count")
                .register(meterRegistry);
    }

    public void recordRateLimitRejected() {
        rateLimitRejected.increment();
    }

    public void recordIdempotentConflict() {
        idempotentConflict.increment();
    }

    public void recordIdempotentHit() {
        idempotentHit.increment();
    }

    public void recordLockFailed() {
        lockFailed.increment();
    }

    public void recordLockAcquired() {
        lockAcquired.increment();
    }
}
