package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RiskLevelTest {

    @Test
    void 온도_24점9도는_SAFE다() {
        assertThat(RiskLevel.from(24.9)).isEqualTo(RiskLevel.SAFE);
    }

    @Test
    void 온도_25도는_CAUTION_경계다() {
        assertThat(RiskLevel.from(25.0)).isEqualTo(RiskLevel.CAUTION);
    }

    @Test
    void 온도_34점9도는_CAUTION이다() {
        assertThat(RiskLevel.from(34.9)).isEqualTo(RiskLevel.CAUTION);
    }

    @Test
    void 온도_35도는_DANGER_경계다() {
        assertThat(RiskLevel.from(35.0)).isEqualTo(RiskLevel.DANGER);
    }

    @Test
    void 온도_49점9도는_DANGER이다() {
        assertThat(RiskLevel.from(49.9)).isEqualTo(RiskLevel.DANGER);
    }

    @Test
    void 온도_50도는_SEVERE_경계다() {
        assertThat(RiskLevel.from(50.0)).isEqualTo(RiskLevel.SEVERE);
    }

    @Test
    void 온도_60도는_SEVERE다() {
        assertThat(RiskLevel.from(60.0)).isEqualTo(RiskLevel.SEVERE);
    }
}
