package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.distributed.idempotent.Idempotent;
import com.bls.server.distributed.lock.DistributedLock;
import com.bls.server.service.system.MenuService;
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

@Tag(name = "菜单管理")
@RestController
@RequestMapping("/api/system/menu")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    @Data
    public static class MenuCreateRequest {
        private String parentId = "0";
        @NotBlank private String menuName;
        @NotBlank private String menuType;
        private String path;
        private String component;
        private String icon;
        private String perms;
        private Integer sortNum = 0;
        private String status = "0";
        private Integer isCache = 0;
        private Integer isFrame = 0;
        private Integer visible = 1;
    }

    @Data
    public static class MenuEditRequest {
        @NotBlank private String menuId;
        private String parentId;
        private String menuName;
        private String menuType;
        private String path;
        private String component;
        private String icon;
        private String perms;
        private Integer sortNum;
        private String status;
        private Integer isCache;
        private Integer isFrame;
        private Integer visible;
    }

    @Data
    public static class MenuRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "菜单列表（树形）")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:menu:list')")
    public ApiResponse<List<Map<String, Object>>> list(@RequestParam(required = false) String keyword) {
        return ApiResponse.success(menuService.getMenuTree(keyword));
    }

    @Operation(summary = "套餐配置用菜单树")
    @GetMapping("/package-tree")
    public ApiResponse<List<Map<String, Object>>> packageTree() {
        return ApiResponse.success(menuService.getMenuTree(null));
    }

    @Operation(summary = "新增菜单")
    @Idempotent(prefix = "menu:add:")
    @DistributedLock(key = "menu:write", waitTime = 5, leaseTime = 15)
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:menu:add')")
    public ApiResponse<Void> add(@Valid @RequestBody MenuCreateRequest request) {
        menuService.addMenu(request);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑菜单")
    @DistributedLock(key = "menu:write", waitTime = 5, leaseTime = 15)
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:menu:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody MenuEditRequest request) {
        menuService.editMenu(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除菜单")
    @DistributedLock(key = "menu:write", waitTime = 5, leaseTime = 15)
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:menu:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody MenuRemoveRequest request) {
        menuService.removeMenus(request.getIds());
        return ApiResponse.success(null, "删除成功");
    }
}
