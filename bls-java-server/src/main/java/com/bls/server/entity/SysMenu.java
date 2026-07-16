package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_menu")
public class SysMenu {

    @TableId(value = "menu_id", type = IdType.ASSIGN_ID)
    private String menuId;

    private String parentId;
    private String menuName;
    private String path;
    private String component;
    private String perms;
    private String icon;
    private String menuType;
    private Integer sortNum;
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
