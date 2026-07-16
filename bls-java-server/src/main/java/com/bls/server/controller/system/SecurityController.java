package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysIpBlacklist;
import com.bls.server.entity.SysSecurityLog;
import com.bls.server.mapper.SysIpBlacklistMapper;
import com.bls.server.mapper.SysSecurityLogMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "安全中心")
@RestController
@RequestMapping("/api/system/security")
@RequiredArgsConstructor
public class SecurityController {

    private final SysSecurityLogMapper securityLogMapper;
    private final SysIpBlacklistMapper ipBlacklistMapper;

    @Data
    public static class BlacklistAddRequest {
        @NotBlank private String ipAddress;
        private String reason;
        private String source = "manual";
    }

    @Operation(summary = "安全态势统计")
    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PERM_system:security:stats')")
    public ApiResponse<Map<String, Object>> stats() {
        String tenantId = TenantContext.getTenantId();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalEvents", securityLogMapper.selectCount(new LambdaQueryWrapper<SysSecurityLog>()
                .eq(SysSecurityLog::getTenantId, tenantId)));
        data.put("blacklistCount", ipBlacklistMapper.selectCount(new LambdaQueryWrapper<SysIpBlacklist>()
                .eq(SysIpBlacklist::getTenantId, tenantId)
                .eq(SysIpBlacklist::getStatus, "0")));
        return ApiResponse.success(data);
    }

    @Operation(summary = "安全事件列表")
    @GetMapping("/events")
    @PreAuthorize("hasAuthority('PERM_system:security:stats')")
    public ApiResponse<List<Map<String, Object>>> events(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String riskLevel,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String clientIp,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysSecurityLog> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysSecurityLog> wrapper = new LambdaQueryWrapper<SysSecurityLog>()
                .eq(SysSecurityLog::getTenantId, tenantId);

        if (eventType != null) wrapper.eq(SysSecurityLog::getEventType, eventType);
        if (riskLevel != null) wrapper.eq(SysSecurityLog::getRiskLevel, riskLevel);
        if (username != null) wrapper.eq(SysSecurityLog::getUsername, username);
        if (clientIp != null) wrapper.eq(SysSecurityLog::getClientIp, clientIp);
        if (keyword != null) wrapper.like(SysSecurityLog::getTitle, keyword);

        wrapper.orderByDesc(SysSecurityLog::getCreateTime);
        IPage<SysSecurityLog> result = securityLogMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId()); m.put("eventType", e.getEventType());
            m.put("riskLevel", e.getRiskLevel()); m.put("title", e.getTitle());
            m.put("username", e.getUsername()); m.put("clientIp", e.getClientIp());
            m.put("createTime", e.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "IP黑名单列表")
    @GetMapping("/blacklist")
    @PreAuthorize("hasAuthority('PERM_system:security:stats')")
    public ApiResponse<List<Map<String, Object>>> blacklist(
            @RequestParam(required = false) String ip,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysIpBlacklist> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysIpBlacklist> wrapper = new LambdaQueryWrapper<SysIpBlacklist>()
                .eq(SysIpBlacklist::getTenantId, tenantId);
        if (ip != null) wrapper.eq(SysIpBlacklist::getIpAddress, ip);
        if (source != null) wrapper.eq(SysIpBlacklist::getSource, source);
        wrapper.orderByDesc(SysIpBlacklist::getCreateTime);
        IPage<SysIpBlacklist> result = ipBlacklistMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getId()); m.put("ipAddress", b.getIpAddress());
            m.put("reason", b.getReason()); m.put("source", b.getSource());
            m.put("status", b.getStatus()); m.put("createTime", b.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "添加IP黑名单")
    @PostMapping("/blacklist")
    @PreAuthorize("hasAuthority('PERM_system:security:blacklist:add')")
    public ApiResponse<Void> addBlacklist(@Valid @RequestBody BlacklistAddRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysIpBlacklist entry = new SysIpBlacklist();
        entry.setIpAddress(request.getIpAddress());
        entry.setReason(request.getReason());
        entry.setSource(request.getSource());
        entry.setStatus("0");
        entry.setTenantId(tenantId);
        ipBlacklistMapper.insert(entry);
        return ApiResponse.success(null, "添加成功");
    }

    @Operation(summary = "移除IP黑名单")
    @DeleteMapping("/blacklist/{id}")
    @PreAuthorize("hasAuthority('PERM_system:security:blacklist:remove')")
    public ApiResponse<Void> removeBlacklist(@PathVariable String id) {
        SysIpBlacklist entry = ipBlacklistMapper.selectById(id);
        if (entry != null) {
            entry.setStatus("1");
            ipBlacklistMapper.updateById(entry);
        }
        return ApiResponse.success(null, "移除成功");
    }
}
