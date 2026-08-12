package com.pet.backend.walk;

/**
 * 간이 열수지 모델로 아스팔트 표면 온도를 추정한다.
 * T_asphalt = T_air + K·(1−α)·S / (5.7 + 3.8·v)
 * 계수는 전부 {@link WalkWeatherConstants}에 있다 — 실측 회귀값으로 바뀌어도 이 계산식은 그대로다.
 */
final class AsphaltTempCalculator {

    private AsphaltTempCalculator() {
    }

    /**
     * @param airTemp   기온(℃)
     * @param windSpeed 풍속(m/s)
     * @param solar     일사량(W/m²)
     */
    static double calculate(double airTemp, double windSpeed, double solar) {
        double convectiveCoeff = WalkWeatherConstants.CONVECTIVE_COEFF_BASE
                + WalkWeatherConstants.CONVECTIVE_COEFF_WIND * windSpeed;
        double solarGain = WalkWeatherConstants.ASPHALT_DAMPING_K
                * (1 - WalkWeatherConstants.ASPHALT_ALBEDO)
                * solar / convectiveCoeff;
        return airTemp + solarGain;
    }
}
