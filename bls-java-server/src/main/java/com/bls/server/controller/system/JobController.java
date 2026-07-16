package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Tag(name = "异步任务")
@RestController
@RequestMapping("/api/system/jobs")
@RequiredArgsConstructor
public class JobController {

    @Operation(summary = "任务列表")
    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        return ApiResponse.success(Collections.emptyList());
    }

    @Operation(summary = "查询任务状态")
    @GetMapping("/{jobId}")
    public ApiResponse<Map<String, Object>> getJob(@PathVariable String jobId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("jobId", jobId);
        data.put("status", "unknown");
        return ApiResponse.success(data);
    }

    @Operation(summary = "提交任务")
    @PostMapping
    public ApiResponse<Void> createJob(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(null, "任务已提交");
    }
}
