package com.pet.backend.walk;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * WalkRecordController 슬라이스 테스트. WalkRecordService(→ Repository)는 mock 처리해
 * 실 DB에 접속하지 않는다(리포지토리는 WalkRecordServiceTest에서 별도로 mock 검증).
 */
@WebMvcTest(WalkRecordController.class)
@AutoConfigureMockMvc(addFilters = false)
class WalkRecordControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private WalkRecordService walkRecordService;

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
        WalkRecordResponse response = new WalkRecordResponse(
                1L, 1L,
                Instant.parse("2026-08-12T05:00:00Z"), Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5,
                Instant.parse("2026-08-12T05:30:01Z"));
        when(walkRecordService.create(any())).thenReturn(response);

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.distanceMeters").value(1200.5));
    }

    @Test
    void path가_비어있으면_400을_반환한다() throws Exception {
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

    @Test
    void petId가_없어도_저장된다() throws Exception {
        String body = objectMapper.writeValueAsString(new WalkRecordCreateRequest(
                null,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                null, null
        ));
        WalkRecordResponse response = new WalkRecordResponse(
                1L, null,
                Instant.parse("2026-08-12T05:00:00Z"), Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5, List.of(new GeoPoint(37.5665, 126.9780)),
                null, null, Instant.parse("2026-08-12T05:30:01Z"));
        when(walkRecordService.create(any())).thenReturn(response);

        mockMvc.perform(post("/api/walk/records")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void path_좌표가_한반도_범위를_벗어나면_400을_반환한다() throws Exception {
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
        when(walkRecordService.list(20)).thenReturn(List.of());

        mockMvc.perform(get("/api/walk/records"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.records").isArray());
    }

    @Test
    void limit이_0이하면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/walk/records").param("limit", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
