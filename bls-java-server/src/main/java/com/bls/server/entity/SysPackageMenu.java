package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_package_menu")
public class SysPackageMenu {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String packageId;
    private String menuId;
}
