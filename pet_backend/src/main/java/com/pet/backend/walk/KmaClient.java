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
import org.springframework.beans.factory.annotation.Autowired;
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
    private static final String SUCCESS_RESULT_CODE = "00"; // 공공데이터포털 공통 규격 — "00"이 정상

    // 키 미설정 시 폴백하는 결정적 고정값 — 기동 시 경고 로그 1회, 응답 자체는 항상 성공한다.
    private static final double MOCK_AIR_TEMP = 30.0;
    private static final double MOCK_WIND_SPEED = 1.5;
    private static final double MOCK_HUMIDITY = 60.0;
    private static final int MOCK_PTY = 0;
    private static final int MOCK_SKY = 1;

    private final RestClient restClient;
    private final String serviceKey;
    private final boolean serviceKeyConfigured;

    // 테스트 전용 생성자(KmaClient(String, RestClient))가 추가되면서 생성자가 2개가 됐다 —
    // Spring이 어느 쪽을 빈 생성에 쓸지 모호해지지 않도록 명시적으로 지정한다.
    @Autowired
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

    // 테스트에서 MockRestServiceServer로 실제 HTTP 왕복 없이 응답 파싱 경로(resultCode 검증,
    // 숫자 파싱 실패 등)를 검증할 수 있도록 열어둔 패키지 전용 생성자(QA M-1·M-2 테스트용).
    KmaClient(String serviceKey, RestClient restClient) {
        this.serviceKey = serviceKey;
        this.serviceKeyConfigured = serviceKey != null && !serviceKey.isBlank();
        this.restClient = restClient;
    }

    // WalkWeatherService가 격자 캐시 적재 여부를 판단하는 데 쓴다 — mock 폴백 스냅샷까지
    // 캐시하면 키를 늦게 등록해도 최대 10분 동안 mock 값이 유지되는 문제가 있었다(QA L-2).
    boolean isServiceKeyConfigured() {
        return serviceKeyConfigured;
    }

    KmaWeatherSnapshot fetch(int nx, int ny) {
        if (!serviceKeyConfigured) {
            return mockSnapshot();
        }
        try {
            ZonedDateTime now = ZonedDateTime.now(KST);

            KmaBaseTime ncstBase = KmaBaseTime.forUltraSrtNcst(now);
            KmaNcstResponse ncstResponse = requestNcst(nx, ny, ncstBase);
            requireSuccess(headerOf(ncstResponse));
            Map<String, String> ncstValues = toCategoryMap(ncstResponse);

            KmaBaseTime fcstBase = KmaBaseTime.forUltraSrtFcst(now);
            KmaFcstResponse fcstResponse = requestFcst(nx, ny, fcstBase);
            requireSuccess(headerOf(fcstResponse));
            int sky = nearestSky(fcstResponse, now);

            return new KmaWeatherSnapshot(
                    requireDouble(ncstValues, "T1H"),
                    requireDouble(ncstValues, "REH"),
                    requireDouble(ncstValues, "WSD"),
                    (int) requireDouble(ncstValues, "PTY"),
                    sky,
                    ncstBase.baseDate() + ncstBase.baseTime());
        } catch (RestClientException | NumberFormatException e) {
            // NumberFormatException도 여기서 잡는다(QA M-2) — 기상청이 200으로 응답했지만
            // 값이 비정상("-" 등)인 경우까지 포함해, 호출 실패와 동일하게 502로 변환한다
            // (그러지 않으면 예외가 그대로 새어나가 500으로 떨어져 원인 파악이 어려워진다).
            log.warn("기상청 API 호출/응답 처리 실패 — nx={}, ny={}", nx, ny, e);
            throw new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED);
        }
    }

    // resultCode가 "00"(정상)이 아니면 502로 변환한다(QA M-1). 메시지에 서비스 키가 절대
    // 포함되지 않도록 resultCode·resultMsg만 로그에 남긴다.
    private void requireSuccess(Header header) {
        String resultCode = header == null ? null : header.resultCode();
        if (!SUCCESS_RESULT_CODE.equals(resultCode)) {
            String resultMsg = header == null ? null : header.resultMsg();
            log.warn("기상청 API 응답 실패 — resultCode={}, resultMsg={}", resultCode, resultMsg);
            throw new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED);
        }
    }

    // KmaNcstResponse.Header/KmaFcstResponse.Header는 서로 다른 타입이라 공통 인터페이스가
    // 없다 — 이 두 오버로드가 각자의 null-safe 추출을 맡고, requireSuccess(Header)는
    // 아래 공용 레코드로 통일해 검증 로직 중복을 피한다.
    private Header headerOf(KmaNcstResponse response) {
        if (response == null || response.response() == null || response.response().header() == null) {
            return null;
        }
        KmaNcstResponse.Header header = response.response().header();
        return new Header(header.resultCode(), header.resultMsg());
    }

    private Header headerOf(KmaFcstResponse response) {
        if (response == null || response.response() == null || response.response().header() == null) {
            return null;
        }
        KmaFcstResponse.Header header = response.response().header();
        return new Header(header.resultCode(), header.resultMsg());
    }

    // requireSuccess()가 두 응답 타입을 동일하게 다루기 위한 내부 공용 표현.
    private record Header(String resultCode, String resultMsg) {
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
