package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_theme_config")
public class SysThemeConfig {

    @TableId(value = "theme_id", type = IdType.ASSIGN_ID)
    private String themeId;

    private String tenantId;
    private String navTheme;
    private String colorPrimary;
    private String layout;
    private String contentWidth;
    private Integer fixedHeader;
    private Integer fixSiderbar;
    private Integer colorWeak;
    private Integer splitMenus;
    private String siderMenuType;
    private String title;
    private String logo;
    private String iconfontUrl;
    private String tokenJson;
    private String status;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
