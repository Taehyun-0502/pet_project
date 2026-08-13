package com.pet.backend.place;

import com.pet.backend.common.BusinessException;
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
    private static final int SEARCH_RADIUS_METERS = 5_000; // "이 지역" 재검색이 의미 있도록 5km (20km는 도시 전체가 잡혀 지역 구분이 안 됨)
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestClient restClient;
    private final boolean apiKeyConfigured;

    // application.properties의 kakao.rest-api-key는 ${KAKAO_REST_API_KEY:} 빈 기본값을 둔다 —
    // 이 값을 필수로 만들면(기본값 제거) .env 없이 뜨는 모든 환경(예: place와 무관한 슬라이스
    // 테스트나 로컬 최초 세팅)에서 전체 애플리케이션 컨텍스트가 기동조차 못 하게 되어 파급이 크다.
    // 대신 여기서 즉시 경고 로그를 남기고(QA M-6), 실제 호출 시점에 원인이 분명한 예외를 던진다 —
    // 이전엔 빈 키로 호출해 카카오가 401을 반환하면 KakaoClient가 이를 일반 RestClientException과
    // 동일하게 처리해 "카카오 응답 실패"로만 보였고, 키 미설정이라는 근본 원인이 드러나지 않았다.
    public KakaoClient(@Value("${kakao.rest-api-key}") String restApiKey) {
        this.apiKeyConfigured = restApiKey != null && !restApiKey.isBlank();
        if (!apiKeyConfigured) {
            log.warn("kakao.rest-api-key(KAKAO_REST_API_KEY)가 설정되지 않았습니다. "
                    + "장소 검색 API 호출 시 예외가 발생합니다 — .env의 KAKAO_REST_API_KEY를 확인하세요.");
        }

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
        if (!apiKeyConfigured) {
            // 카카오에 요청조차 보내지 않고 여기서 즉시 실패시켜, 401 응답을 일반 API 오류로
            // 오인하지 않고 "키 미설정"임을 로그와 스택트레이스에서 바로 알 수 있게 한다.
            throw new IllegalStateException(
                    "KAKAO_REST_API_KEY가 설정되지 않아 카카오 로컬 API를 호출할 수 없습니다.");
        }
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
            throw new BusinessException(PlaceErrorCode.SEARCH_FAILED);
        }
    }
}
