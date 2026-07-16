package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysConfig;
import com.bls.server.mapper.SysConfigMapper;
import com.bls.server.security.TenantContext;
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

@Tag(name = "参数配置")
@RestController
@RequestMapping("/api/system/config")
@RequiredArgsConstructor
public class ConfigController {

    private final SysConfigMapper configMapper;

    @Data
    public static class ConfigQueryRequest {
        private Integer pageNum = 1;
        private Integer pageSize = 10;
        private String keyword;
    }

    @Data
    public static class ConfigCreateRequest {
        @NotBlank private String configName;
        @NotBlank private String configKey;
        @NotBlank private String configValue;
        private String configType = "Y";
        private String status = "0";
        private String remark;
    }

    @Data
    public static class ConfigEditRequest {
        @NotBlank private String configId;
        private String configName;
        private String configKey;
        private String configValue;
        private String configType;
        private String status;
        private String remark;
    }

    @Data
    public static class ConfigRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "配置列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:config:list')")
    public ApiResponse<List<Map<String, Object>>> list(ConfigQueryRequest request) {
        String tenantId = TenantContext.getTenantId();
        Page<SysConfig> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getTenantId, tenantId)
                .eq(SysConfig::getDeleted, 0);

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            wrapper.and(w -> w
                .like(SysConfig::getConfigName, request.getKeyword())
                .or().like(SysConfig::getConfigKey, request.getKeyword()));
        }

        IPage<SysConfig> result = configMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(c -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("configId", c.getConfigId());
            map.put("configName", c.getConfigName());
            map.put("configKey", c.getConfigKey());
            map.put("configValue", c.getConfigValue());
            map.put("configType", c.getConfigType());
            map.put("status", c.getStatus());
            map.put("createTime", c.getCreateTime());
            map.put("remark", c.getRemark());
            return map;
        }).collect(Collectors.toList());

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "根据Key获取配置")
    @GetMapping("/key/{configKey}")
    public ApiResponse<Map<String, Object>> getByKey(@PathVariable String configKey) {
        String tenantId = TenantContext.getTenantId();
        SysConfig config = configMapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getTenantId, tenantId)
                .eq(SysConfig::getConfigKey, configKey)
                .eq(SysConfig::getDeleted, 0));
        if (config == null) {
            return ApiResponse.success(null);
        }
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("configId", config.getConfigId());
        map.put("configKey", config.getConfigKey());
        map.put("configValue", config.getConfigValue());
        return ApiResponse.success(map);
    }

    @Operation(summary = "新增配置")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:config:add')")
    @Transactional
    public ApiResponse<Void> add(@Valid @RequestBody ConfigCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysConfig config = new SysConfig();
        config.setTenantId(tenantId);
        config.setConfigName(request.getConfigName());
        config.setConfigKey(request.getConfigKey());
        config.setConfigValue(request.getConfigValue());
        config.setConfigType(request.getConfigType());
        config.setStatus(request.getStatus());
        config.setRemark(request.getRemark());
        configMapper.insert(config);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑配置")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:config:edit')")
    @Transactional
    public ApiResponse<Void> edit(@Valid @RequestBody ConfigEditRequest request) {
        SysConfig config = configMapper.selectById(request.getConfigId());
        if (config == null) throw AppException.notFound("配置不存在");
        if (request.getConfigName() != null) config.setConfigName(request.getConfigName());
        if (request.getConfigKey() != null) config.setConfigKey(request.getConfigKey());
        if (request.getConfigValue() != null) config.setConfigValue(request.getConfigValue());
        if (request.getConfigType() != null) config.setConfigType(request.getConfigType());
        if (request.getStatus() != null) config.setStatus(request.getStatus());
        if (request.getRemark() != null) config.setRemark(request.getRemark());
        configMapper.updateById(config);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除配置")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:config:remove')")
    @Transactional
    public ApiResponse<Void> remove(@Valid @RequestBody ConfigRemoveRequest request) {
        for (String id : request.getIds()) {
            SysConfig config = configMapper.selectById(id);
            if (config != null) {
                config.setDeleted(1);
                configMapper.updateById(config);
            }
        }
        return ApiResponse.success(null, "删除成功");
    }
}
