package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_upload_audit")
public class SysUploadAudit {

    @TableId(value = "audit_id", type = IdType.ASSIGN_ID)
    private String auditId;

    private String tenantId;
    private String userId;
    private String username;
    private String moduleName;
    private String accessType;
    private String storageId;
    private String storageType;
    private String bucketName;
    private String objectName;
    private String originalName;
    private String safeName;
    private String fileExt;
    private String mimeType;
    private Long fileSize;
    private Long maxUploadBytes;
    private String uploadStatus;
    private String failReason;
    private String clientIp;
    private String userAgent;
    private String requestId;
    private String fileId;
    private String fileUrl;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
