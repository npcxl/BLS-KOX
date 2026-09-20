package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.entity.SysPageColumnConfig;
import com.bls.server.entity.SysPageConfig;
import com.bls.server.mapper.SysPageColumnConfigMapper;
import com.bls.server.mapper.SysPageConfigMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "页面配置")
@RestController
@RequestMapping("/api/system/page-config")
@RequiredArgsConstructor
public class PageConfigController {

    private final SysPageConfigMapper pageConfigMapper;
    private final SysPageColumnConfigMapper columnConfigMapper;

    /**
     * 租户上下文必须由认证态提供（fail-closed）。
     * 匿名请求不再回退平台租户，避免匿名写入/覆盖平台配置。
     */
    private String requireTenant() {
        String t = TenantContext.getTenantId();
        if (t == null || t.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "缺少租户上下文");
        }
        return t;
    }

    @Data
    public static class ColumnConfigItem {
        private String columnId;
        @NotBlank private String dataIndex;
        @NotBlank private String title;
        private Integer orderNum = 0;
        private Integer visible = 1;
        private Integer searchable = 0;
        private Integer editable = 0;
        private Integer copyable = 0;
        private Integer ellipsis = 0;
        private String valueType;
        private String valueEnumCode;
        private String placeholder;
        private Integer required = 0;
    }

    @Data
    public static class PageConfigSaveRequest {
        @NotBlank private String pageCode;
        @NotBlank private String pageName;
        private Integer enabled = 1;
        private Integer sort = 0;
        private String remark;
        private List<ColumnConfigItem> columns;
    }

    @Operation(summary = "页面配置列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:pageconfig:list')")
    public ApiResponse<List<Map<String, Object>>> list() {
        List<SysPageConfig> configs = pageConfigMapper.selectList(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getTenantId, requireTenant())
                        .eq(SysPageConfig::getDeleted, 0));
        List<Map<String, Object>> list = configs.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("pageConfigId", c.getPageConfigId()); m.put("pageCode", c.getPageCode());
            m.put("pageName", c.getPageName()); m.put("enabled", c.getEnabled());
            m.put("sort", c.getSort());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "获取页面配置")
    @GetMapping("/page/{pageCode}")
    public ApiResponse<Map<String, Object>> getPage(@PathVariable String pageCode) {
        SysPageConfig config = pageConfigMapper.selectOne(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getPageCode, pageCode)
                        .eq(SysPageConfig::getTenantId, requireTenant())
                        .eq(SysPageConfig::getDeleted, 0));
        if (config == null) return ApiResponse.success(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pageConfigId", config.getPageConfigId()); m.put("pageCode", config.getPageCode());
        m.put("pageName", config.getPageName()); m.put("enabled", config.getEnabled());
        m.put("sort", config.getSort());
        return ApiResponse.success(m);
    }

    @Operation(summary = "获取页面列配置")
    @GetMapping("/page/{pageCode}/columns")
    public ApiResponse<List<Map<String, Object>>> getColumns(@PathVariable String pageCode) {
        List<SysPageColumnConfig> columns = columnConfigMapper.selectList(
                new LambdaQueryWrapper<SysPageColumnConfig>()
                        .eq(SysPageColumnConfig::getPageCode, pageCode)
                        .eq(SysPageColumnConfig::getTenantId, requireTenant())
                        .eq(SysPageColumnConfig::getDeleted, 0)
                        .orderByAsc(SysPageColumnConfig::getOrderNum));
        List<Map<String, Object>> list = columns.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("columnId", c.getColumnId()); m.put("dataIndex", c.getDataIndex());
            m.put("title", c.getTitle()); m.put("orderNum", c.getOrderNum());
            m.put("visible", c.getVisible()); m.put("searchable", c.getSearchable());
            m.put("editable", c.getEditable()); m.put("valueType", c.getValueType());
            m.put("valueEnumCode", c.getValueEnumCode());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "保存页面配置")
    @PostMapping("/save")
    @Transactional
    @PreAuthorize("hasAuthority('PERM_system:pageconfig:edit')")
    public ApiResponse<Void> save(@Valid @RequestBody PageConfigSaveRequest request) {
        String tenantId = requireTenant();

        // 校验：禁止重复 dataIndex（与 Koa 保持一致）
        if (request.getColumns() != null) {
            Set<String> seen = new HashSet<>();
            for (ColumnConfigItem item : request.getColumns()) {
                String key = item.getDataIndex().trim().toLowerCase();
                if (!seen.add(key)) {
                    return ApiResponse.error(400, "列标识重复：" + item.getDataIndex());
                }
                if (item.getOrderNum() != null && item.getOrderNum() < 0) {
                    return ApiResponse.error(400, "orderNum 非法");
                }
            }
        }

        SysPageConfig config = pageConfigMapper.selectOne(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getPageCode, request.getPageCode())
                        .eq(SysPageConfig::getTenantId, tenantId)
                        .eq(SysPageConfig::getDeleted, 0));
        if (config == null) {
            config = new SysPageConfig();
            config.setTenantId(tenantId);
        }
        config.setPageCode(request.getPageCode());
        config.setPageName(request.getPageName());
        config.setEnabled(request.getEnabled());
        config.setSort(request.getSort());
        config.setRemark(request.getRemark());
        if (config.getPageConfigId() == null) {
            pageConfigMapper.insert(config);
        } else {
            pageConfigMapper.updateById(config);
        }

        if (request.getColumns() != null) {
            // 关键修复：必须限定 tenant_id，否则会删除其他租户的列配置
            columnConfigMapper.delete(new LambdaQueryWrapper<SysPageColumnConfig>()
                    .eq(SysPageColumnConfig::getPageCode, request.getPageCode())
                    .eq(SysPageColumnConfig::getTenantId, tenantId));
            for (ColumnConfigItem item : request.getColumns()) {
                SysPageColumnConfig col = new SysPageColumnConfig();
                col.setPageCode(request.getPageCode());
                col.setDataIndex(item.getDataIndex());
                col.setTitle(item.getTitle());
                col.setOrderNum(item.getOrderNum());
                col.setVisible(item.getVisible());
                col.setSearchable(item.getSearchable());
                col.setEditable(item.getEditable());
                col.setCopyable(item.getCopyable());
                col.setEllipsis(item.getEllipsis());
                col.setValueType(item.getValueType());
                col.setValueEnumCode(item.getValueEnumCode());
                col.setPlaceholder(item.getPlaceholder());
                col.setRequired(item.getRequired());
                col.setTenantId(tenantId);
                columnConfigMapper.insert(col);
            }
        }
        return ApiResponse.success(null, "保存成功");
    }

    @Operation(summary = "删除页面配置")
    @DeleteMapping("/page/{pageCode}")
    @Transactional
    @PreAuthorize("hasAuthority('PERM_system:pageconfig:remove')")
    public ApiResponse<Void> deletePage(@PathVariable String pageCode) {
        String tenantId = requireTenant();
        SysPageConfig config = pageConfigMapper.selectOne(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getPageCode, pageCode)
                        .eq(SysPageConfig::getTenantId, tenantId)
                        .eq(SysPageConfig::getDeleted, 0));
        if (config == null) {
            return ApiResponse.error(404, "资源不存在");
        }
        config.setDeleted(1);
        pageConfigMapper.updateById(config);
        // 关键修复：必须限定 tenant_id，否则会删除其他租户的列配置
        columnConfigMapper.delete(new LambdaQueryWrapper<SysPageColumnConfig>()
                .eq(SysPageColumnConfig::getPageCode, pageCode)
                .eq(SysPageColumnConfig::getTenantId, tenantId));
        return ApiResponse.success(null, "删除成功");
    }
}
