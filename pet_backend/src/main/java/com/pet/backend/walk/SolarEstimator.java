package com.pet.backend.walk;

import java.time.ZonedDateTime;

/**
 * 태양고도 기반 청천 일사량 추정. 기상청 초단기예보에는 격자 단위 실시간 일사량이 없어,
 * 천문 계산으로 근사한 뒤 하늘상태(SKY)·강수(PTY)로 감쇠시킨다.
 */
final class SolarEstimator {

    // KST(UTC+9)의 표준 자오선 경도. 진태양시 보정에 쓰는 지리적 상수로,
    // WalkWeatherConstants의 재보정 대상 계수와 달리 시간대 정의 자체라 고정값이다.
    private static final double KST_STANDARD_MERIDIAN = 135.0;

    private SolarEstimator() {
    }

    /**
     * @param lat  위도(도)
     * @param lng  경도(도)
     * @param time 계산 기준 시각(KST)
     * @param sky  하늘상태 코드(1 맑음 / 3 구름많음 / 4 흐림)
     * @param pty  강수형태 코드(0=없음, 그 외=강수 중)
     * @return 하늘상태 감쇠까지 반영한 일사량(W/m²)
     */
    static double estimate(double lat, double lng, ZonedDateTime time, int sky, int pty) {
        double clearSky = clearSkySolar(lat, lng, time);
        return clearSky * skyFactor(sky, pty);
    }

    /**
     * 청천 일사량 S_clear = max(0, 1000·sin(태양고도)).
     * 태양고도 sin값은 적위(δ)·진태양시로부터 구한 시간각(H)으로 계산한다:
     * δ = 23.44°·sin(360/365·(284+연중일)), 진태양시 = KST + (경도−135)/15,
     * H = 15°·(진태양시−12), sin(고도) = sinφ·sinδ + cosφ·cosδ·cosH.
     */
    static double clearSkySolar(double lat, double lng, ZonedDateTime time) {
        int dayOfYear = time.getDayOfYear();
        double declinationDeg = 23.44 * Math.sin(Math.toRadians(360.0 / 365.0 * (284 + dayOfYear)));
        double declinationRad = Math.toRadians(declinationDeg);

        double localDecimalHour = time.getHour() + time.getMinute() / 60.0 + time.getSecond() / 3600.0;
        double trueSolarTime = localDecimalHour + (lng - KST_STANDARD_MERIDIAN) / 15.0;

        double hourAngleRad = Math.toRadians(15.0 * (trueSolarTime - 12.0));
        double latRad = Math.toRadians(lat);

        double sinAltitude = Math.sin(latRad) * Math.sin(declinationRad)
                + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);

        return Math.max(0.0, WalkWeatherConstants.SOLAR_CONSTANT * sinAltitude);
    }

    // 강수 중이면 하늘상태와 무관하게 가장 어둡게 처리한다.
    // 알 수 없는 SKY 코드(기상청은 1/3/4만 씀)는 보수적으로 맑음(최댓값)으로 취급 —
    // 일사량을 과소평가하면 위험 단계를 실제보다 낮게 보여줄 수 있어, 안전 쪽으로 치우친다.
    static double skyFactor(int sky, int pty) {
        if (pty != 0) {
            return WalkWeatherConstants.SKY_FACTOR_PRECIPITATION;
        }
        return switch (sky) {
            case 3 -> WalkWeatherConstants.SKY_FACTOR_PARTLY_CLOUDY;
            case 4 -> WalkWeatherConstants.SKY_FACTOR_CLOUDY;
            default -> WalkWeatherConstants.SKY_FACTOR_CLEAR;
        };
    }
}
