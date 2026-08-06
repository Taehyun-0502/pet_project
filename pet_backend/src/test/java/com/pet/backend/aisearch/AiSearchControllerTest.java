package com.pet.backend.aisearch;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.place.Place;
import com.pet.backend.place.PlaceCategory;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * AiSearchController 슬라이스 테스트. 외부 API(Claude, 카카오)를 실제로 호출하지 않도록
 * AiSearchService 자체를 mock 처리한다 — 컨트롤러의 검증/응답 변환 책임만 검증한다.
 * addFilters=false로 Security 필터 체인을 우회해 인증 없이도 컨트롤러 계층을 독립적으로 검증한다
 * (인증 정책 자체는 멤버 1 담당 영역이라 이번 Phase 테스트 범위에서 제외).
 */
@WebMvcTest(AiSearchController.class)
@AutoConfigureMockMvc(addFilters = false)
class AiSearchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AiSearchService aiSearchService;

    @Test
    void 정상_요청이면_챗봇_응답과_추천_장소_목록을_반환한다() throws Exception {
        AiSearchRequest request = new AiSearchRequest("우리 강아지 요즘 다리를 절뚝여요", 1L);
        Place place = new Place("행복 동물병원", PlaceCategory.HOSPITAL, 37.5, 127.0, "서울 강남구", "http://place.map.kakao.com/1", "02-1234-5678", "반려동물 > 동물병원");
        AiSearchResponse response = new AiSearchResponse("슬개골 탈구가 의심되니 근처 병원 방문을 권해드려요.", List.of(place));
        when(aiSearchService.ask(any())).thenReturn(response);

        mockMvc.perform(post("/api/ai-search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.message").value("슬개골 탈구가 의심되니 근처 병원 방문을 권해드려요."))
                .andExpect(jsonPath("$.data.places[0].name").value("행복 동물병원"))
                .andExpect(jsonPath("$.data.places[0].category").value("HOSPITAL"));
    }

    @Test
    void 현재_위치_좌표가_포함되어도_200으로_수용된다() throws Exception {
        AiSearchRequest request = new AiSearchRequest("근처 동물병원 찾아줘", 1L, 37.5665, 126.9780);
        Place place = new Place("행복 동물병원", PlaceCategory.HOSPITAL, 37.5, 127.0, "서울 강남구", "http://place.map.kakao.com/1", "02-1234-5678", "반려동물 > 동물병원");
        AiSearchResponse response = new AiSearchResponse("근처 동물병원을 찾아드렸어요.", List.of(place));
        when(aiSearchService.ask(any())).thenReturn(response);

        mockMvc.perform(post("/api/ai-search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.message").value("근처 동물병원을 찾아드렸어요."));
    }

    @Test
    void 메시지가_비어있으면_400을_반환한다() throws Exception {
        AiSearchRequest request = new AiSearchRequest("", 1L);

        mockMvc.perform(post("/api/ai-search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void petId가_없으면_400을_반환한다() throws Exception {
        String invalidJson = "{\"message\":\"안녕\"}";

        mockMvc.perform(post("/api/ai-search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
