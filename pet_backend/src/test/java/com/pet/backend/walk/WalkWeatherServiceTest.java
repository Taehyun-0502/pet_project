package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * WalkWeatherService 단위 테스트 — KmaClient는 mock 처리하고, 격자 셀 캐시 동작과
 * 응답 조합(riskLevel 산출까지)을 검증한다. DB/Spring 컨텍스트 없이 동작한다.
 */
@ExtendWith(MockitoExtension.class)
class WalkWeatherServiceTest {

    @Mock
    private KmaClient kmaClient;

    private WalkWeatherService walkWeatherService;

    @BeforeEach
    void setUp() {
        walkWeatherService = new WalkWeatherService(kmaClient, Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(10))
                .maximumSize(500)
                .build());
    }

    @Test
    void 동일한_격자로_재조회하면_캐시를_사용하고_기상청_API를_다시_호출하지_않는다() {
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(30.0, 60.0, 1.5, 0, 1, "202608121400"));

        walkWeatherService.getWeather(37.5665, 126.9780);
        walkWeatherService.getWeather(37.5665, 126.9780);

        verify(kmaClient, times(1)).fetch(anyInt(), anyInt());
    }

    @Test
    void 응답에는_기온_습도_풍속과_계산된_위험단계가_담긴다() {
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(30.0, 60.0, 1.5, 0, 1, "202608121400"));

        WalkWeatherResponse response = walkWeatherService.getWeather(37.5665, 126.9780);

        assertThat(response.airTemp()).isEqualTo(30.0);
        assertThat(response.humidity()).isEqualTo(60.0);
        assertThat(response.windSpeed()).isEqualTo(1.5);
        assertThat(response.baseTime()).isEqualTo("202608121400");
        // 태양고도·하늘상태에 따라 solar/asphaltTemp는 시각마다 달라지므로 riskLevel enum 값만
        // 존재를 확인하고, 경계 로직 자체는 RiskLevelTest가 검증한다.
        assertThat(response.riskLevel()).isNotNull();
    }
}
