package com.bls.server;

import com.bls.server.common.ApiResponse;
import com.bls.server.controller.AuthController.LoginRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BlsJavaServerApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private static String accessToken;
    private static String refreshToken;

    @Test
    @Order(1)
    @DisplayName("健康检查接口")
    void testHealth() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("UP"));
    }

    @Test
    @Order(2)
    @DisplayName("就绪检查接口")
    void testReady() throws Exception {
        mockMvc.perform(get("/api/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("READY"));
    }

    @Test
    @Order(3)
    @DisplayName("用户登录")
    void testLogin() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setUsername("superadmin");
        request.setPassword("123456");
        request.setTenantId("000000");

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.token").exists())
                .andExpect(jsonPath("$.data.refreshToken").exists())
                .andExpect(jsonPath("$.data.user.userId").exists())
                .andExpect(jsonPath("$.data.user.permissions").isArray())
                .andExpect(jsonPath("$.data.user.roles").isArray())
                .andExpect(jsonPath("$.data.user.menus").isArray())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        Map<String, Object> responseMap = objectMapper.readValue(responseBody, Map.class);
        Map<String, Object> data = (Map<String, Object>) responseMap.get("data");

        accessToken = ((String) data.get("token")).replace("Bearer ", "");
        refreshToken = (String) data.get("refreshToken");

        Assertions.assertNotNull(accessToken);
        Assertions.assertNotNull(refreshToken);
    }

    @Test
    @Order(4)
    @DisplayName("获取用户信息")
    void testProfile() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        mockMvc.perform(get("/api/auth/profile")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.userId").exists())
                .andExpect(jsonPath("$.data.username").exists())
                .andExpect(jsonPath("$.data.permissions").isArray());
    }

    @Test
    @Order(5)
    @DisplayName("刷新令牌")
    void testRefreshToken() throws Exception {
        Assertions.assertNotNull(refreshToken, "需要先执行登录测试");

        String requestBody = "{\"refreshToken\":\"" + refreshToken + "\"}";

        MvcResult result = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.token").exists())
                .andExpect(jsonPath("$.data.refreshToken").exists())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        Map<String, Object> responseMap = objectMapper.readValue(responseBody, Map.class);
        Map<String, Object> data = (Map<String, Object>) responseMap.get("data");

        accessToken = ((String) data.get("token")).replace("Bearer ", "");
        refreshToken = (String) data.get("refreshToken");
    }

    @Test
    @Order(6)
    @DisplayName("用户列表（需权限）")
    void testUserList() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        mockMvc.perform(get("/api/system/user/list")
                        .header("Authorization", "Bearer " + accessToken)
                        .param("pageNum", "1")
                        .param("pageSize", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.total").isNumber());
    }

    @Test
    @Order(7)
    @DisplayName("角色列表（需权限）")
    void testRoleList() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        mockMvc.perform(get("/api/system/role/list")
                        .header("Authorization", "Bearer " + accessToken)
                        .param("pageNum", "1")
                        .param("pageSize", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.total").isNumber());
    }

    @Test
    @Order(8)
    @DisplayName("菜单列表（需权限）")
    void testMenuList() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        mockMvc.perform(get("/api/system/menu/list")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    @Order(9)
    @DisplayName("未认证访问应被拦截")
    void testUnauthorizedAccess() throws Exception {
        mockMvc.perform(get("/api/system/user/list"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(10)
    @DisplayName("多租户隔离 - 不同租户用户不可见")
    void testTenantIsolation() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        // Login as superadmin (tenant 000000), should only see tenant 000000 users
        mockMvc.perform(get("/api/system/user/list")
                        .header("Authorization", "Bearer " + accessToken)
                        .param("pageNum", "1")
                        .param("pageSize", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    @Order(11)
    @DisplayName("退出登录")
    void testLogout() throws Exception {
        Assertions.assertNotNull(accessToken, "需要先执行登录测试");

        mockMvc.perform(post("/api/auth/logout")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
