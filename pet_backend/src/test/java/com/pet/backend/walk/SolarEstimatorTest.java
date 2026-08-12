package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

class SolarEstimatorTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Test
    void 하늘상태_계수는_맑음_구름많음_흐림_순으로_작아진다() {
        double clear = SolarEstimator.skyFactor(1, 0);
        double partlyCloudy = SolarEstimator.skyFactor(3, 0);
        double cloudy = SolarEstimator.skyFactor(4, 0);

        assertThat(clear).isEqualTo(1.0);
        assertThat(partlyCloudy).isEqualTo(0.65);
        assertThat(cloudy).isEqualTo(0.35);
        assertThat(clear).isGreaterThan(partlyCloudy).isGreaterThan(cloudy);
    }

    @Test
    void 강수중이면_하늘상태와_무관하게_가장_낮은_계수다() {
        double raining = SolarEstimator.skyFactor(1, 1);

        assertThat(raining).isEqualTo(0.2);
    }

    @Test
    void 알수없는_하늘상태코드는_보수적으로_맑음_계수를_쓴다() {
        double unknown = SolarEstimator.skyFactor(99, 0);

        assertThat(unknown).isEqualTo(1.0);
    }

    @Test
    void 자정에는_청천_일사량이_0이다() {
        // 정오와 12시간 떨어진 자정은 태양고도가 음수이므로 max(0, ...)에 의해 0이 되어야 한다.
        ZonedDateTime midnight = ZonedDateTime.of(2026, 8, 12, 0, 0, 0, 0, KST);

        double solar = SolarEstimator.clearSkySolar(37.5665, 126.9780, midnight);

        assertThat(solar).isEqualTo(0.0);
    }

    @Test
    void 정오_근처에는_청천_일사량이_양수다() {
        ZonedDateTime noon = ZonedDateTime.of(2026, 8, 12, 12, 0, 0, 0, KST);

        double solar = SolarEstimator.clearSkySolar(37.5665, 126.9780, noon);

        assertThat(solar).isGreaterThan(0.0);
    }
}
