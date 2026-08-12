package com.pet.backend.walk;

/**
 * 아스팔트 온도 추정에 쓰이는 물리 계수·임계값 모음.
 *
 * <p>간이 열수지 모델이라 장파복사·지중 열전도 등을 생략해 과대평가하는 경향이 있고,
 * 이를 {@link #ASPHALT_DAMPING_K}로 보정한다. 여기 모인 값은 전부 <b>추후 한국 도로
 * 실측 회귀값으로 교체 가능하도록</b> 상수 클래스 하나로 분리해 두었다 — 계산 로직
 * ({@link AsphaltTempCalculator}, {@link SolarEstimator}, {@link RiskLevel})은
 * 값이 바뀌어도 손댈 필요가 없다.
 */
final class WalkWeatherConstants {

    private WalkWeatherConstants() {
    }

    // ── 아스팔트 열수지 계수 (T_asphalt = T_air + K·(1-α)·S / (5.7 + 3.8·v)) ──
    static final double ASPHALT_ALBEDO = 0.10;      // α: 아스팔트 알베도(반사율)
    static final double ASPHALT_DAMPING_K = 0.45;   // K: 단순식 과대평가 보정 감쇠계수
    static final double CONVECTIVE_COEFF_BASE = 5.7; // 대류 열전달계수 h_c의 상수항
    static final double CONVECTIVE_COEFF_WIND = 3.8; // 대류 열전달계수 h_c의 풍속 계수

    // ── 청천 일사량(S_clear = max(0, 1000·sin(태양고도))) 상수 ──
    static final double SOLAR_CONSTANT = 1000.0;

    // ── 하늘상태(SKY)·강수(PTY) 대비 청천 일사량 계수 ──
    static final double SKY_FACTOR_CLEAR = 1.0;          // SKY=1 맑음
    static final double SKY_FACTOR_PARTLY_CLOUDY = 0.65; // SKY=3 구름많음
    static final double SKY_FACTOR_CLOUDY = 0.35;        // SKY=4 흐림
    static final double SKY_FACTOR_PRECIPITATION = 0.2;  // PTY != 0 (강수 중)

    // ── 위험 단계 임계값 (아스팔트 온도 ℃) ──
    static final double RISK_CAUTION_THRESHOLD = 25.0; // 미만 SAFE
    static final double RISK_DANGER_THRESHOLD = 35.0;  // 미만 CAUTION
    static final double RISK_SEVERE_THRESHOLD = 50.0;  // 미만 DANGER, 이상 SEVERE
}
