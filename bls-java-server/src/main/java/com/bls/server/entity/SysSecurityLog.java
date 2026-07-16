package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_security_log")
public class SysSecurityLog {

    @TableId(value = "log_id", type = IdType.ASSIGN_ID)
    private String logId;

    private String tenantId;
    private String userId;
    private String username;
    private String eventType;
    private String riskLevel;
    private String ip;
    private String userAgent;
    private String requestMethod;
    private String requestUrl;
    private String requestParams;
    private String message;
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
