package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysStorageConfig;
import com.bls.server.mapper.SysStorageConfigMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "存储配置")
@RestController
@RequestMapping("/api/system/storage")
@RequiredArgsConstructor
public class StorageController {

    private final SysStorageConfigMapper storageConfigMapper;

    @Data
    public static class StorageCreateRequest {
        @NotBlank private String storageName;
        @NotBlank private String storageType;
        private String endpoint;
        private String region;
        private String accessKey;
        private String secretKey;
        private Integer port;
        private Integer useSsl = 0;
        private String publicBucket;
        private String privateBucket;
        private String publicBaseUrl;
        private Integer isDefault = 0;
    }

    @Data
    public static class StorageEditRequest {
        @NotBlank private String storageId;
        private String storageName;
        private String storageType;
        private String endpoint;
        private String region;
        private String accessKey;
        private String secretKey;
        private Integer port;
        private Integer useSsl;
        private String publicBucket;
        private String privateBucket;
        private String publicBaseUrl;
        private Integer isDefault;
        private String status;
    }

    @Data
    public static class StorageRemoveRequest {
        @NotEmpty private List<String> ids;
    }

    @Operation(summary = "存储配置列表")
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_system:storage:list')")
    public ApiResponse<List<Map<String, Object>>> list() {
        String tenantId = TenantContext.getTenantId();
        List<SysStorageConfig> configs = storageConfigMapper.selectList(
                new LambdaQueryWrapper<SysStorageConfig>()
                        .eq(SysStorageConfig::getTenantId, tenantId)
                        .eq(SysStorageConfig::getDeleted, 0));
        List<Map<String, Object>> list = configs.stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("storageId", c.getStorageId()); m.put("storageName", c.getStorageName());
            m.put("storageType", c.getStorageType()); m.put("endpoint", c.getEndpoint());
            m.put("isDefault", c.getIsDefault()); m.put("status", c.getStatus());
            m.put("createTime", c.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.success(list);
    }

    @Operation(summary = "新增存储配置")
    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_system:storage:add')")
    public ApiResponse<Void> add(@Valid @RequestBody StorageCreateRequest request) {
        String tenantId = TenantContext.getTenantId();
        SysStorageConfig config = new SysStorageConfig();
        config.setTenantId(tenantId);
        config.setStorageName(request.getStorageName());
        config.setStorageType(request.getStorageType());
        config.setEndpoint(request.getEndpoint());
        config.setRegion(request.getRegion());
        config.setAccessKey(request.getAccessKey());
        config.setSecretKey(request.getSecretKey());
        config.setPort(request.getPort());
        config.setUseSsl(request.getUseSsl());
        config.setPublicBucket(request.getPublicBucket());
        config.setPrivateBucket(request.getPrivateBucket());
        config.setPublicBaseUrl(request.getPublicBaseUrl());
        config.setIsDefault(request.getIsDefault());
        config.setStatus("0");
        storageConfigMapper.insert(config);
        return ApiResponse.success(null, "新增成功");
    }

    @Operation(summary = "编辑存储配置")
    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_system:storage:edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody StorageEditRequest request) {
        SysStorageConfig config = storageConfigMapper.selectById(request.getStorageId());
        if (config == null) throw AppException.notFound("配置不存在");
        if (request.getStorageName() != null) config.setStorageName(request.getStorageName());
        if (request.getStorageType() != null) config.setStorageType(request.getStorageType());
        if (request.getEndpoint() != null) config.setEndpoint(request.getEndpoint());
        if (request.getRegion() != null) config.setRegion(request.getRegion());
        if (request.getAccessKey() != null) config.setAccessKey(request.getAccessKey());
        if (request.getSecretKey() != null) config.setSecretKey(request.getSecretKey());
        if (request.getPort() != null) config.setPort(request.getPort());
        if (request.getUseSsl() != null) config.setUseSsl(request.getUseSsl());
        if (request.getPublicBucket() != null) config.setPublicBucket(request.getPublicBucket());
        if (request.getPrivateBucket() != null) config.setPrivateBucket(request.getPrivateBucket());
        if (request.getPublicBaseUrl() != null) config.setPublicBaseUrl(request.getPublicBaseUrl());
        if (request.getIsDefault() != null) config.setIsDefault(request.getIsDefault());
        if (request.getStatus() != null) config.setStatus(request.getStatus());
        storageConfigMapper.updateById(config);
        return ApiResponse.success(null, "编辑成功");
    }

    @Operation(summary = "删除存储配置")
    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_system:storage:remove')")
    public ApiResponse<Void> remove(@Valid @RequestBody StorageRemoveRequest request) {
        for (String id : request.getIds()) {
            SysStorageConfig config = storageConfigMapper.selectById(id);
            if (config != null) {
                config.setDeleted(1);
                storageConfigMapper.updateById(config);
            }
        }
        return ApiResponse.success(null, "删除成功");
    }
}
