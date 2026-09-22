package com.bls.kox.captcha;

import cloud.tianai.captcha.application.ImageCaptchaApplication;
import cloud.tianai.captcha.application.vo.ImageCaptchaVO;
import cloud.tianai.captcha.common.constant.CaptchaTypeConstant;
import cloud.tianai.captcha.common.response.ApiResponse;
import cloud.tianai.captcha.generator.common.model.dto.GenerateParam;
import cloud.tianai.captcha.generator.common.model.dto.ParamKeyEnum;
import cloud.tianai.captcha.validator.common.model.dto.ImageCaptchaTrack;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
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
 * SDK 版本事实（tianai-captcha 1.5.3，已按 jar 内源码核对）：
 *   - `generateCaptcha(GenerateParam)` 返回 `ApiResponse<ImageCaptchaVO>`（**带 code/msg 的包装**）；
 *   - `ImageCaptchaVO` 的渲染字段是 `backgroundImage` / **`templateImage`**（没有 sliderImage）、
 *     尺寸为 `backgroundImageWidth/Height` + `templateImageWidth/Height`（没有 randomY：
 *     SLIDER 的模板图是**整条背景等高**的图，缺口 Y 已烘焙在图内）；
 *   - **唯一请求契约**是官方 `ImageCaptchaTrack`：
 *     `bgImageWidth` / `bgImageHeight` / `templateImageWidth` / `templateImageHeight` /
 *     `startTime` / `stopTime` / `trackList[{x,y,t,type}]`（type ∈ DOWN/MOVE/UP/CLICK）；
 *     官方 `ParamCheckCaptchaInterceptor` 与 `BasicCaptchaTrackValidator` 在字段缺失时**直接抛异常**，
 *     因此结构自检必须在这里拦成 5xx，绝不能顺手当成"用户没通过"。
 *   - 点选（WORD_IMAGE_CLICK）官方校验只看 `type=CLICK` 的轨迹（按百分比比对），
 *     历史实现提交自定义 `{points}` 会被反序列化直接拒绝。
 */
@RestController
@RequestMapping
public class CaptchaBridgeController {

    /** 官方 starter 自动装配的核心应用（生成 + 匹配） */
    private final ImageCaptchaApplication imageCaptchaApplication;
    /** 用 Spring 容器里的 ObjectMapper：已关闭 FAIL_ON_UNKNOWN_PROPERTIES，容忍前端多余字段 */
    private final ObjectMapper objectMapper;

    /**
     * 点选验证码需要点击的文字数量。
     * 官方默认 4（`StandardWordClickImageCaptchaGenerator.checkClickCount`），这里显式传给
     * `GenerateParam`，并原样回传给前端，保证「生成 / 校验 / 渲染」三处数量一致。
     */
    private final int clickCount;

    public CaptchaBridgeController(ImageCaptchaApplication imageCaptchaApplication,
                                   ObjectMapper objectMapper,
                                   @Value("${bls.captcha.click-count:4}") int clickCount) {
        this.imageCaptchaApplication = imageCaptchaApplication;
        this.objectMapper = objectMapper;
        this.clickCount = clickCount > 0 ? clickCount : 4;
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

        GenerateParam param = GenerateParam.builder().type(type).build();
        if (isClickType(type)) {
            // 与校验侧保持同一个点击数量（官方按 viewData 之外的 param 读取）
            param.addParam(ParamKeyEnum.CLICK_CHECK_CLICK_COUNT, clickCount);
        }

        // 官方 API：生成验证码（图片、拼图块、尺寸等）
        ApiResponse<ImageCaptchaVO> response = imageCaptchaApplication.generateCaptcha(param);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            // 生成失败是**技术故障**（资源未初始化 / 缓存不可用 / SDK 内部异常），必须 5xx，
            // 绝不能伪装成"用户验证不通过"。
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "captcha generate failed: " + (response == null ? "null response" : response.getMsg()));
        }

        Map<String, Object> data = buildGeneratePayload(response.getData(), type, clickCount);
        if (data == null) {
            // 渲染字段缺失 → 前端根本无法作答，属于我方故障（5xx）
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "captcha generate missing render fields");
        }

        Map<String, Object> body = new HashMap<>();
        body.put("code", 200);
        body.put("data", data);
        return body;
    }

    /**
     * 把官方 `ImageCaptchaVO` 映射成对前端的渲染载荷（保留官方字段名）。
     *
     * @return 缺少必要渲染字段时返回 null（调用方返回 5xx）
     */
    static Map<String, Object> buildGeneratePayload(ImageCaptchaVO captcha, String type, int clickCount) {
        if (captcha == null || isEmpty(captcha.getId())
                || isEmpty(captcha.getBackgroundImage())
                || captcha.getBackgroundImageWidth() == null
                || captcha.getBackgroundImageHeight() == null) {
            return null;
        }
        boolean click = isClickType(type);
        if (!click) {
            // 滑块必须能拿到模板图与尺寸，否则前端无法定位缺口（不允许前端猜）
            if (isEmpty(captcha.getTemplateImage())
                    || captcha.getTemplateImageWidth() == null
                    || captcha.getTemplateImageHeight() == null) {
                return null;
            }
        }

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

        // 透传 viewData（客户端安全的展示数据；官方 CustomData.getViewData() → AnyMap 实现 Map），
        // 并为点选补充 clickCount（官方模板里 viewData 不包含点击数量，前端需要它才能渲染进度）
        Map<String, Object> view = new LinkedHashMap<>();
        Object rawView = captcha.getData();
        if (rawView instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) rawView).entrySet()) {
                view.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        if (click) {
            view.put("clickCount", clickCount);
        }
        data.put("data", view.isEmpty() ? null : view);
        return data;
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
        String structureError = checkTrackStructure(track);
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
     * 校验前端提交的轨迹结构是否符合官方 `ImageCaptchaTrack` 契约。
     *
     * 与官方 `ParamCheckCaptchaInterceptor.checkParam()` **逐条对齐**：
     * 缺任何一项官方校验器都会抛异常，因此这里提前拦成 5xx，
     * 避免把"前端忘了传字段"记成"用户验证失败"。
     *
     * @return null 表示结构完整；否则返回缺失的字段名
     */
    static String checkTrackStructure(ImageCaptchaTrack track) {
        if (track == null) {
            return "track";
        }
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

    /** 结构自检失败时的可读原因（供日志/排障，不下发具体细节） */
    static List<String> trackTypeSummary(ImageCaptchaTrack track) {
        List<String> types = new ArrayList<>();
        if (track != null && track.getTrackList() != null) {
            for (ImageCaptchaTrack.Track t : track.getTrackList()) {
                if (t != null) {
                    types.add(t.getType());
                }
            }
        }
        return types;
    }

    private static boolean isEmpty(String value) {
        return value == null || value.trim().isEmpty();
    }

    static boolean isClickType(String type) {
        return CaptchaTypeConstant.WORD_IMAGE_CLICK.equalsIgnoreCase(type)
                || "clickWord".equalsIgnoreCase(type);
    }

    /** Koa 语义名 → Tianai 官方类型名（保持对 Koa 的契约稳定，便于以后升级 SDK） */
    static String resolveType(Map<String, Object> request) {
        Object raw = request == null ? null : request.get("type");
        String type = raw == null ? "blockPuzzle" : String.valueOf(raw);
        if (isClickType(type)) {
            return CaptchaTypeConstant.WORD_IMAGE_CLICK;
        }
        // blockPuzzle / SLIDER / 默认
        return CaptchaTypeConstant.SLIDER;
    }
}
