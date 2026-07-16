package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.security.JwtAuthenticationToken;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.util.*;

@Tag(name = "仪表盘")
@RestController
@RequestMapping("/api/system/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    @Operation(summary = "系统统计")
    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("userCount", 0);
        data.put("roleCount", 0);
        data.put("menuCount", 0);
        data.put("logCount", 0);
        data.put("tenantCount", 0);
        return ApiResponse.success(data);
    }

    @Operation(summary = "系统状态")
    @GetMapping("/system-status")
    public ApiResponse<Map<String, Object>> systemStatus() {
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("cpuLoad", os.getSystemLoadAverage());
        data.put("availableProcessors", os.getAvailableProcessors());
        data.put("totalMemory", Runtime.getRuntime().totalMemory());
        data.put("freeMemory", Runtime.getRuntime().freeMemory());
        data.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime());
        return ApiResponse.success(data);
    }

    @Operation(summary = "最近日志")
    @GetMapping("/recent-logs")
    public ApiResponse<List<Map<String, Object>>> recentLogs() {
        return ApiResponse.success(Collections.emptyList());
    }
}
