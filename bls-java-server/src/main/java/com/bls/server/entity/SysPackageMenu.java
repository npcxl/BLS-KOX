package com.bls.server.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_package_menu")
public class SysPackageMenu {

    private String packageId;
    private String menuId;
}
