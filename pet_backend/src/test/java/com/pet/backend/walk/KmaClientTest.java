package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * KMA_SERVICE_KEY 미설정 시 mock 폴백 동작 검증(실제 기상청 API는 호출하지 않는다).
 * 키가 설정된 경로(RestClient 실제 호출)는 외부 API 의존이라 단위 테스트 범위에서 제외한다
 * (KakaoClient도 동일 방침).
 */
class KmaClientTest {

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
}
