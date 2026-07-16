package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_webhook")
public class SysWebhook {

    @TableId(value = "webhook_id", type = IdType.ASSIGN_ID)
    private String webhookId;

    private String tenantId;
    private String name;
    private String url;
    private String events;
    private String secret;
    private String status;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
