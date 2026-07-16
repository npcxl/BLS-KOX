package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysGlobalSearchConfig;
import com.bls.server.mapper.SysGlobalSearchConfigMapper;
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

@Tag(name = "全局搜索")
@RestController
@RequestMapping("/api/system/global-search")
@RequiredArgsConstructor
public class GlobalSearchController {

    private final SysGlobalSearchConfigMapper configMapper;

    @Data
    public static class ConfigSaveRequest {
        private String searchId;
        @NotBlank private String moduleKey;
        @NotBlank private String moduleName;
        @NotBlank private String permission;
        private String routePath;
        private String sourceTable;
        private String bizIdField;
        private String titleField;
        private String subtitleField;
        private String contentFields;
        private Integer enabled = 1;
        private Integer sort = 0;
    }

    @Operation(summary = "全局搜索")
    @GetMapping("/search")
    @PreAuthorize("hasAuthority('PERM_system:user:search')")
    public ApiResponse<List<Map<String, Object>>> search(@RequestParam String keyword) {
        // Placeholder - real impl would query sys_search_index table
        return ApiResponse.success(Collections.emptyList());
    }

    @Operation(summary = "搜索配置列表")
    @GetMapping("/config/list")
    @PreAuthorize("hasAuthority('PERM_system:global-search:config:list')")
    public ApiResponse<List<Map<String, Object>>> configList() {
        List<SysGlobalSearchConfig> configs = configMapper.selectList(
                new LambdaQueryWrapper<SysGlobalSearchConfig>().eq(SysGlobalSearchConfig::getDeleted, 0));
        List<Map<String, Object>> list = configs.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("searchId", c.getSearchId()); m.put("moduleKey", c.getModuleKey());
            m.put("moduleName", c.getModuleName()); m.put("permission", c.getPermission());
            m.put("routePath", c.getRoutePath()); m.put("sourceTable", c.getSourceTable());
            m.put("enabled", c.getEnabled()); m.put("sort", c.getSort());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "保存搜索配置")
    @PostMapping("/config/save")
    @PreAuthorize("hasAuthority('PERM_system:global-search:config:save')")
    public ApiResponse<Void> saveConfig(@Valid @RequestBody ConfigSaveRequest request) {
        SysGlobalSearchConfig config;
        if (request.getSearchId() != null) {
            config = configMapper.selectById(request.getSearchId());
            if (config == null) throw AppException.notFound("配置不存在");
        } else {
            config = new SysGlobalSearchConfig();
        }
        config.setModuleKey(request.getModuleKey());
        config.setModuleName(request.getModuleName());
        config.setPermission(request.getPermission());
        config.setRoutePath(request.getRoutePath());
        config.setSourceTable(request.getSourceTable());
        config.setBizIdField(request.getBizIdField());
        config.setTitleField(request.getTitleField());
        config.setSubtitleField(request.getSubtitleField());
        config.setContentFields(request.getContentFields());
        config.setEnabled(request.getEnabled());
        config.setSort(request.getSort());
        if (request.getSearchId() != null) {
            configMapper.updateById(config);
        } else {
            configMapper.insert(config);
        }
        return ApiResponse.success(null, "保存成功");
    }

    @Operation(summary = "删除搜索配置")
    @DeleteMapping("/config/{id}")
    @PreAuthorize("hasAuthority('PERM_system:global-search:config:delete')")
    public ApiResponse<Void> deleteConfig(@PathVariable String id) {
        SysGlobalSearchConfig config = configMapper.selectById(id);
        if (config != null) {
            config.setDeleted(1);
            configMapper.updateById(config);
        }
        return ApiResponse.success(null, "删除成功");
    }

    @Operation(summary = "已启用模块列表")
    @GetMapping("/index/modules")
    public ApiResponse<List<Map<String, Object>>> indexModules() {
        List<SysGlobalSearchConfig> configs = configMapper.selectList(
                new LambdaQueryWrapper<SysGlobalSearchConfig>()
                        .eq(SysGlobalSearchConfig::getEnabled, 1)
                        .eq(SysGlobalSearchConfig::getDeleted, 0));
        List<Map<String, Object>> list = configs.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("moduleKey", c.getModuleKey());
            m.put("moduleName", c.getModuleName());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "重建搜索索引")
    @PostMapping("/index/rebuild")
    @PreAuthorize("hasAuthority('PERM_system:search-index:rebuild')")
    public ApiResponse<Void> rebuildIndex(@RequestBody(required = false) Map<String, Object> body) {
        // Placeholder — Koa does a full index rebuild from enabled modules
        return ApiResponse.success(null, "索引重建已提交");
    }
}
