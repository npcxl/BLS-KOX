package com.bls.server.websocket;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@EnableScheduling
public class RealtimeWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        log.info("WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        String payload = message.getPayload();
        log.debug("WebSocket message from {}: {}", session.getId(), payload);
        // Echo or broadcast as needed
        session.sendMessage(new TextMessage("{\"type\":\"ack\",\"data\":\"received\"}"));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        log.info("WebSocket disconnected: {}", session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket error: {}", session.getId(), exception);
        sessions.remove(session.getId());
    }

    /**
     * Broadcast message to all connected sessions.
     */
    public void broadcast(String message) {
        sessions.values().forEach(session -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(message));
                }
            } catch (IOException e) {
                log.error("Broadcast failed for session: {}", session.getId(), e);
            }
        });
    }

    /**
     * Periodic realtime push (aligned with Koa every 3 seconds).
     */
    @Scheduled(fixedRate = 3000)
    public void pushRealtimeInfo() {
        if (sessions.isEmpty()) return;

        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        Runtime runtime = Runtime.getRuntime();

        String data = String.format(
                "{\"type\":\"realtime-info\",\"data\":{\"cpu\":%.2f,\"mem\":%.2f,\"uptime\":%d}}",
                os.getSystemLoadAverage(),
                (runtime.totalMemory() - runtime.freeMemory()) * 100.0 / runtime.maxMemory(),
                ManagementFactory.getRuntimeMXBean().getUptime()
        );

        broadcast(data);
    }
}
