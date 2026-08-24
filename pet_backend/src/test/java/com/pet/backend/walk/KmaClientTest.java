package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.pet.backend.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * KMA_SERVICE_KEY 미설정 시 mock 폴백 동작(실제 기상청 API는 호출하지 않는다) +
 * 키가 설정된 경로의 응답 처리(QA M-1 resultCode 검증, M-2 숫자 파싱 실패 변환)를 검증한다.
 * 후자는 {@link MockRestServiceServer}로 실제 네트워크 호출 없이 응답만 가로챈다
 * (패키지 전용 생성자 {@code KmaClient(String, RestClient)}는 테스트 전용 — KmaClient 참고).
 */
class KmaClientTest {

    private static final String BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

    @Test
    void 서비스키가_비어있으면_결정적_mock_날씨를_반환한다() {
        KmaClient kmaClient = new KmaClient("");

        KmaWeatherSnapshot snapshot = kmaClient.fetch(60, 127);

        assertThat(snapshot.airTemp()).isEqualTo(30.0);
        assertThat(snapshot.windSpeed()).isEqualTo(1.5);
        assertThat(snapshot.humidity()).isEqualTo(60.0);
        assertThat(snapshot.pty()).isZero();
        assertThat(snapshot.sky()).isEqualTo(1);
        assertThat(snapshot.baseTime()).hasSize(12);
    }

    @Test
    void 서비스키가_null이어도_mock_날씨를_반환한다() {
        KmaClient kmaClient = new KmaClient(null);

        KmaWeatherSnapshot snapshot = kmaClient.fetch(60, 127);

        assertThat(snapshot.airTemp()).isEqualTo(30.0);
    }

    @Test
    void resultCode가_00이_아니면_WEATHER_FETCH_FAILED로_변환한다() {
        // QA M-1: NODATA_ERROR(resultCode=03) 응답 — body 없이 header만으로도 여기서 걸러져야 한다.
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        KmaClient kmaClient = new KmaClient("test-key", restClient);

        server.expect(requestTo(containsString("/getUltraSrtNcst")))
                .andRespond(withSuccess(
                        """
                        {"response":{"header":{"resultCode":"03","resultMsg":"NODATA_ERROR"}}}
                        """,
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> kmaClient.fetch(60, 127))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(WalkErrorCode.WEATHER_FETCH_FAILED);
    }

    @Test
    void 관측값_파싱에_실패하면_500이_아닌_WEATHER_FETCH_FAILED로_변환한다() {
        // QA M-2: 기상청이 200으로 응답했지만 값이 비정상("-")인 경우 —
        // NumberFormatException이 그대로 새어나가면 안 되고 502(WEATHER_FETCH_FAILED)로 변환돼야 한다.
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        KmaClient kmaClient = new KmaClient("test-key", restClient);

        server.expect(requestTo(containsString("/getUltraSrtNcst")))
                .andRespond(withSuccess(
                        """
                        {"response":{"header":{"resultCode":"00","resultMsg":"NORMAL_SERVICE"},
                        "body":{"items":{"item":[
                        {"category":"T1H","obsrValue":"-"},
                        {"category":"REH","obsrValue":"60"},
                        {"category":"WSD","obsrValue":"1.5"},
                        {"category":"PTY","obsrValue":"0"}
                        ]}}}}
                        """,
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/getUltraSrtFcst")))
                .andRespond(withSuccess(
                        """
                        {"response":{"header":{"resultCode":"00","resultMsg":"NORMAL_SERVICE"},
                        "body":{"items":{"item":[
                        {"category":"SKY","fcstDate":"20260812","fcstTime":"1400","fcstValue":"1"}
                        ]}}}}
                        """,
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> kmaClient.fetch(60, 127))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(WalkErrorCode.WEATHER_FETCH_FAILED);
    }
}
