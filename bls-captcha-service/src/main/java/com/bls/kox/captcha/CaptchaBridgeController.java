package com.bls.kox.captcha;

import cloud.tianai.captcha.application.ImageCaptchaApplication;
import cloud.tianai.captcha.application.vo.ImageCaptchaVO;
import cloud.tianai.captcha.common.response.ApiResponse;
import cloud.tianai.captcha.validator.common.model.dto.ImageCaptchaTrack;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Koa 专用桥接接口（**不是**给浏览器用的）。
 *
 * 路径与 Koa 侧 `TianaiProvider` 的默认路径一一对应：
 *   POST /captcha/generate  生成验证码（返回 **Tianai 原始字段**，Koa 原样透传给前端）
 *   POST /captcha/verify    行为轨迹匹配（Koa 原样转发前端答案）
 *   GET  /health            健康检查（Koa 保存配置前的可用性预检）
 *
 * 约定：
 *   - 不在这里做任何"业务判定"（例如账号、风控）：那是 Koa 的职责；
 *   - 字段名保留 Tianai SDK 原始命名（id / backgroundImage / templateImage / …），
 *     前端按同一份字段渲染，Koa 不做改名或裁剪；
 *   - 返回 2xx + 判定结果表示"校验完成"；**5xx 表示技术故障**，Koa 会据此返回 TECHNICAL_ERROR
 *     而**不会**把它当成用户验证失败（前端数据残缺属于我方问题，必须返回 5xx）。
 *
 * SDK 版本事实（tianai-captcha 1.5.3，已按 jar 内签名核对）：
 *   - `generateCaptcha(String)` 返回 `ApiResponse<ImageCaptchaVO>`（**带 code/msg 的包装**），不是裸 VO；
 *   - `ImageCaptchaVO` 的字段是 backgroundImage / **templateImage**（没有 sliderImage）、
 *     尺寸为 backgroundImageWidth/Height + templateImageWidth/Height（没有 randomY；SLIDER 的
 *     模板图是**整条背景等高**的图，缺口 Y 已含在图中）；
 *   - `matching(String, ImageCaptchaTrack)` 需要完整的轨迹 DTO（bgImageWidth + trackList …），
 *     不是 `{x,y}` 这种简写。
 */
@RestController
@RequestMapping
public class CaptchaBridgeController {

    /** 官方 starter 自动装配的核心应用（生成 + 匹配） */
    private final ImageCaptchaApplication imageCaptchaApplication;
    /** 用 Spring 容器里的 ObjectMapper：已关闭 FAIL_ON_UNKNOWN_PROPERTIES，容忍前端多余字段 */
    private final ObjectMapper objectMapper;

    public CaptchaBridgeController(ImageCaptchaApplication imageCaptchaApplication, ObjectMapper objectMapper) {
        this.imageCaptchaApplication = imageCaptchaApplication;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> body = new HashMap<>();
        body.put("status", "ok");
        body.put("service", "tianai-captcha");
        return body;
    }

    /**
     * 生成验证码。
     *
     * @param request { type: "blockPuzzle" | "clickWord", scene: "LOGIN" }
     *                注意：Tianai 官方类型名为 SLIDER / WORD_IMAGE_CLICK 等，
     *                这里接受 Koa 侧的语义名并在内部映射（保持对 Koa 的契约稳定）。
     */
    @PostMapping(value = "/captcha/generate", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> generate(@RequestBody(required = false) Map<String, Object> request) {
        String type = resolveType(request);

        // 官方 API：生成验证码（图片、拼图块、尺寸等）
        ApiResponse<ImageCaptchaVO> response = imageCaptchaApplication.generateCaptcha(type);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            // 生成失败是**技术故障**（资源未初始化 / 缓存不可用 / SDK 内部异常），必须 5xx，
            // 绝不能伪装成"用户验证不通过"。
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "captcha generate failed: " + (response == null ? "null response" : response.getMsg()));
        }

        ImageCaptchaVO captcha = response.getData();

