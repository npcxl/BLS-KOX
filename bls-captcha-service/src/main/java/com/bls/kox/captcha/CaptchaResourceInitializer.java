package com.bls.kox.captcha;

import cloud.tianai.captcha.common.constant.CaptchaTypeConstant;
import cloud.tianai.captcha.resource.CrudResourceStore;
import cloud.tianai.captcha.resource.ResourceStore;
import cloud.tianai.captcha.resource.common.model.dto.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 注册「背景图」资源 —— 这是 tianai-captcha 使用中最容易踩的坑。
 *
 * 为什么必须手动注册：
 *   - `captcha.init-default-resource: true` 走的是官方 {@code DefaultBuiltInResources}，
 *     它只注册了**模板**（slider_1/slider_2/rotate_1）与**字体**（SIMSUN.TTC），
 *     **一张背景图都没有**；
 *   - 而生成验证码需要「背景图 + 模板」同时存在，缺背景图就会抛
 *     {@code IllegalStateException: 随机获取资源错误，store中资源为空, type:SLIDER, tag:null}，
 *     直接表现为 /captcha/generate 返回 5xx。
 *
 * 实现说明：
 *   - 注入的是 {@link ResourceStore} **Bean**（`LocalMemoryResourceStore`）；生成侧用的是它的
 *     `FontCache` 包装，但底层是同一份 map（FontCache 只是委托），所以这里注册后立即生效；
 *   - 使用 2 参构造注册，tag 会被自动置为 `default`；查询 side 的 tag 为空时
 *     `listResourcesByTypeAndTag` 会**聚合所有 tag**，因此能命中；
 *   - 每个 type 用**独立** Resource 实例：Resource 在注册时会被写入 tag/id，复用同一实例会互相串味。
 */
@Component
public class CaptchaResourceInitializer {

    private static final Logger log = LoggerFactory.getLogger(CaptchaResourceInitializer.class);

    /** 官方核心包内置的背景图（classpath:META-INF/cut-image/resource/1.jpg） */
    private static final String BUILT_IN_BACKGROUND = "META-INF/cut-image/resource/1.jpg";

    /** 需要背景图的验证码类型（本项目只用第二层的滑块拼图与点选文字） */
    private static final String[] CAPTCHA_TYPES_WITH_BACKGROUND = {
            CaptchaTypeConstant.SLIDER,
            CaptchaTypeConstant.WORD_IMAGE_CLICK,
    };

    private final ResourceStore resourceStore;

    public CaptchaResourceInitializer(ResourceStore resourceStore) {
        this.resourceStore = resourceStore;
    }

    @PostConstruct
    public void registerBackgroundImages() {
        if (!(resourceStore instanceof CrudResourceStore)) {
            log.warn("[captcha] resourceStore 不是 CrudResourceStore，跳过内置背景图注册: {}",
                    resourceStore.getClass().getName());
            return;
        }
        CrudResourceStore store = (CrudResourceStore) resourceStore;
        for (String type : CAPTCHA_TYPES_WITH_BACKGROUND) {
            store.addResource(type, new Resource("classpath", BUILT_IN_BACKGROUND));
        }
        log.info("[captcha] 内置背景图已注册: {} -> {}", BUILT_IN_BACKGROUND,
                String.join(",", CAPTCHA_TYPES_WITH_BACKGROUND));
    }
}
