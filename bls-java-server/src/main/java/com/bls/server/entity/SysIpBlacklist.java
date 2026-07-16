package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_ip_blacklist")
public class SysIpBlacklist {

    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private String id;

    private String ipAddress;
    private String reason;
    private String source;
    private String status;
    private LocalDateTime expireAt;
    private String tenantId;
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
