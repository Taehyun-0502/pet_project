package com.pet.backend.aisearch;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.common.BusinessException;
import com.pet.backend.place.PlaceService;
import com.pet.backend.prediction.DiseasePredictionClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * AiSearchService 단위 테스트 — Claude API를 실제로 호출하지 않고, ANTHROPIC_API_KEY
 * 미설정 시의 호출 시점 가드(QA L-9)만 검증한다. 정상 호출(tool use 루프)은 외부 API
 * 연동이라 이 스위트에서 다루지 않는다(AiSearchControllerTest가 컨트롤러 계층까지 mock 처리).
 */
@ExtendWith(MockitoExtension.class)
class AiSearchServiceTest {

    @Mock
    private PlaceService placeService;

    @Mock
    private DiseasePredictionClient diseasePredictionClient;

    @Test
    void API_키가_비어있으면_호출_시점에_즉시_도메인_예외를_던진다() {
        AiSearchService service = new AiSearchService(
                "", "claude-sonnet-5", placeService, diseasePredictionClient, new ObjectMapper());

        assertThatThrownBy(() -> service.ask(new AiSearchRequest("안녕", 1L)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    BusinessException businessException = (BusinessException) e;
                    org.assertj.core.api.Assertions.assertThat(businessException.getErrorCode())
                            .isEqualTo(AiSearchErrorCode.API_KEY_NOT_CONFIGURED);
                });
    }

    @Test
    void API_키가_공백_문자열이어도_설정되지_않은_것으로_취급한다() {
        AiSearchService service = new AiSearchService(
                "   ", "claude-sonnet-5", placeService, diseasePredictionClient, new ObjectMapper());

        assertThatThrownBy(() -> service.ask(new AiSearchRequest("안녕", 1L)))
                .isInstanceOf(BusinessException.class);
    }
}
