package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_tenant")
public class SysTenant {

    @TableId(value = "tenant_id", type = IdType.ASSIGN_ID)
    private String tenantId;

    private String tenantName;
    private String domainName;
    private String packageId;
    private String contactUser;
    private String contactPhone;
    private LocalDateTime expireTime;
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String remark;
}
