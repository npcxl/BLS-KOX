package com.bls.server.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.distributed.lock.DistributedLock;
import com.bls.server.distributed.ratelimit.RateLimit;
import com.bls.server.entity.SysFile;
import com.bls.server.entity.SysStorageConfig;
import com.bls.server.mapper.SysFileMapper;
import com.bls.server.mapper.SysStorageConfigMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Tag(name = "存储配置与文件管理")
@RestController
@RequestMapping("/api/system/storage")
@RequiredArgsConstructor
public class StorageController {

    private final SysStorageConfigMapper storageConfigMapper;
    private final SysFileMapper fileMapper;

    // ========== 存储配置 ==========

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
        private String status = "0";
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
        config.setStatus(request.getStatus() != null ? request.getStatus() : "0");
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

    // ========== 文件上传 ==========

    @Operation(summary = "文件上传")
    @RateLimit(key = "storage:upload", limit = 30, windowSeconds = 60)
    @DistributedLock(key = "storage:upload:#{#moduleName}:#{#accessType}", waitTime = 5, leaseTime = 30)
    @PostMapping("/upload")
    @PreAuthorize("hasAuthority('PERM_system:file:upload')")
    public ApiResponse<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "private") String accessType,
            @RequestParam(required = false, defaultValue = "common") String moduleName) {
        String tenantId = TenantContext.getTenantId();
        String userId = TenantContext.getUserId();

        if (file.isEmpty()) throw AppException.badRequest("请选择文件");

        String originalName = file.getOriginalFilename();
        String ext = "";
        if (originalName != null && originalName.contains(".")) {
            ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
        }

        // Use user.dir as base path (cross-platform safe)
        String userDir = System.getProperty("user.dir");
        Path dirPath = Paths.get(userDir, "uploads", tenantId, moduleName);
        String uuid = UUID.randomUUID().toString();
        String fileName = ext.isEmpty() ? uuid : uuid + "." + ext;
        String objectName = moduleName + "/" + fileName;
        Path filePath = dirPath.resolve(fileName);

        try {
            Files.createDirectories(dirPath);
            Files.copy(file.getInputStream(), filePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error("File upload failed, path={}", filePath, e);
            throw AppException.internal("文件上传失败");
        }

        // Query default storage config
        SysStorageConfig storageCfg = storageConfigMapper.selectOne(
                new LambdaQueryWrapper<SysStorageConfig>()
                        .eq(SysStorageConfig::getTenantId, tenantId)
                        .eq(SysStorageConfig::getDeleted, 0)
                        .last("limit 1"));
        String storageId = storageCfg != null ? storageCfg.getStorageId() : "local";
        String bucketName = "private".equals(accessType)
                ? (storageCfg != null && storageCfg.getPrivateBucket() != null ? storageCfg.getPrivateBucket() : "private-assets")
                : (storageCfg != null && storageCfg.getPublicBucket() != null ? storageCfg.getPublicBucket() : "public-assets");

        SysFile sysFile = new SysFile();
        sysFile.setTenantId(tenantId);
        sysFile.setStorageId(storageId);
        sysFile.setBucketName(bucketName);
        sysFile.setObjectName(objectName);
        sysFile.setOriginalName(originalName);
        sysFile.setFileName(fileName);
        sysFile.setFileExt(ext);
        sysFile.setMimeType(file.getContentType());
        sysFile.setFileSize(file.getSize());
        sysFile.setAccessType(accessType);
        sysFile.setModuleName(moduleName);
        sysFile.setCreateBy(userId);
        fileMapper.insert(sysFile);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fileId", sysFile.getFileId());
        result.put("url", sysFile.getUrl());
        result.put("bucketName", bucketName);
        result.put("objectName", objectName);
        result.put("originalName", originalName);
        result.put("fileName", fileName);
        result.put("fileSize", file.getSize());
        return ApiResponse.success(result, "上传成功");
    }

    // ========== 文件列表 ==========

    @Operation(summary = "文件列表")
    @GetMapping("/files")
    @PreAuthorize("hasAuthority('PERM_system:file:list')")
    public ApiResponse<List<Map<String, Object>>> files(
            @RequestParam(required = false) String originalName,
            @RequestParam(required = false) String moduleName,
            @RequestParam(required = false) String accessType,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();
        Page<SysFile> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getTenantId, tenantId)
                .eq(SysFile::getDeleted, 0);

        if (originalName != null) wrapper.like(SysFile::getOriginalName, originalName);
        if (moduleName != null) wrapper.like(SysFile::getModuleName, moduleName);
        if (accessType != null) wrapper.eq(SysFile::getAccessType, accessType);

        wrapper.orderByDesc(SysFile::getCreateTime);
        IPage<SysFile> result = fileMapper.selectPage(page, wrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("fileId", f.getFileId());
            m.put("originalName", f.getOriginalName());
            m.put("fileName", f.getFileName());
            m.put("fileExt", f.getFileExt());
            m.put("mimeType", f.getMimeType());
            m.put("fileSize", f.getFileSize());
            m.put("accessType", f.getAccessType());
            m.put("moduleName", f.getModuleName());
            m.put("url", f.getUrl());
            m.put("bucketName", f.getBucketName());
            m.put("objectName", f.getObjectName());
            m.put("storageId", f.getStorageId());
            m.put("createTime", f.getCreateTime());
            return m;
        }).collect(Collectors.toList());
        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    // ========== 文件操作 ==========

    @Operation(summary = "删除文件")
    @DeleteMapping("/file/{fileId}")
    @PreAuthorize("hasAuthority('PERM_system:file:remove')")
    public ApiResponse<Void> deleteFile(@PathVariable String fileId) {
        String tenantId = TenantContext.getTenantId();
        SysFile sysFile = fileMapper.selectOne(
                new LambdaQueryWrapper<SysFile>()
                        .eq(SysFile::getFileId, fileId)
                        .eq(SysFile::getTenantId, tenantId));
        if (sysFile != null) {
            sysFile.setDeleted(1);
            fileMapper.updateById(sysFile);
        }
        return ApiResponse.success(null, "删除成功");
    }

    @Operation(summary = "获取文件信息（含 URL）")
    @GetMapping("/file/{fileId}/url")
    @PreAuthorize("hasAuthority('PERM_system:file:download')")
    public ApiResponse<Map<String, Object>> fileUrl(@PathVariable String fileId) {
        String tenantId = TenantContext.getTenantId();
        SysFile sysFile = fileMapper.selectOne(
                new LambdaQueryWrapper<SysFile>()
                        .eq(SysFile::getFileId, fileId)
                        .eq(SysFile::getTenantId, tenantId)
                        .eq(SysFile::getDeleted, 0));
        if (sysFile == null) return ApiResponse.success(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fileId", sysFile.getFileId());
        m.put("originalName", sysFile.getOriginalName());
        m.put("url", sysFile.getUrl());
        m.put("fileName", sysFile.getFileName());
        m.put("fileSize", sysFile.getFileSize());
        return ApiResponse.success(m);
    }

    @Operation(summary = "文件下载信息")
    @GetMapping("/file/{fileId}/download")
    @PreAuthorize("hasAuthority('PERM_system:file:download')")
    public ApiResponse<Map<String, Object>> fileDownload(@PathVariable String fileId) {
        String tenantId = TenantContext.getTenantId();
        SysFile sysFile = fileMapper.selectOne(
                new LambdaQueryWrapper<SysFile>()
                        .eq(SysFile::getFileId, fileId)
                        .eq(SysFile::getTenantId, tenantId)
                        .eq(SysFile::getDeleted, 0));
        if (sysFile == null) return ApiResponse.success(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fileId", sysFile.getFileId());
        m.put("originalName", sysFile.getOriginalName());
        m.put("url", sysFile.getUrl());
        m.put("fileName", sysFile.getFileName());
        m.put("fileSize", sysFile.getFileSize());
        return ApiResponse.success(m);
    }
}
