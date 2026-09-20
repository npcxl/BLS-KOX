package com.bls.server.core;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * 统一解析 remove 请求体。
 * <p>
 * 对齐前端 / Koa 契约（docs/api-compatibility.md）：DELETE /remove 统一使用 {@code { "ids": ["a","b"] }}。
 * 同时兼容历史格式：
 * <ul>
 *   <li>裸数组 {@code ["a","b"]}</li>
 *   <li>逗号分隔字符串 {@code "a,b"}（或 query 参数 ids=a,b）</li>
 * </ul>
 */
public final class RemoveIds {

    private RemoveIds() {
    }

    public static List<String> extract(JsonNode body) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        if (body == null || body.isNull()) {
            return new ArrayList<>();
        }
        if (body.isArray()) {
            for (JsonNode node : body) {
                add(ids, node.asText());
            }
        } else if (body.isObject()) {
            JsonNode arr = body.get("ids");
            if (arr != null && !arr.isNull()) {
                if (arr.isArray()) {
                    for (JsonNode node : arr) {
                        add(ids, node.asText());
                    }
                } else {
                    add(ids, arr.asText());
                }
            }
        }
        return new ArrayList<>(ids);
    }

    private static void add(LinkedHashSet<String> ids, String value) {
        if (value == null) {
            return;
        }
        for (String part : value.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                ids.add(trimmed);
            }
        }
    }
}