        Map<String, Object> data = new LinkedHashMap<>();
        // 字段名保留 Tianai SDK 原始命名，前端按同一份字段渲染
        data.put("id", captcha.getId());
        data.put("type", isEmpty(captcha.getType()) ? type : captcha.getType());
        data.put("backgroundImage", captcha.getBackgroundImage());
        data.put("templateImage", captcha.getTemplateImage());
        data.put("backgroundImageTag", captcha.getBackgroundImageTag());
        data.put("templateImageTag", captcha.getTemplateImageTag());
        data.put("backgroundImageWidth", captcha.getBackgroundImageWidth());
        data.put("backgroundImageHeight", captcha.getBackgroundImageHeight());
        data.put("templateImageWidth", captcha.getTemplateImageWidth());
        data.put("templateImageHeight", captcha.getTemplateImageHeight());
        // 附加数据（viewData）：CONCAT 类含 randomY，点选题含坐标定义；为空时原样返回 null
        data.put("data", captcha.getData());

        Map<String, Object> body = new HashMap<>();
        body.put("code", 200);
        body.put("data", data);
        return body;
    }

    /**
     * 行为轨迹匹配。
     *
     * @param request { id: 上游 challenge id, data: 前端原始答案（{@link ImageCaptchaTrack} 结构） }
     * @return code=200 + valid=true 表示通过；code=200 + valid=false 表示**用户没通过**（不是故障）；
     *         轨迹结构残缺 → 5xx（技术故障）
     */
    @PostMapping(value = "/captcha/verify", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> verify(@RequestBody Map<String, Object> request) {
        Object idValue = request.get("id");
        Object data = request.get("data");

        Map<String, Object> body = new HashMap<>();
        if (idValue == null || !(data instanceof Map)) {
            // 调用方没传必要字段：按"判定不通过"返回，让 Koa 决定如何提示
            body.put("code", 200);
            body.put("valid", false);
            body.put("message", "missing id or data");
            return body;
        }

        ImageCaptchaTrack track;
        try {
            track = objectMapper.convertValue(data, ImageCaptchaTrack.class);
        } catch (IllegalArgumentException e) {
            body.put("code", 200);
            body.put("valid", false);
            body.put("message", "invalid data structure");
            return body;
        }

        // 结构自检：缺字段是**我方前端**的问题（技术故障），不能伪装成"用户没通过"
        String structureError = checkStructure(track);
        if (structureError != null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "invalid track: " + structureError);
        }

        // 官方 API：校验坐标/轨迹（内部完成图片还原、行为轨迹比对等算法）
        ApiResponse<?> response = imageCaptchaApplication.matching(idValue.toString(), track);

        body.put("code", 200);
        body.put("valid", response != null && response.isSuccess());
        body.put("message", response == null ? "empty response" : response.getMsg());
        return body;
    }

    /**
     * 校验前端提交的轨迹结构是否完整。
     * 缺任何一项官方校验器都无法判定（会抛异常或直接判错），因此这里提前拦成 5xx，
     * 避免把"前端忘了传字段"记成"用户验证失败"。
     */
    private String checkStructure(ImageCaptchaTrack track) {
        if (track.getBgImageWidth() == null || track.getBgImageWidth() < 1) {
            return "bgImageWidth";
        }
        if (track.getBgImageHeight() == null || track.getBgImageHeight() < 1) {
            return "bgImageHeight";
        }
        if (track.getStartTime() == null) {
            return "startTime";
        }
        if (track.getStopTime() == null) {
            return "stopTime";
        }
        List<ImageCaptchaTrack.Track> trackList = track.getTrackList();
        if (trackList == null || trackList.isEmpty()) {
            return "trackList";
        }
        for (ImageCaptchaTrack.Track t : trackList) {
            if (t == null || t.getX() == null || t.getY() == null || t.getT() == null || isEmpty(t.getType())) {
                return "track[x,y,t,type]";
            }
        }
        return null;
    }

    private static boolean isEmpty(String value) {
        return value == null || value.trim().isEmpty();
    }

    /** Koa 语义名 → Tianai 官方类型名（保持对 Koa 的契约稳定，便于以后升级 SDK） */
    private String resolveType(Map<String, Object> request) {
        Object raw = request == null ? null : request.get("type");
        String type = raw == null ? "blockPuzzle" : String.valueOf(raw);
        if ("clickWord".equalsIgnoreCase(type) || "WORD_IMAGE_CLICK".equalsIgnoreCase(type)) {
            return "WORD_IMAGE_CLICK";
        }
        // blockPuzzle / SLIDER / 默认
        return "SLIDER";
    }
}
