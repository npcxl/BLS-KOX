package com.bls.kox.captcha;

import cloud.tianai.captcha.application.vo.ImageCaptchaVO;
import cloud.tianai.captcha.validator.common.model.dto.ImageCaptchaTrack;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Koa ↔ Tianai 契约测试（**唯一契约 = 官方 ImageCaptchaTrack DTO**）。
 *
 * 这些断言保护的是「前端提交的 payload 一定能被官方反序列化 + 通过官方参数自检」，
 * 以及「上游渲染字段原样透传（尺寸不做任何猜测）」。
 */
class CaptchaBridgeContractTest {

    /** 与 Spring Boot 默认一致：未知字段不报错（前端多传字段不应导致 400） */
    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    // ==================== 类型映射 ====================

    @Test
    @DisplayName("Koa 语义名 → 官方类型名（SLIDER / WORD_IMAGE_CLICK）")
    void resolveTypeMapping() {
        assertEquals("SLIDER", CaptchaBridgeController.resolveType(mapOf("type", "blockPuzzle")));
        assertEquals("SLIDER", CaptchaBridgeController.resolveType(mapOf("type", "SLIDER")));
        assertEquals("WORD_IMAGE_CLICK", CaptchaBridgeController.resolveType(mapOf("type", "clickWord")));
        assertEquals("WORD_IMAGE_CLICK", CaptchaBridgeController.resolveType(mapOf("type", "WORD_IMAGE_CLICK")));
        // 缺省 / 未知 → 滑块（官方默认类型）
        assertEquals("SLIDER", CaptchaBridgeController.resolveType(null));
        assertEquals("SLIDER", CaptchaBridgeController.resolveType(mapOf("type", "whatever")));
    }

    @Test
    @DisplayName("点选类型判定")
    void clickTypeDetection() {
        assertTrue(CaptchaBridgeController.isClickType("clickWord"));
        assertTrue(CaptchaBridgeController.isClickType("WORD_IMAGE_CLICK"));
        assertFalse(CaptchaBridgeController.isClickType("blockPuzzle"));
        assertFalse(CaptchaBridgeController.isClickType("SLIDER"));
    }

    // ==================== 官方 DTO 反序列化 ====================

    @Test
    @DisplayName("前端提交的滑块 payload 能被官方 ImageCaptchaTrack 完整反序列化（含 t 为整数）")
    void deserializeSliderTrack() {
        Map<String, Object> payload = sliderTrackPayload();
        // 前端可能多传字段（例如 templateImageWidth），必须容忍
        payload.put("templateImageWidth", 120);
        payload.put("templateImageHeight", 300);

        ImageCaptchaTrack track = objectMapper.convertValue(payload, ImageCaptchaTrack.class);

        assertEquals(600, track.getBgImageWidth());
        assertEquals(300, track.getBgImageHeight());
        assertEquals(1_700_000_000_000L, track.getStartTime());
        assertEquals(1_700_000_000_800L, track.getStopTime());
        assertEquals(2, track.getTrackList().size());
        assertEquals("DOWN", track.getTrackList().get(0).getType());
        assertEquals("UP", track.getTrackList().get(1).getType());
        assertEquals(0f, track.getTrackList().get(0).getX(), 0.001f);
        // Jackson 会把 JSON 整数塞进 Float 字段
        assertEquals(227.5f, track.getTrackList().get(1).getX(), 0.001f);
        assertEquals(800f, track.getTrackList().get(1).getT(), 0.001f);

        assertNull(CaptchaBridgeController.checkTrackStructure(track));
    }

    @Test
    @DisplayName("前端提交的点选 payload 是 CLICK 轨迹（不是自定义 points）")
    void deserializeClickTrack() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bgImageWidth", 590);
        payload.put("bgImageHeight", 360);
        payload.put("startTime", 1_700_000_000_000L);
        payload.put("stopTime", 1_700_000_001_500L);
        List<Map<String, Object>> tracks = new ArrayList<>();
        tracks.add(track(100, 120, 100, "CLICK"));
        tracks.add(track(300, 200, 900, "CLICK"));
        tracks.add(track(500, 300, 1400, "CLICK"));
        payload.put("trackList", tracks);

