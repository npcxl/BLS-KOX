package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_operation_log")
public class SysOperationLog {

    @TableId(value = "log_id", type = IdType.ASSIGN_ID)
    private String logId;

    private String tenantId;
    private String userId;
    private String username;
    private String moduleName;
    private String businessType;
    private String title;
    private String requestMethod;
    private String requestUrl;
    private String requestParams;
    private Integer responseStatus;
    private Integer success;
    private String errorMessage;
    private String errorStack;
    private String clientIp;
    private String userAgent;
    private String requestId;
    private Integer costTimeMs;
    private LocalDateTime operatorTime;
    private String remark;
}
