package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.entity.SysThemeConfig;
import com.bls.server.mapper.SysThemeConfigMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Tag(name = "主题配置")
@RestController
@RequestMapping("/api/system/theme")
@RequiredArgsConstructor
public class ThemeController {

    private final SysThemeConfigMapper themeConfigMapper;

    @Data
    public static class ThemeEditRequest {
        private String themeId;
        private String navTheme;
        private String colorPrimary;
        private String layout;
        private String contentWidth;
        private Integer fixedHeader;
        private Integer fixSiderbar;
        private Integer colorWeak;
        private Integer splitMenus;
        private String siderMenuType;
        private String title;
        private String logo;
        private String tokenJson;
        private String status;
        private String remark;
        private String iconfontUrl;
    }

    @Operation(summary = "当前主题（Koa兼容）")
    @GetMapping("/current")
    public ApiResponse<Map<String, Object>> current() {
        return getThemeAsMap();
    }

    @Operation(summary = "获取当前主题列表（CrudTablePage兼容）")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:theme:list')")
    public ApiResponse<List<Map<String, Object>>> list(
            @RequestParam(required = false, defaultValue = "1") Integer pageNum,
            @RequestParam(required = false, defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = "000000";

        Page<SysThemeConfig> page = new Page<>(pageNum, pageSize);
        IPage<SysThemeConfig> result = themeConfigMapper.selectPage(page,
                new LambdaQueryWrapper<SysThemeConfig>()
                        .eq(SysThemeConfig::getTenantId, tenantId)
                        .eq(SysThemeConfig::getDeleted, 0)
                        .orderByDesc(SysThemeConfig::getCreateTime));

        List<Map<String, Object>> list = result.getRecords().stream().map(config -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("themeId", config.getThemeId());
            m.put("navTheme", config.getNavTheme());
            m.put("colorPrimary", config.getColorPrimary());
            m.put("layout", config.getLayout());
            m.put("contentWidth", config.getContentWidth());
            m.put("fixedHeader", config.getFixedHeader());
            m.put("fixSiderbar", config.getFixSiderbar());
            m.put("colorWeak", config.getColorWeak());
            m.put("splitMenus", config.getSplitMenus());
            m.put("siderMenuType", config.getSiderMenuType());
            m.put("title", config.getTitle());
            m.put("logo", config.getLogo());
            m.put("tokenJson", config.getTokenJson());
            m.put("status", config.getStatus());
            m.put("createTime", config.getCreateTime());
            return m;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    private ApiResponse<Map<String, Object>> getThemeAsMap() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = "000000";
        SysThemeConfig config = themeConfigMapper.selectOne(
                new LambdaQueryWrapper<SysThemeConfig>()
                        .eq(SysThemeConfig::getTenantId, tenantId)
                        .eq(SysThemeConfig::getStatus, "0")
                        .eq(SysThemeConfig::getDeleted, 0));
        if (config == null) {
            Map<String, Object> defaults = new LinkedHashMap<>();
            defaults.put("navTheme", "light"); defaults.put("colorPrimary", "#1677ff");
            defaults.put("layout", "mix"); defaults.put("contentWidth", "Fluid");
            defaults.put("fixedHeader", 0); defaults.put("fixSiderbar", 1);
            defaults.put("siderMenuType", "sub");
            return ApiResponse.success(defaults);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("themeId", config.getThemeId()); m.put("navTheme", config.getNavTheme());
        m.put("colorPrimary", config.getColorPrimary()); m.put("layout", config.getLayout());
        m.put("contentWidth", config.getContentWidth()); m.put("fixedHeader", config.getFixedHeader());
        m.put("fixSiderbar", config.getFixSiderbar()); m.put("colorWeak", config.getColorWeak());
        m.put("splitMenus", config.getSplitMenus()); m.put("siderMenuType", config.getSiderMenuType());
        m.put("title", config.getTitle()); m.put("logo", config.getLogo());
        m.put("tokenJson", config.getTokenJson());
        return ApiResponse.success(m);
    }

    @Operation(summary = "修改主题配置")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:theme:edit')")
    public ApiResponse<Void> editTheme(@Valid @RequestBody ThemeEditRequest request) {
        String tenantId = TenantContext.getTenantId();

        // 优先通过 themeId 查找，其次通过 tenantId
        SysThemeConfig config = null;
        if (request.getThemeId() != null && !request.getThemeId().isEmpty()) {
            config = themeConfigMapper.selectOne(
                    new LambdaQueryWrapper<SysThemeConfig>()
                            .eq(SysThemeConfig::getThemeId, request.getThemeId())
                            .eq(SysThemeConfig::getDeleted, 0));
        }
        if (config == null) {
            config = themeConfigMapper.selectOne(
                    new LambdaQueryWrapper<SysThemeConfig>()
                            .eq(SysThemeConfig::getTenantId, tenantId)
                            .eq(SysThemeConfig::getDeleted, 0));
        }
        if (config == null) {
            config = new SysThemeConfig();
            config.setTenantId(tenantId);
            config.setStatus("0");
        }
        if (request.getNavTheme() != null) config.setNavTheme(request.getNavTheme());
        if (request.getColorPrimary() != null) config.setColorPrimary(request.getColorPrimary());
        if (request.getLayout() != null) config.setLayout(request.getLayout());
        if (request.getContentWidth() != null) config.setContentWidth(request.getContentWidth());
        if (request.getFixedHeader() != null) config.setFixedHeader(request.getFixedHeader());
        if (request.getFixSiderbar() != null) config.setFixSiderbar(request.getFixSiderbar());
        if (request.getColorWeak() != null) config.setColorWeak(request.getColorWeak());
        if (request.getSplitMenus() != null) config.setSplitMenus(request.getSplitMenus());
        if (request.getSiderMenuType() != null) config.setSiderMenuType(request.getSiderMenuType());
        if (request.getTitle() != null) config.setTitle(request.getTitle());
        if (request.getLogo() != null) config.setLogo(request.getLogo());
        if (request.getTokenJson() != null) config.setTokenJson(request.getTokenJson());
        if (request.getStatus() != null) config.setStatus(request.getStatus());
        if (request.getIconfontUrl() != null) config.setIconfontUrl(request.getIconfontUrl());
        if (config.getThemeId() == null) {
            themeConfigMapper.insert(config);
        } else {
            themeConfigMapper.updateById(config);
        }
        return ApiResponse.success(null, "修改成功");
    }

    @Operation(summary = "删除主题配置")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:theme:remove')")
    public ApiResponse<Void> remove(@RequestParam(required = false) String ids,
                                     @RequestBody(required = false) Map<String, Object> body) {
        String idsStr = ids;
        if (idsStr == null && body != null && body.containsKey("ids")) {
            Object idsObj = body.get("ids");
            if (idsObj instanceof List<?> list) {
                idsStr = list.stream().map(String::valueOf).collect(Collectors.joining(","));
            } else {
                idsStr = String.valueOf(idsObj);
            }
        }
        if (idsStr == null || idsStr.isEmpty()) {
            return ApiResponse.error(400, "ids不能为空");
        }
        String[] idArray = idsStr.split(",");
        for (String id : idArray) {
            themeConfigMapper.delete(new LambdaQueryWrapper<SysThemeConfig>()
                    .eq(SysThemeConfig::getThemeId, id.trim()));
        }
        return ApiResponse.success(null, "删除成功");
    }
}
