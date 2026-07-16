package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.core.BaseCrudController;
import com.bls.server.distributed.idempotent.Idempotent;
import com.bls.server.distributed.lock.DistributedLock;
import com.bls.server.entity.SysRole;
import com.bls.server.service.system.RoleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "角色管理")
@RestController
@RequestMapping("/api/system/role")
public class RoleController extends BaseCrudController<SysRole, RoleController.RoleCreateRequest, RoleController.RoleEditRequest> {

    private final RoleService roleService;

    public RoleController(RoleService svc) {
        super(svc);
        this.roleService = svc;
    }

    @Override protected String getPermPrefix() { return "system:role"; }

    @Override @GetMapping("/list") @PreAuthorize("hasAuthority('PERM_system:role:list')")
    public ApiResponse<List<Map<String, Object>>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize, @RequestParam(required = false) String keyword) { return super.list(pageNum, pageSize, keyword); }
    @Override @DistributedLock(key = "role:remove", waitTime = 5, leaseTime = 15) @DeleteMapping("/remove") @PreAuthorize("hasAuthority('PERM_system:role:remove')")
    public ApiResponse<Void> remove(@RequestBody List<String> ids) { return super.remove(ids); }

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
    public static class AssignMenuRequest {
        @NotEmpty private List<String> menuIds;
    }

    // ========== 自定义端点 ==========

    @Operation(summary = "角色菜单权限")
    @GetMapping("/{roleId}/menus")
    @PreAuthorize("hasAuthority('PERM_system:role:list')")
    public ApiResponse<List<String>> getMenus(@PathVariable String roleId) {
        return ApiResponse.success(roleService.getRoleMenuIds(roleId));
    }

    @Override
    @Idempotent(prefix = "role:add:")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:role:add')")
    public ApiResponse<Void> add(@Valid @RequestBody RoleCreateRequest request) {
        if (request.getMenuIds() != null) {
            roleService.addWithMenus(request, request.getMenuIds());
        } else {
            super.add(request);
        }
        return ApiResponse.success(null, "新增成功");
    }

    @Override
    @DistributedLock(key = "role:edit:#{#request.roleId}", waitTime = 3, leaseTime = 10)
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:role:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody RoleEditRequest request) {
        if (request.getMenuIds() != null) {
            roleService.editWithMenus(request, request.getMenuIds());
        } else {
            super.edit(request);
        }
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "分配菜单权限")
    @DistributedLock(key = "role:assignMenu:#{#roleId}", waitTime = 3, leaseTime = 10)
    @PutMapping("/{roleId}/menus")
    @PreAuthorize("hasAuthority('PERM_system:role:assignMenu')")
    public ApiResponse<Void> assignMenu(@PathVariable String roleId, @Valid @RequestBody AssignMenuRequest request) {
        roleService.assignMenus(roleId, request.getMenuIds());
        return ApiResponse.success(null, "分配成功");
    }
}
