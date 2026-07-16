package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_storage_config")
public class SysStorageConfig {

    @TableId(value = "storage_id", type = IdType.ASSIGN_ID)
    private String storageId;

    private String tenantId;
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

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
