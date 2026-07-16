package com.bls.server.controller.system;

import com.bls.server.common.ApiResponse;
import com.bls.server.common.AppException;
import com.bls.server.entity.SysFile;
import com.bls.server.mapper.SysFileMapper;
import com.bls.server.security.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Slf4j
@Tag(name = "文件管理")
@RestController
@RequestMapping("/api/system/storage")
@RequiredArgsConstructor
public class FileController {

    private final SysFileMapper fileMapper;

    @Value("${file.upload.max-size:104857600}")
    private long maxFileSize;

    @Value("${file.upload.allowed-extensions:jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,txt,csv,json,zip}")
    private String allowedExtensions;

    private static final String UPLOAD_DIR = "uploads";

    @Operation(summary = "文件上传")
    @PostMapping("/upload")
    public ApiResponse<Map<String, Object>> upload(@RequestParam("file") MultipartFile file,
                                                    @RequestParam(required = false, defaultValue = "common") String module) {
        String tenantId = TenantContext.getTenantId();
        String userId = TenantContext.getUserId();

        if (file.isEmpty()) {
            throw AppException.badRequest("文件不能为空");
        }
        if (file.getSize() > maxFileSize) {
            throw AppException.badRequest("文件大小超过限制");
        }

        // Validate extension
        String originalName = file.getOriginalFilename();
        String extension = "";
        if (originalName != null && originalName.contains(".")) {
            extension = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
        }
        Set<String> allowed = new HashSet<>(Arrays.asList(allowedExtensions.split(",")));
        if (!allowed.contains(extension)) {
            throw AppException.badRequest("不支持的文件类型: " + extension);
        }

        // Validate module name
        if (!module.matches("^[a-zA-Z0-9_-]+$")) {
            throw AppException.badRequest("模块名不合法");
        }

        try {
            // Create directory
            String dir = UPLOAD_DIR + "/" + tenantId + "/" + module;
            Path dirPath = Paths.get(dir);
            Files.createDirectories(dirPath);

            // Generate unique filename
            String fileName = UUID.randomUUID().toString() + "." + extension;
            String filePath = dir + "/" + fileName;

            // Save file
            file.transferTo(new File(filePath));

            // Record in database
            SysFile sysFile = new SysFile();
            sysFile.setTenantId(tenantId);
            sysFile.setUserId(userId);
            sysFile.setOriginalName(originalName);
            sysFile.setFileName(fileName);
            sysFile.setFilePath(filePath);
            sysFile.setFileType(extension);
            sysFile.setMimeType(file.getContentType());
            sysFile.setFileSize(file.getSize());
            sysFile.setStorageType("local");
            sysFile.setModule(module);
            sysFile.setStatus("0");
            fileMapper.insert(sysFile);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("fileId", sysFile.getFileId());
            result.put("fileName", fileName);
            result.put("originalName", originalName);
            result.put("filePath", filePath);
            result.put("url", "/uploads/" + tenantId + "/" + module + "/" + fileName);
            result.put("size", file.getSize());

            return ApiResponse.success(result, "上传成功");
        } catch (IOException e) {
            log.error("File upload failed", e);
            throw AppException.internal("文件上传失败");
        }
    }

    @Operation(summary = "文件列表")
    @GetMapping("/list")
    public ApiResponse<List<Map<String, Object>>> list(
            @RequestParam(required = false) String module,
            @RequestParam(required = false, defaultValue = "1") Integer pageNum,
            @RequestParam(required = false, defaultValue = "10") Integer pageSize) {
        String tenantId = TenantContext.getTenantId();

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysFile> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysFile>()
                        .eq(SysFile::getTenantId, tenantId);

        if (module != null && !module.isBlank()) {
            wrapper.eq(SysFile::getModule, module);
        }
        wrapper.orderByDesc(SysFile::getCreateTime);

        com.baomidou.mybatisplus.extension.plugins.pagination.Page<SysFile> page =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(pageNum, pageSize);
        var result = fileMapper.selectPage(page, wrapper);

        List<Map<String, Object>> list = result.getRecords().stream().map(f -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("fileId", f.getFileId());
            map.put("originalName", f.getOriginalName());
            map.put("fileName", f.getFileName());
            map.put("filePath", f.getFilePath());
            map.put("fileType", f.getFileType());
            map.put("fileSize", f.getFileSize());
            map.put("module", f.getModule());
            map.put("status", f.getStatus());
            map.put("createTime", f.getCreateTime());
            return map;
        }).toList();

        return ApiResponse.pageSuccess(list, result.getTotal());
    }

    @Operation(summary = "删除文件")
    @DeleteMapping("/remove")
    public ApiResponse<Void> remove(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        if (ids == null || ids.isEmpty()) {
            throw AppException.badRequest("文件ID列表不能为空");
        }
        for (String id : ids) {
            SysFile sysFile = fileMapper.selectById(id);
            if (sysFile != null) {
                // Delete physical file
                try {
                    Files.deleteIfExists(Paths.get(sysFile.getFilePath()));
                } catch (IOException e) {
                    log.warn("Failed to delete file: {}", sysFile.getFilePath());
                }
                fileMapper.deleteById(id);
            }
        }
        return ApiResponse.success(null, "删除成功");
    }
}
