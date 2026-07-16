package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_menu")
public class SysMenu {

    @TableId(value = "menu_id", type = IdType.ASSIGN_ID)
    private String menuId;

    /** Global table, no tenant_id isolation */
    private String parentId;
    private String menuName;
    private String menuType;
    private String path;
    private String component;
    private String icon;
    private String perms;
    private Integer sortNum;
    private String status;
    private Integer isCache;
    private Integer isFrame;
    private Integer visible;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;
    private String remark;
}
