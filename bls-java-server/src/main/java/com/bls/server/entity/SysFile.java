package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_file")
public class SysFile {

    @TableId(value = "file_id", type = IdType.ASSIGN_ID)
    private String fileId;

    private String tenantId;
    private String storageId;
    private String bucketName;
    private String objectName;
    private String originalName;
    private String fileName;
    private String fileExt;
    private String mimeType;
    private Long fileSize;
    private String accessType;
    private String moduleName;
    private String url;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;
}
