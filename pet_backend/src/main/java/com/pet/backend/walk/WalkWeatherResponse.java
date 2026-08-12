package com.pet.backend.walk;

/**
 * GET /api/walk/weather 응답. solar·asphaltTemp는 소수점 1자리로 반올림해 내려간다.
 */
public record WalkWeatherResponse(
        double airTemp,
        double humidity,
        double windSpeed,
        double solar,
        double asphaltTemp,
        RiskLevel riskLevel,
        String baseTime
) {
}
