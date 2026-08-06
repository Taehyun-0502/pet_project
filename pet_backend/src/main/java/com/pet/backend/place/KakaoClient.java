package com.pet.backend.place;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 카카오 로컬 키워드 검색 API 호출 (docs: https://developers.kakao.com/docs/latest/ko/local/dev-guide).
 * Authorization 헤더는 "KakaoAK {REST API 키}" 형식 — Bearer 아님.
 * place 도메인 내부 구현 — 다른 도메인은 이 클래스를 직접 참조하지 않고 PlaceService만 사용한다.
 */
@Slf4j
@Component
class KakaoClient {

    private static final String KAKAO_LOCAL_BASE_URL = "https://dapi.kakao.com";
    private static final int SEARCH_RADIUS_METERS = 20_000;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestClient restClient;

    public KakaoClient(@Value("${kakao.rest-api-key}") String restApiKey) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);

        this.restClient = RestClient.builder()
                .baseUrl(KAKAO_LOCAL_BASE_URL)
                .defaultHeader("Authorization", "KakaoAK " + restApiKey)
                .requestFactory(requestFactory)
                .build();
    }

    /**
     * 키워드 + 좌표 기반 장소 검색. categoryGroupCode는 결과를 보조로 좁히는 필터로,
     * null이면 키워드만으로 검색한다 (동물병원 등 카카오 표준 카테고리에 없는 업종 대응).
     *
     * 카카오 API 호출 실패(타임아웃/네트워크 오류/4xx·5xx)는 응답 본문이 그대로 예외 메시지에
     * 담길 수 있어(RestClientException) 호출자에게 그대로 흘려보내지 않고, 여기서 잡아
     * 안전한 메시지의 BusinessException으로 감싼다. 원본 예외는 로그로만 남긴다.
     */
    public KakaoSearchResponse searchKeyword(String query, double lat, double lng, String categoryGroupCode) {
        try {
            return restClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/v2/local/search/keyword.json")
                                .queryParam("query", query)
                                .queryParam("x", lng)
                                .queryParam("y", lat)
                                .queryParam("radius", SEARCH_RADIUS_METERS);
                        if (categoryGroupCode != null && !categoryGroupCode.isBlank()) {
                            uriBuilder.queryParam("category_group_code", categoryGroupCode);
                        }
                        return uriBuilder.build();
                    })
                    .retrieve()
                    .body(KakaoSearchResponse.class);
        } catch (RestClientException e) {
            log.warn("카카오 로컬 API 호출 실패: query={}", query, e);
            throw new BusinessException(ErrorCode.PLACE_SEARCH_FAILED);
        }
    }
}
