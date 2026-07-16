package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.entity.*;
import com.bls.server.mapper.*;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "日志中心")
@RestController
@RequestMapping("/api/system/log")
@RequiredArgsConstructor
public class LogController {

    private final SysLoginLogMapper loginLogMapper;
    private final SysOperationLogMapper operationLogMapper;
    private final SysSecurityLogMapper securityLogMapper;
    private final SysUploadAuditMapper uploadAuditMapper;

    @Operation(summary = "登录日志列表")
    @GetMapping("/login")
    @PreAuthorize("hasAuthority('PERM_system:log:login:list')")
    public ApiResponse<List<Map<String, Object>>> loginLogs(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String loginType,
            @RequestParam(required = false) String loginStatus,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysLoginLog> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysLoginLog> wrapper = new LambdaQueryWrapper<SysLoginLog>()
                .eq(SysLoginLog::getTenantId, tenantId);
        if (username != null) wrapper.eq(SysLoginLog::getUsername, username);
        if (loginType != null) wrapper.eq(SysLoginLog::getLoginType, loginType);
        if (loginStatus != null) wrapper.eq(SysLoginLog::getLoginStatus, loginStatus);
        wrapper.orderByDesc(SysLoginLog::getLoginTime);
        IPage<SysLoginLog> result = loginLogMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("logId", l.getLogId()); m.put("username", l.getUsername());
            m.put("loginType", l.getLoginType()); m.put("loginStatus", l.getLoginStatus());
            m.put("failReason", l.getFailReason()); m.put("loginIp", l.getLoginIp());
            m.put("userAgent", l.getUserAgent()); m.put("loginTime", l.getLoginTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "操作审计列表")
    @GetMapping("/operation")
    @PreAuthorize("hasAuthority('PERM_system:log:audit:list')")
    public ApiResponse<List<Map<String, Object>>> operationLogs(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String businessType,
            @RequestParam(required = false) String moduleName,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) Integer success,
            @RequestParam(required = false) String clientIp,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysOperationLog> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysOperationLog> wrapper = new LambdaQueryWrapper<SysOperationLog>()
                .eq(SysOperationLog::getTenantId, tenantId);
        if (title != null) wrapper.like(SysOperationLog::getTitle, title);
        if (businessType != null) wrapper.eq(SysOperationLog::getBusinessType, businessType);
        if (moduleName != null) wrapper.eq(SysOperationLog::getModuleName, moduleName);
        if (username != null) wrapper.eq(SysOperationLog::getUsername, username);
        if (success != null) wrapper.eq(SysOperationLog::getSuccess, success);
        if (clientIp != null) wrapper.eq(SysOperationLog::getClientIp, clientIp);
        wrapper.orderByDesc(SysOperationLog::getOperatorTime);
        IPage<SysOperationLog> result = operationLogMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("logId", l.getLogId()); m.put("title", l.getTitle());
            m.put("businessType", l.getBusinessType()); m.put("moduleName", l.getModuleName());
            m.put("username", l.getUsername()); m.put("requestMethod", l.getRequestMethod());
            m.put("requestUrl", l.getRequestUrl()); m.put("success", l.getSuccess());
            m.put("clientIp", l.getClientIp()); m.put("costTimeMs", l.getCostTimeMs());
            m.put("operatorTime", l.getOperatorTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "上传审计列表")
    @GetMapping("/upload")
    @PreAuthorize("hasAuthority('PERM_system:log:audit:list')")
    public ApiResponse<List<Map<String, Object>>> uploadLogs(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String moduleName,
            @RequestParam(required = false) String originalName,
            @RequestParam(required = false) String accessType,
            @RequestParam(required = false) String uploadStatus,
            @RequestParam(required = false) String clientIp,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysUploadAudit> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysUploadAudit> wrapper = new LambdaQueryWrapper<SysUploadAudit>()
                .eq(SysUploadAudit::getTenantId, tenantId);
        if (username != null) wrapper.eq(SysUploadAudit::getUsername, username);
        if (moduleName != null) wrapper.eq(SysUploadAudit::getModuleName, moduleName);
        if (originalName != null) wrapper.like(SysUploadAudit::getOriginalName, originalName);
        if (accessType != null) wrapper.eq(SysUploadAudit::getAccessType, accessType);
        if (uploadStatus != null) wrapper.eq(SysUploadAudit::getUploadStatus, uploadStatus);
        if (clientIp != null) wrapper.eq(SysUploadAudit::getClientIp, clientIp);
        wrapper.orderByDesc(SysUploadAudit::getCreateTime);
        IPage<SysUploadAudit> result = uploadAuditMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("auditId", l.getAuditId()); m.put("username", l.getUsername());
            m.put("originalName", l.getOriginalName()); m.put("fileSize", l.getFileSize());
            m.put("uploadStatus", l.getUploadStatus()); m.put("createTime", l.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "清空审计日志")
    @DeleteMapping("/audit/clean")
    @PreAuthorize("hasAuthority('PERM_system:log:audit:clean')")
    public ApiResponse<Void> cleanAudit() {
        String tenantId = TenantContext.getTenantId();
        operationLogMapper.delete(new LambdaQueryWrapper<SysOperationLog>()
                .eq(SysOperationLog::getTenantId, tenantId));
        return ApiResponse.success(null, "清空成功");
    }

    @Operation(summary = "审计日志详情")
    @GetMapping("/audit/detail/{id}")
    @PreAuthorize("hasAuthority('PERM_system:log:audit:detail')")
    public ApiResponse<Map<String, Object>> auditDetail(@PathVariable String id) {
        SysOperationLog log = operationLogMapper.selectById(id);
        if (log == null) return ApiResponse.success(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("logId", log.getLogId()); m.put("title", log.getTitle());
        m.put("requestParams", log.getRequestParams()); m.put("errorMessage", log.getErrorMessage());
        m.put("errorStack", log.getErrorStack());
        return ApiResponse.success(m);
    }

    @Operation(summary = "安全日志列表")
    @GetMapping("/security")
    @PreAuthorize("hasAuthority('PERM_system:log:security:list')")
    public ApiResponse<List<Map<String, Object>>> securityLogs(
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
}
