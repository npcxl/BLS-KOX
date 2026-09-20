package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.core.BaseCrudController;
import com.fasterxml.jackson.databind.JsonNode;
import com.bls.server.entity.SysPackage;
import com.bls.server.service.system.PackageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

@Tag(name = "套餐管理")
@RestController
@RequestMapping("/api/system/package")
public class PackageController extends BaseCrudController<SysPackage, PackageController.PkgCreateRequest, PackageController.PkgEditRequest> {

    private final PackageService packageService;

    public PackageController(PackageService svc) {
        super(svc);
        this.packageService = svc;
    }

    @Override protected String getPermPrefix() { return "system:package"; }

    @Override @GetMapping("/list") @PreAuthorize("hasAuthority('PERM_system:package:list')")
    public ApiResponse<List<Map<String, Object>>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize, @RequestParam(required = false) String keyword) { return super.list(pageNum, pageSize, keyword); }
    @Override @DeleteMapping("/remove") @PreAuthorize("hasAuthority('PERM_system:package:remove')")
    public ApiResponse<Void> remove(@RequestBody JsonNode body) { return super.remove(body); }

    @Data
    public static class PkgCreateRequest {
        @NotBlank private String packageName;
        private String status = "0";
        private String remark;
        private List<String> menuIds;
    }

    @Data
    public static class PkgEditRequest {
        @NotBlank private String packageId;
        private String packageName;
        private String status;
        private String remark;
        private List<String> menuIds;
    }

    // ========== 自定义端点 ==========

    @Operation(summary = "套餐选项")
    @GetMapping("/options")
    public ApiResponse<List<Map<String, Object>>> options() {
        return ApiResponse.success(packageService.getOptions());
    }

    @Operation(summary = "套餐菜单")
    @GetMapping("/{packageId}/menus")
    public ApiResponse<List<String>> getMenus(@PathVariable String packageId) {
        return ApiResponse.success(packageService.getMenuIds(packageId));
    }

    @Data
    public static class PackageStatusRequest {
        @NotBlank private String packageId;
        @NotBlank private String status;
    }

    /** 状态快捷切换 — 对齐 Koa PUT /api/system/package/status（system:package:status） */
    @Operation(summary = "修改套餐状态")
    @PutMapping("/status")
    @PreAuthorize("hasAuthority('PERM_system:package:status')")
    public ApiResponse<Void> status(@Valid @RequestBody PackageStatusRequest request) {
        if (!packageService.updateStatus(request.getPackageId(), request.getStatus())) {
            return ApiResponse.error(404, "资源不存在");
        }
        return ApiResponse.success(null, "状态修改成功");
    }

    @Override
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:package:add')")
    public ApiResponse<Void> add(@Valid @RequestBody PkgCreateRequest request) {
        if (request.getMenuIds() != null) {
            packageService.addWithMenus(request, request.getMenuIds());
        } else {
            super.add(request);
        }
        return ApiResponse.success(null, "新增成功");
    }

    @Override
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:package:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody PkgEditRequest request) {
        if (request.getMenuIds() != null) {
            packageService.editWithMenus(request, request.getMenuIds());
        } else {
            super.edit(request);
        }
        return ApiResponse.success(null, "编辑成功");
    }
}
