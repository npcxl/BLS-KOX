package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_page_column_config")
public class SysPageColumnConfig {

    @TableId(value = "column_id", type = IdType.ASSIGN_ID)
    private String columnId;

    private String pageCode;
    private String dataIndex;
    private String title;
    private Integer orderNum;
    private Integer visible;
    private Integer searchable;
    private Integer editable;
    private Integer copyable;
    private Integer ellipsis;
    private String valueType;
    private String valueEnumCode;
    private String placeholder;
    private Integer required;
    private String tenantId;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
