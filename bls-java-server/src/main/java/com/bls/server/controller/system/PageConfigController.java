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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "页面配置")
@RestController
@RequestMapping("/api/system/page-config")
@RequiredArgsConstructor
public class PageConfigController {

    private final SysPageConfigMapper pageConfigMapper;
    private final SysPageColumnConfigMapper columnConfigMapper;

    /** Fallback to platform tenant when no auth context (public endpoints) */
    private String tid() {
        String t = TenantContext.getTenantId();
        return t != null ? t : "000000";
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
    public ApiResponse<List<Map<String, Object>>> list() {
        List<SysPageConfig> configs = pageConfigMapper.selectList(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getTenantId, tid())
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
                        .eq(SysPageConfig::getTenantId, tid())
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
                        .eq(SysPageColumnConfig::getTenantId, tid())
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
    public ApiResponse<Void> save(@Valid @RequestBody PageConfigSaveRequest request) {
        String tenantId = tid();
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
            columnConfigMapper.delete(new LambdaQueryWrapper<SysPageColumnConfig>()
                    .eq(SysPageColumnConfig::getPageCode, request.getPageCode()));
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
    public ApiResponse<Void> deletePage(@PathVariable String pageCode) {
        SysPageConfig config = pageConfigMapper.selectOne(
                new LambdaQueryWrapper<SysPageConfig>()
                        .eq(SysPageConfig::getPageCode, pageCode)
                        .eq(SysPageConfig::getTenantId, tid()));
        if (config != null) {
            config.setDeleted(1);
            pageConfigMapper.updateById(config);
            columnConfigMapper.delete(new LambdaQueryWrapper<SysPageColumnConfig>()
                    .eq(SysPageColumnConfig::getPageCode, pageCode));
        }
        return ApiResponse.success(null, "删除成功");
    }
}