        ImageCaptchaTrack track = objectMapper.convertValue(payload, ImageCaptchaTrack.class);
        assertNull(CaptchaBridgeController.checkTrackStructure(track));
        assertEquals(Arrays.asList("CLICK", "CLICK", "CLICK"),
                CaptchaBridgeController.trackTypeSummary(track));
        // 官方按百分比比对：x / bgImageWidth
        assertEquals(300f, track.getTrackList().get(1).getX(), 0.001f);
    }

    // ==================== 结构自检（与官方 ParamCheckCaptchaInterceptor 对齐） ====================

    @Test
    @DisplayName("结构缺失必须被拦成 5xx（不能伪装成用户验证失败）")
    void structureCheckRejectsIncompleteTrack() {
        assertEquals("bgImageWidth", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(minusKey(sliderTrackPayload(), "bgImageWidth"), ImageCaptchaTrack.class)));
        assertEquals("bgImageHeight", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(minusKey(sliderTrackPayload(), "bgImageHeight"), ImageCaptchaTrack.class)));
        assertEquals("startTime", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(minusKey(sliderTrackPayload(), "startTime"), ImageCaptchaTrack.class)));
        assertEquals("stopTime", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(minusKey(sliderTrackPayload(), "stopTime"), ImageCaptchaTrack.class)));
        assertEquals("trackList", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(minusKey(sliderTrackPayload(), "trackList"), ImageCaptchaTrack.class)));

        // 轨迹项缺 type / t
        Map<String, Object> p = sliderTrackPayload();
        List<Map<String, Object>> tracks = new ArrayList<>();
        tracks.add(track(0, 0, 0, null));
        p.put("trackList", tracks);
        assertEquals("track[x,y,t,type]", CaptchaBridgeController.checkTrackStructure(
                objectMapper.convertValue(p, ImageCaptchaTrack.class)));

        assertEquals("track", CaptchaBridgeController.checkTrackStructure(null));
    }

    // ==================== 渲染字段透传（绝不用固定尺寸兜底） ====================

    @Test
    @DisplayName("滑块：原样透传官方字段，缺渲染字段返回 null（由调用方 5xx）")
    void buildSliderPayload() {
        ImageCaptchaVO vo = new ImageCaptchaVO();
        vo.setId("SLIDER-1");
        vo.setType("SLIDER");
        vo.setBackgroundImage("data:image/jpeg;base64,AAAA");
        vo.setTemplateImage("data:image/png;base64,BBBB");
        vo.setBackgroundImageWidth(600);
        vo.setBackgroundImageHeight(300);
        vo.setTemplateImageWidth(120);
        vo.setTemplateImageHeight(300);

        Map<String, Object> data = CaptchaBridgeController.buildGeneratePayload(vo, "SLIDER", 4);
        assertNotNull(data);
        assertEquals("SLIDER-1", data.get("id"));
        assertEquals(600, data.get("backgroundImageWidth"));
        assertEquals(300, data.get("backgroundImageHeight"));
        assertEquals(120, data.get("templateImageWidth"));
        assertEquals(300, data.get("templateImageHeight"));
        assertEquals("data:image/png;base64,BBBB", data.get("templateImage"));
        // 滑块没有 clickCount
        assertNull(data.get("data"));

        // 缺模板图 / 宽高 → null（前端不允许猜尺寸）
        vo.setTemplateImage(null);
        assertNull(CaptchaBridgeController.buildGeneratePayload(vo, "SLIDER", 4));
        vo.setTemplateImage("tpl");
        vo.setBackgroundImageWidth(null);
        assertNull(CaptchaBridgeController.buildGeneratePayload(vo, "SLIDER", 4));
        assertNull(CaptchaBridgeController.buildGeneratePayload(null, "SLIDER", 4));
    }

    @Test
    @DisplayName("点选：data 中带回 clickCount，viewData 一并透传")
    void buildClickPayload() {
        ImageCaptchaVO vo = new ImageCaptchaVO();
        vo.setId("WORD_IMAGE_CLICK-1");
        vo.setType("WORD_IMAGE_CLICK");
        vo.setBackgroundImage("data:image/jpeg;base64,AAAA");
        vo.setBackgroundImageWidth(590);
        vo.setBackgroundImageHeight(360);
        vo.setTemplateImage("data:image/png;base64,TTTT");
        vo.setTemplateImageWidth(300);
        vo.setTemplateImageHeight(60);
        Map<String, Object> viewData = new HashMap<>();
        viewData.put("tip", "请依次点击");
        vo.setData(viewData);

        Map<String, Object> data = CaptchaBridgeController.buildGeneratePayload(vo, "WORD_IMAGE_CLICK", 4);
        assertNotNull(data);
        @SuppressWarnings("unchecked")
        Map<String, Object> extra = (Map<String, Object>) data.get("data");
        assertNotNull(extra);
        assertEquals(4, extra.get("clickCount"));
        assertEquals("请依次点击", extra.get("tip"));
        // 点选不要求模板图尺寸（提示条随背景图渲染）
        assertEquals("WORD_IMAGE_CLICK", data.get("type"));
    }

    // ==================== helpers ====================

    private static Map<String, Object> mapOf(String k, Object v) {
        Map<String, Object> m = new HashMap<>();
        m.put(k, v);
        return m;
    }

    private static Map<String, Object> track(int x, int y, int t, String type) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("x", x);
        m.put("y", y);
        m.put("t", t);
        m.put("type", type);
        return m;
    }

    /** 与 bls-admin TianaiCaptcha 组件产出的 DTO 完全一致 */
    private static Map<String, Object> sliderTrackPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bgImageWidth", 600);
        payload.put("bgImageHeight", 300);
        payload.put("startTime", 1_700_000_000_000L);
        payload.put("stopTime", 1_700_000_000_800L);
        List<Map<String, Object>> tracks = new ArrayList<>();
        tracks.add(track(0, 5, 0, "DOWN"));
        tracks.add(track(228, 9, 800, "UP"));
        payload.put("trackList", tracks);
        return payload;
    }

    private static Map<String, Object> minusKey(Map<String, Object> source, String key) {
        Map<String, Object> copy = new LinkedHashMap<>(source);
        copy.put(key, null);
        return copy;
    }
}
