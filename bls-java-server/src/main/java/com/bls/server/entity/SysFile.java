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
    private String userId;
    private String originalName;
    private String fileName;
    private String filePath;
    private String fileType;
    private String mimeType;
    private Long fileSize;
    private String storageType;
    private String module;
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
