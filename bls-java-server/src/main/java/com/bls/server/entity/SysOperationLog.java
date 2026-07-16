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
    private String module;
    private String businessType;
    private String method;
    private String requestMethod;
    private String requestUrl;
    private String requestIp;
    private String requestLocation;
    private String requestParams;
    private String responseResult;
    private String status;
    private String errorMsg;
    private Long costTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
