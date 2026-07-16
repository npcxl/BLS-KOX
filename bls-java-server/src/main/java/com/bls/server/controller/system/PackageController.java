package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysPackage;
import com.bls.server.entity.SysPackageMenu;
import com.bls.server.mapper.SysPackageMapper;
import com.bls.server.mapper.SysPackageMenuMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "套餐管理")
@RestController
@RequestMapping("/api/system/package")
@RequiredArgsConstructor
public class PackageController {

    private final SysPackageMapper packageMapper;
    private final SysPackageMenuMapper packageMenuMapper;

    @Data
    public static class PkgQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

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

    @Data
    public static class PkgRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "套餐列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:package:list')")
    public ApiResponse<List<Map<String, Object>>> list(PkgQueryRequest request) {
        Page<SysPackage> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysPackage> wrapper = new LambdaQueryWrapper<>();

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.like(SysPackage::getPackageName, request.getKeyword());
        }

        IPage<SysPackage> result = packageMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(p -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("packageId", p.getPackageId());
            map.put("packageName", p.getPackageName());
            map.put("status", p.getStatus());
            map.put("createTime", p.getCreateTime());
            map.put("remark", p.getRemark());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "套餐选项")
    @GetMapping("/options")
    public ApiResponse<List<Map<String, Object>>> options() {
        List<SysPackage> pkgs = packageMapper.selectList(new LambdaQueryWrapper<SysPackage>()
                .eq(SysPackage::getStatus, "0"));
        List<Map<String, Object>> list = pkgs.stream().map(p -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("packageId", p.getPackageId());
            map.put("packageName", p.getPackageName());
            return map;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "套餐菜单")
    @GetMapping("/{packageId}/menus")
    public ApiResponse<List<String>> getMenus(@PathVariable String packageId) {
        List<SysPackageMenu> pms = packageMenuMapper.selectList(
                new LambdaQueryWrapper<SysPackageMenu>().eq(SysPackageMenu::getPackageId, packageId));
        return ApiResponse.success(pms.stream().map(SysPackageMenu::getMenuId).collect(Collectors.toList()));
    }

    @Operation(summary = "新增套餐")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:package:add')")
    @Transactional
    public ApiResponse<Void> add(@Valid @RequestBody PkgCreateRequest request) {
        SysPackage pkg = new SysPackage();
        pkg.setPackageName(request.getPackageName());
        pkg.setStatus(request.getStatus());
        pkg.setRemark(request.getRemark());
        packageMapper.insert(pkg);

        if (request.getMenuIds() != null) {
            for (String menuId : request.getMenuIds()) {
                SysPackageMenu pm = new SysPackageMenu();
                pm.setPackageId(pkg.getPackageId());
                pm.setMenuId(menuId);
                packageMenuMapper.insert(pm);
            }
        }
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑套餐")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:package:edit')")
    @Transactional
    public ApiResponse<Void> edit(@Valid @RequestBody PkgEditRequest request) {
        SysPackage pkg = packageMapper.selectById(request.getPackageId());
        if (pkg == null) throw AppException.notFound("套餐不存在");

        if (request.getPackageName() != null) pkg.setPackageName(request.getPackageName());
        if (request.getStatus() != null) pkg.setStatus(request.getStatus());
        if (request.getRemark() != null) pkg.setRemark(request.getRemark());
        packageMapper.updateById(pkg);

        if (request.getMenuIds() != null) {
            packageMenuMapper.delete(new LambdaQueryWrapper<SysPackageMenu>()
                    .eq(SysPackageMenu::getPackageId, request.getPackageId()));
            for (String menuId : request.getMenuIds()) {
                SysPackageMenu pm = new SysPackageMenu();
                pm.setPackageId(request.getPackageId());
                pm.setMenuId(menuId);
                packageMenuMapper.insert(pm);
            }
        }
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除套餐")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:package:remove')")
    @Transactional
    public ApiResponse<Void> remove(@Valid @RequestBody PkgRemoveRequest request) {
        for (String id : request.getIds()) {
            packageMapper.deleteById(id);
            packageMenuMapper.delete(new LambdaQueryWrapper<SysPackageMenu>()
                    .eq(SysPackageMenu::getPackageId, id));
        }
        return ApiResponse.success(null, "删除成功");
    }
}
