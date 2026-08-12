package com.pet.backend.walk;

/**
 * 아스팔트 온도 기반 위험 단계. UI에는 이 enum 값이 아니라 한국어 라벨·색상만 노출한다
 * (프론트가 매핑 — PlaceCategory와 동일한 방침, 백엔드는 값만 내려준다).
 */
public enum RiskLevel {

    SAFE,     // 25℃ 미만
    CAUTION,  // 25 ~ 35℃
    DANGER,   // 35 ~ 50℃
    SEVERE;   // 50℃ 이상

    static RiskLevel from(double asphaltTemp) {
        if (asphaltTemp < WalkWeatherConstants.RISK_CAUTION_THRESHOLD) {
            return SAFE;
        }
        if (asphaltTemp < WalkWeatherConstants.RISK_DANGER_THRESHOLD) {
            return CAUTION;
        }
        if (asphaltTemp < WalkWeatherConstants.RISK_SEVERE_THRESHOLD) {
            return DANGER;
        }
        return SEVERE;
    }
}
