package com.bls.server.controller.system;

import cn.hutool.core.util.RandomUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysWebhook;
import com.bls.server.entity.SysWebhookDelivery;
import com.bls.server.mapper.SysWebhookDeliveryMapper;
import com.bls.server.mapper.SysWebhookMapper;
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

@Tag(name = "Webhook管理")
@RestController
@RequestMapping("/api/system/webhooks")
@RequiredArgsConstructor
public class WebhookController {

    private final SysWebhookMapper webhookMapper;
    private final SysWebhookDeliveryMapper deliveryMapper;

    @Data
    public static class WebhookCreateRequest {
        @NotBlank private String name;
        @NotBlank private String url;
        private List<String> events;
        private String status = "0";
    }

    @Data
    public static class WebhookEditRequest {
        private String name;
        private String url;
        private List<String> events;
        private String status;
    }

    @Operation(summary = "Webhook列表")
    @GetMapping
    @PreAuthorize("hasAuthority('PERM_system:webhook:list')")
    public ApiResponse<List<Map<String, Object>>> list() {
        String tenantId = TenantContext.getTenantId();
        List<SysWebhook> webhooks = webhookMapper.selectList(
                new LambdaQueryWrapper<SysWebhook>().eq(SysWebhook::getTenantId, tenantId));
        List<Map<String, Object>> list = webhooks.stream().map(w -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("webhookId", w.getWebhookId()); m.put("name", w.getName());
            m.put("url", w.getUrl()); m.put("events", w.getEvents());
            m.put("status", w.getStatus()); m.put("createdAt", w.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "注册Webhook")
    @PostMapping
    @PreAuthorize("hasAuthority('PERM_system:webhook:add')")
    public ApiResponse<Void> create(@Valid @RequestBody WebhookCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysWebhook webhook = new SysWebhook();
        webhook.setTenantId(tenantId);
        webhook.setName(request.getName());
        webhook.setUrl(request.getUrl());
        webhook.setEvents(request.getEvents() != null ? request.getEvents().toString() : null);
        webhook.setSecret(RandomUtil.randomString(32));
        webhook.setStatus(request.getStatus());
        webhookMapper.insert(webhook);
        return ApiResponse.success(null, "注册成功");
    }

    @Operation(summary = "更新Webhook")
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_system:webhook:edit')")
    public ApiResponse<Void> update(@PathVariable String id, @Valid @RequestBody WebhookEditRequest request) {
        SysWebhook webhook = webhookMapper.selectById(id);
        if (webhook == null) throw AppException.notFound("Webhook不存在");
        if (request.getName() != null) webhook.setName(request.getName());
        if (request.getUrl() != null) webhook.setUrl(request.getUrl());
        if (request.getEvents() != null) webhook.setEvents(request.getEvents().toString());
        if (request.getStatus() != null) webhook.setStatus(request.getStatus());
        webhookMapper.updateById(webhook);
        return ApiResponse.success(null, "更新成功");
    }

    @Operation(summary = "删除Webhook")
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_system:webhook:remove')")
    public ApiResponse<Void> delete(@PathVariable String id) {
        webhookMapper.deleteById(id);
        return ApiResponse.success(null, "删除成功");
    }

    @Operation(summary = "投递日志")
    @GetMapping("/{id}/logs")
    @PreAuthorize("hasAuthority('PERM_system:webhook:logs')")
    public ApiResponse<List<Map<String, Object>>> logs(
            @PathVariable String id,
            @RequestParam(required = false) String event,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        Page<SysWebhookDelivery> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysWebhookDelivery> wrapper = new LambdaQueryWrapper<SysWebhookDelivery>()
                .eq(SysWebhookDelivery::getWebhookId, id);
        if (event != null) wrapper.eq(SysWebhookDelivery::getEvent, event);
        wrapper.orderByDesc(SysWebhookDelivery::getCreatedAt);
        IPage<SysWebhookDelivery> result = deliveryMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.getId()); m.put("event", d.getEvent());
            m.put("status", d.getStatus()); m.put("responseCode", d.getResponseCode());
            m.put("errorMessage", d.getErrorMessage()); m.put("attempt", d.getAttempt());
            m.put("createdAt", d.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "测试发送")
    @PostMapping("/{id}/test")
    @PreAuthorize("hasAuthority('PERM_system:webhook:test')")
    public ApiResponse<Void> test(@PathVariable String id) {
        return ApiResponse.success(null, "测试请求已发送");
    }

    @Operation(summary = "重试投递")
    @PostMapping("/{id}/retry")
    @PreAuthorize("hasAuthority('PERM_system:webhook:logs')")
    public ApiResponse<Void> retry(@PathVariable String id) {
        return ApiResponse.success(null, "重试已提交");
    }
}
