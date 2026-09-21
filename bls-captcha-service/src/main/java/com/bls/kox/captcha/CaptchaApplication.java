package com.bls.kox.captcha;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * TIANAI CAPTCHA 独立微服务（第二层人机验证）。
 *
 * 端口：8083（只在 Docker 内网暴露，见 docker-compose 的 networks / 不 publish ports）。
 * Koa 通过 http://tianai-captcha:8083 访问；浏览器永远不直接访问本服务。
 */
@SpringBootApplication
public class CaptchaApplication {

    public static void main(String[] args) {
        SpringApplication.run(CaptchaApplication.class, args);
    }
}
