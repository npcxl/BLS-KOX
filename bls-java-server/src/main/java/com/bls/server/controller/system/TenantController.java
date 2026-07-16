package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.service.system.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "租户管理")
@RestController
@RequestMapping("/api/system/tenant")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    @Data
    public static class TenantQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

    @Data
    public static class TenantCreateRequest {
        @NotBlank private String tenantName;
        private String domainName;
        private String packageId;
        private String contactName;
        private String contactPhone;
        private String contactEmail;
        private String status = "0";
        private String remark;
    }

    @Data
    public static class TenantEditRequest {
        @NotBlank private String tenantId;
        private String tenantName;
        private String domainName;
        private String packageId;
        private String contactName;
        private String contactPhone;
        private String contactEmail;
        private String status;
        private String remark;
    }

    @Data
    public static class TenantStatusRequest {
        @NotBlank private String tenantId;
        @NotBlank private String status;
    }

    @Data
    public static class TenantRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "租户列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:tenant:list')")
    public ApiResponse<List<Map<String, Object>>> list(TenantQueryRequest request) {
        return tenantService.listTenants(request);
    }

    @Operation(summary = "公开租户列表（无需认证）")
    @GetMapping("/public-list")
    public ApiResponse<List<Map<String, Object>>> publicList() {
        return ApiResponse.success(tenantService.getPublicTenantList());
    }

    @Operation(summary = "新增租户")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:tenant:add')")
    public ApiResponse<Void> add(@Valid @RequestBody TenantCreateRequest request) {
        tenantService.addTenant(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑租户")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:tenant:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody TenantEditRequest request) {
        tenantService.editTenant(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "修改租户状态")
    @PutMapping("/status")
    @PreAuthorize("hasAuthority('PERM_system:tenant:edit')")
    public ApiResponse<Void> status(@Valid @RequestBody TenantStatusRequest request) {
        tenantService.updateStatus(request.getTenantId(), request.getStatus());
        return ApiResponse.success(null, "操作成功");
    }

    @Operation(summary = "删除租户")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:tenant:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody TenantRemoveRequest request) {
        tenantService.removeTenants(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }
}
