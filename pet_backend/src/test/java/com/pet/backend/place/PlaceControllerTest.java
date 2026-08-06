package com.pet.backend.place;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PlaceController 슬라이스 테스트. PlaceService는 mock 처리해 카카오 API를 실제로 호출하지 않는다.
 * addFilters=false로 Security 필터 체인을 우회한다 (인증 정책은 멤버 1 담당, 이번 테스트 범위 제외).
 */
@WebMvcTest(PlaceController.class)
@AutoConfigureMockMvc(addFilters = false)
class PlaceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PlaceService placeService;

    @Test
    void 정상_조회하면_카테고리별_장소_목록을_반환한다() throws Exception {
        List<Place> places = List.of(
                new Place("행복 동물병원", PlaceCategory.HOSPITAL, 37.5, 127.0, "서울 강남구",
                        "http://place.map.kakao.com/1", "02-1234-5678", "반려동물 > 동물병원"),
                new Place("멍멍 카페", PlaceCategory.CAFE, 37.51, 127.01, "서울 서초구",
                        "http://place.map.kakao.com/2", "", "반려동물 > 애견카페")
        );
        when(placeService.searchAll(List.of(PlaceCategory.HOSPITAL, PlaceCategory.CAFE), 37.5665, 126.9780))
                .thenReturn(places);

        mockMvc.perform(get("/api/places")
                        .param("lat", "37.5665")
                        .param("lng", "126.9780")
                        .param("categories", "HOSPITAL,CAFE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.places[0].name").value("행복 동물병원"))
                .andExpect(jsonPath("$.data.places[0].category").value("HOSPITAL"))
                .andExpect(jsonPath("$.data.places[0].phone").value("02-1234-5678"))
                .andExpect(jsonPath("$.data.places[0].categoryDetail").value("반려동물 > 동물병원"))
                .andExpect(jsonPath("$.data.places[1].category").value("CAFE"));
    }

    @Test
    void categories를_생략하면_전체_3개_카테고리로_조회한다() throws Exception {
        when(placeService.searchAll(anyList(), anyDouble(), anyDouble())).thenReturn(List.of());

        mockMvc.perform(get("/api/places")
                        .param("lat", "37.5665")
                        .param("lng", "126.9780"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(placeService).searchAll(
                List.of(PlaceCategory.HOSPITAL, PlaceCategory.CAFE, PlaceCategory.HOTEL),
                37.5665, 126.9780);
    }

    @Test
    void lat이_범위를_초과하면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/places")
                        .param("lat", "200")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void lat이_없으면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/places")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void lng이_범위를_초과하면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/places")
                        .param("lat", "37.5665")
                        .param("lng", "-200"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // QA M-1: 타입 불일치 파라미터가 500이 아닌 400/VALIDATION_ERROR로 응답해야 한다.

    @Test
    void lat이_숫자가_아니면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/places")
                        .param("lat", "abc")
                        .param("lng", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                // QA N-7: enum이 아닌 타입은 일반 문구 — 내부 타입명(Double 등) 노출 금지
                .andExpect(jsonPath("$.error.message").value("lat의 형식이 올바르지 않습니다."));
    }

    @Test
    void categories에_정의되지_않은_값이_오면_400을_반환한다() throws Exception {
        mockMvc.perform(get("/api/places")
                        .param("lat", "37.5665")
                        .param("lng", "126.9780")
                        .param("categories", "FOO"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                // QA N-7: enum 타입은 내부 클래스명(PlaceCategory) 대신 허용값 목록을 안내
                .andExpect(jsonPath("$.error.message").value("categories는 HOSPITAL, CAFE, HOTEL 중 하나여야 합니다."));
    }
}
