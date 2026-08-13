package com.pet.backend.walk;

import com.pet.backend.common.BusinessException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 기상청 단기예보 조회서비스(공공데이터포털) 호출 — 초단기실황(T1H/WSD/REH/PTY) +
 * 초단기예보(SKY). walk 도메인 내부 구현 — WalkWeatherService만 이 클래스를 참조한다.
 *
 * <p>KAKAO_REST_API_KEY와 같은 이유로 kma.service-key는 빈 기본값을 둔다
 * (${@code ${KMA_SERVICE_KEY:}}) — 필수로 만들면 키 없이 뜨는 모든 환경에서 애플리케이션
 * 컨텍스트 자체가 기동하지 못한다. 대신 <b>키가 비어 있으면 mock 날씨로 폴백</b>한다
 * (KakaoClient처럼 예외를 던지지 않는 이유: 날씨는 산책 페이지의 핵심 배너라 키 발급 전에도
 * 화면이 통째로 막히면 안 되고, prediction.mode=mock과 같은 "키 발급 전 데모 가능" 방침을
 * 따른다 — 루트 CLAUDE.md 산책 Phase 확정사항).
 */
@Slf4j
@Component
class KmaClient {

    private static final String BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter FCST_DATETIME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    // 키 미설정 시 폴백하는 결정적 고정값 — 기동 시 경고 로그 1회, 응답 자체는 항상 성공한다.
    private static final double MOCK_AIR_TEMP = 30.0;
    private static final double MOCK_WIND_SPEED = 1.5;
    private static final double MOCK_HUMIDITY = 60.0;
    private static final int MOCK_PTY = 0;
    private static final int MOCK_SKY = 1;

    private final RestClient restClient;
    private final String serviceKey;
    private final boolean serviceKeyConfigured;

    public KmaClient(@Value("${kma.service-key}") String serviceKey) {
        this.serviceKey = serviceKey;
        this.serviceKeyConfigured = serviceKey != null && !serviceKey.isBlank();
        if (!serviceKeyConfigured) {
            log.warn("kma.service-key(KMA_SERVICE_KEY)가 설정되지 않았습니다. "
                    + "산책 날씨 API가 mock 값으로 폴백합니다 — .env의 KMA_SERVICE_KEY를 확인하세요.");
        }

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);

        this.restClient = RestClient.builder()
                .baseUrl(BASE_URL)
                .requestFactory(requestFactory)
                .build();
    }

    KmaWeatherSnapshot fetch(int nx, int ny) {
        if (!serviceKeyConfigured) {
            return mockSnapshot();
        }
        try {
            ZonedDateTime now = ZonedDateTime.now(KST);

            KmaBaseTime ncstBase = KmaBaseTime.forUltraSrtNcst(now);
            KmaNcstResponse ncstResponse = requestNcst(nx, ny, ncstBase);
            Map<String, String> ncstValues = toCategoryMap(ncstResponse);

            KmaBaseTime fcstBase = KmaBaseTime.forUltraSrtFcst(now);
            KmaFcstResponse fcstResponse = requestFcst(nx, ny, fcstBase);
            int sky = nearestSky(fcstResponse, now);

            return new KmaWeatherSnapshot(
                    requireDouble(ncstValues, "T1H"),
                    requireDouble(ncstValues, "REH"),
                    requireDouble(ncstValues, "WSD"),
                    (int) requireDouble(ncstValues, "PTY"),
                    sky,
                    ncstBase.baseDate() + ncstBase.baseTime());
        } catch (RestClientException e) {
            log.warn("기상청 API 호출 실패 — nx={}, ny={}", nx, ny, e);
            throw new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED);
        }
    }

    private KmaNcstResponse requestNcst(int nx, int ny, KmaBaseTime base) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/getUltraSrtNcst")
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("dataType", "JSON")
                        .queryParam("base_date", base.baseDate())
                        .queryParam("base_time", base.baseTime())
                        .queryParam("nx", nx)
                        .queryParam("ny", ny)
                        .queryParam("numOfRows", 10)
                        .queryParam("pageNo", 1)
                        .build())
                .retrieve()
                .body(KmaNcstResponse.class);
    }

    private KmaFcstResponse requestFcst(int nx, int ny, KmaBaseTime base) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/getUltraSrtFcst")
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("dataType", "JSON")
                        .queryParam("base_date", base.baseDate())
                        .queryParam("base_time", base.baseTime())
                        .queryParam("nx", nx)
                        .queryParam("ny", ny)
                        .queryParam("numOfRows", 60)
                        .queryParam("pageNo", 1)
                        .build())
                .retrieve()
                .body(KmaFcstResponse.class);
    }

    private Map<String, String> toCategoryMap(KmaNcstResponse response) {
        List<KmaNcstResponse.Item> items = extractItems(response);
        // 같은 카테고리가 중복 오면 마지막 값을 채택(발생하지 않는 게 정상이나 방어적으로)
        return items.stream()
                .collect(Collectors.toMap(KmaNcstResponse.Item::category, KmaNcstResponse.Item::obsrValue,
                        (a, b) -> b));
    }

    private List<KmaNcstResponse.Item> extractItems(KmaNcstResponse response) {
        if (response == null || response.response() == null || response.response().body() == null
                || response.response().body().items() == null
                || response.response().body().items().item() == null) {
            return List.of();
        }
        return response.response().body().items().item();
    }

    private double requireDouble(Map<String, String> values, String category) {
        String raw = values.get(category);
        if (raw == null) {
            log.warn("기상청 응답에 카테고리 {} 값이 없습니다.", category);
            throw new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED);
        }
        return Double.parseDouble(raw);
    }

    // 초단기예보는 여러 fcstTime의 값이 함께 오므로(수 시간치), 호출 시각에 가장 가까운
    // SKY 값을 고른다 — "현재 시각에 가장 가까운 fcstTime 값 사용" 기획 확정사항.
    private int nearestSky(KmaFcstResponse response, ZonedDateTime now) {
        List<KmaFcstResponse.Item> items = extractItems(response);
        return items.stream()
                .filter(item -> "SKY".equals(item.category()))
                .min(Comparator.comparingLong(item -> Math.abs(
                        Duration.between(parseFcstDateTime(item), now).toMinutes())))
                .map(item -> Integer.parseInt(item.fcstValue()))
                .orElseThrow(() -> {
                    log.warn("기상청 응답에 SKY 예보 값이 없습니다.");
                    return new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED);
                });
    }

    private List<KmaFcstResponse.Item> extractItems(KmaFcstResponse response) {
        if (response == null || response.response() == null || response.response().body() == null
                || response.response().body().items() == null
                || response.response().body().items().item() == null) {
            return List.of();
        }
        return response.response().body().items().item();
    }

    private ZonedDateTime parseFcstDateTime(KmaFcstResponse.Item item) {
        return LocalDateTime.parse(item.fcstDate() + item.fcstTime(), FCST_DATETIME_FORMAT).atZone(KST);
    }

    private KmaWeatherSnapshot mockSnapshot() {
        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(ZonedDateTime.now(KST));
        return new KmaWeatherSnapshot(MOCK_AIR_TEMP, MOCK_HUMIDITY, MOCK_WIND_SPEED, MOCK_PTY, MOCK_SKY,
                base.baseDate() + base.baseTime());
    }
}
