package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.service.system.RoleService;
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

@Tag(name = "角色管理")
@RestController
@RequestMapping("/api/system/role")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @Data
    public static class RoleQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

    @Data
    public static class RoleCreateRequest {
        @NotBlank private String roleName;
        @NotBlank private String roleKey;
        private String dataScope = "SELF";
        private String status = "0";
        private String remark;
        private List<String> menuIds;
    }

    @Data
    public static class RoleEditRequest {
        @NotBlank private String roleId;
        private String roleName;
        private String roleKey;
        private String dataScope;
        private String status;
        private String remark;
        private List<String> menuIds;
    }

    @Data
    public static class RoleRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Data
    public static class AssignMenuRequest {
        @NotEmpty private List<String> menuIds;
    }

    @Operation(summary = "角色列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:role:list')")
    public ApiResponse<List<Map<String, Object>>> list(RoleQueryRequest request) {
        return roleService.listRoles(request);
    }

    @Operation(summary = "角色菜单权限")
    @GetMapping("/{roleId}/menus")
    @PreAuthorize("hasAuthority('PERM_system:role:list')")
    public ApiResponse<List<String>> getMenus(@PathVariable String roleId) {
        return ApiResponse.success(roleService.getRoleMenuIds(roleId));
    }

    @Operation(summary = "新增角色")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:role:add')")
    public ApiResponse<Void> add(@Valid @RequestBody RoleCreateRequest request) {
        roleService.addRole(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑角色")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:role:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody RoleEditRequest request) {
        roleService.editRole(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "分配菜单权限")
    @PutMapping("/{roleId}/menus")
    @PreAuthorize("hasAuthority('PERM_system:role:assignMenu')")
    public ApiResponse<Void> assignMenu(@PathVariable String roleId,
                                         @Valid @RequestBody AssignMenuRequest request) {
        roleService.assignMenus(roleId, request.getMenuIds());
        return ApiResponse.success(null, "分配成功");
    }

    @Operation(summary = "删除角色")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:role:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody RoleRemoveRequest request) {
        roleService.removeRoles(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }
}
