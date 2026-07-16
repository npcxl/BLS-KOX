package com.bls.server.controller;

import com.bls.server.common.ApiResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class HealthController {

    private final MeterRegistry meterRegistry;

    @Operation(summary = "健康检查")
    @GetMapping({"/api/health", "/health"})
    public ApiResponse<Map<String, Object>> health() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "UP");
        data.put("timestamp", System.currentTimeMillis());
        return ApiResponse.success(data);
    }

    @Operation(summary = "就绪检查")
    @GetMapping({"/api/ready", "/ready"})
    public ApiResponse<Map<String, Object>> ready() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "READY");
        data.put("timestamp", System.currentTimeMillis());
        return ApiResponse.success(data);
    }

    @Operation(summary = "Prometheus 指标")
    @GetMapping("/api/metrics")
    public String metrics() {
        if (meterRegistry instanceof PrometheusMeterRegistry pmr) {
            return pmr.scrape();
        }
        return "# No Prometheus registry configured";
    }
}
