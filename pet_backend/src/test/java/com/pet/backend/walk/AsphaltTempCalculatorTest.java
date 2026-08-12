package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class AsphaltTempCalculatorTest {

    @Test
    void 기온32_일사700_풍속2이면_약_53_3도다() {
        double result = AsphaltTempCalculator.calculate(32.0, 2.0, 700.0);

        assertThat(result).isCloseTo(53.3, within(0.1));
    }

    @Test
    void 야간_일사량0이면_아스팔트온도는_기온과_같다() {
        double result = AsphaltTempCalculator.calculate(20.0, 3.0, 0.0);

        assertThat(result).isEqualTo(20.0);
    }

    @Test
    void 풍속이_높을수록_아스팔트온도_상승폭이_줄어든다() {
        double lowWind = AsphaltTempCalculator.calculate(30.0, 0.5, 500.0);
        double highWind = AsphaltTempCalculator.calculate(30.0, 10.0, 500.0);

        assertThat(highWind).isLessThan(lowWind);
    }
}
