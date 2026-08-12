package com.pet.backend.walk;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * WalkWeatherController 슬라이스 테스트. WalkWeatherService는 mock 처리해
 * 실제 기상청 API를 호출하지 않는다. addFilters=false로 Security 필터 체인을 우회한다
 * (인증 정책은 멤버 1 담당, place/aisearch 테스트와 동일한 이유로 이번 범위 제외).
 */
@WebMvcTest(WalkWeatherController.class)
@AutoConfigureMockMvc(addFilters = false)
class WalkWeatherControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WalkWeatherService walkWeatherService;

    @Test
    void 정상_조회하면_날씨_정보를_반환한다() throws Exception {
        WalkWeatherResponse response = new WalkWeatherResponse(
                31.2, 65.0, 2.1, 512.0, 47.5, RiskLevel.DANGER, "202608121400");
        when(walkWeatherService.getWeather(37.5665, 126.9780)).thenReturn(response);

        mockMvc.perform(get("/api/walk/weather")
                        .param("lat", "37.5665")
                        .param("lng", "126.9780"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.airTemp").value(31.2))
                .andExpect(jsonPath("$.data.riskLevel").value("DANGER"))
                .andExpect(jsonPath("$.data.baseTime").value("202608121400"));
    }

    @Test
    void lat이_없으면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/walk/weather")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void lat이_한반도_범위를_초과하면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/walk/weather")
                        .param("lat", "10.0")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void lng이_한반도_범위를_초과하면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/walk/weather")
                        .param("lat", "37.5665")
                        .param("lng", "200.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void lat이_숫자가_아니면_400을_반환한다() throws Exception {
        when(walkWeatherService.getWeather(anyDouble(), anyDouble())).thenReturn(
                new WalkWeatherResponse(0, 0, 0, 0, 0, RiskLevel.SAFE, "202608121400"));

        mockMvc.perform(get("/api/walk/weather")
                        .param("lat", "abc")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
