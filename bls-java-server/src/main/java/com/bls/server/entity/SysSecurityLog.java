package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_security_log")
public class SysSecurityLog {

    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private String id;

    private String tenantId;
    private String eventType;
    private String riskLevel;
    private String title;
    private String detail;
    private String username;
    private String userId;
    private String route;
    private String method;
    private String clientIp;
    private String userAgent;
    private String requestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
