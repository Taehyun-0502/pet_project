package com.pet.backend.walk;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * WalkRecordController 슬라이스 테스트. WalkRecordService(→ Repository·PetService)는 mock
 * 처리해 실 DB에 접속하지 않는다(소유권 검증 로직 자체는 WalkRecordServiceTest에서 검증).
 *
 * <p>addFilters=false로 JwtAuthenticationFilter는 타지 않지만, {@code @AuthenticationPrincipal}은
 * SecurityContextHolder의 Authentication만 보고 동작하므로 각 테스트가 필요할 때
 * {@link #authenticateAs}로 직접 채워 넣는다(스프링 시큐리티 필터가 평소에 하는 일을
 * 테스트에서 대신하는 것 — spring-security-test 의존성 추가 없이 가능).
 */
@WebMvcTest(WalkRecordController.class)
@AutoConfigureMockMvc(addFilters = false)
class WalkRecordControllerTest {

    private static final Long MEMBER_ID = 100L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private WalkRecordService walkRecordService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(Long memberId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(memberId, null, List.of()));
    }

    private String validBody() throws Exception {
        return objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800,
                1200.5,
                List.of(new GeoPoint(37.5665, 126.9780), new GeoPoint(37.5670, 126.9790)),
                31.2,
                47.5
        ));
    }

    @Test
    void 정상_요청이면_기록을_저장하고_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        WalkRecordResponse response = new WalkRecordResponse(
                1L, 1L,
                Instant.parse("2026-08-12T05:00:00Z"), Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5,
                Instant.parse("2026-08-12T05:30:01Z"));
        when(walkRecordService.create(eq(MEMBER_ID), any())).thenReturn(response);

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.distanceMeters").value(1200.5));
    }

    @Test
    void 인증된_memberId를_서비스에_그대로_전달한다() throws Exception {
        authenticateAs(MEMBER_ID);
        WalkRecordResponse response = new WalkRecordResponse(
                1L, 1L,
                Instant.parse("2026-08-12T05:00:00Z"), Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5, List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5, Instant.parse("2026-08-12T05:30:01Z"));
        when(walkRecordService.create(any(), any())).thenReturn(response);

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(walkRecordService).create(eq(MEMBER_ID), any());
    }

    @Test
    void path가_비어있으면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(),
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void startedAt이_endedAt보다_늦으면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:30:00Z"),
                Instant.parse("2026-08-12T05:00:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void distanceMeters가_음수면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, -5.0,
                List.of(new GeoPoint(37.5665, 126.9780)),
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // QA H-1 ③ — petId는 더 이상 선택이 아니다. 프론트는 이미 항상 petId를 보내고 있었고,
    // 누락을 허용하면 소유권을 검증할 대상 자체가 없어 IDOR 방지가 무의미해진다.
    @Test
    void petId가_없으면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                null,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void path_좌표가_한반도_범위를_벗어나면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        // QA M-3: GeoPoint 범위 검증 경계 테스트 — 위도 90.0(전역 범위로는 유효하나 한반도 밖)
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(90.0, 126.9780)),
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void path가_최대_길이를_초과하면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        // QA M-3: @Size(max = 20000) 경계 테스트 — 20001개면 거부돼야 한다.
        List<GeoPoint> tooLongPath = new ArrayList<>();
        for (int i = 0; i < 20001; i++) {
            tooLongPath.add(new GeoPoint(37.5665, 126.9780));
        }
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                tooLongPath,
                null, null
        ));

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void 목록_조회는_limit_기본값_20으로_동작한다() throws Exception {
        authenticateAs(MEMBER_ID);
        when(walkRecordService.list(MEMBER_ID, 20)).thenReturn(List.of());

        mockMvc.perform(get("/api/walk/records"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.records").isArray());
    }

    @Test
    void 목록_조회는_인증된_memberId를_서비스에_그대로_전달한다() throws Exception {
        authenticateAs(MEMBER_ID);
        when(walkRecordService.list(anyLong(), eq(20))).thenReturn(List.of());

        mockMvc.perform(get("/api/walk/records"))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(walkRecordService).list(MEMBER_ID, 20);
    }

    @Test
    void limit이_0이하면_400을_반환한다() throws Exception {
        authenticateAs(MEMBER_ID);
        mockMvc.perform(get("/api/walk/records").param("limit", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
