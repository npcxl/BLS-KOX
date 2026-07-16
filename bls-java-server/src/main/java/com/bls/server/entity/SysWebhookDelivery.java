package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_webhook_delivery")
public class SysWebhookDelivery {

    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private String id;

    private String webhookId;
    private String event;
    private String payload;
    private String status;
    private Integer responseCode;
    private String responseBody;
    private String errorMessage;
    private Integer attempt;
    private String tenantId;
    private LocalDateTime createdAt;
}
