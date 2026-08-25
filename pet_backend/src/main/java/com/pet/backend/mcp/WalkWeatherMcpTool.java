package com.pet.backend.mcp;

import com.pet.backend.common.BusinessException;
import com.pet.backend.walk.RiskLevel;
import com.pet.backend.walk.WalkWeatherResponse;
import com.pet.backend.walk.WalkWeatherService;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 도구 ③ — 산책 날씨(아스팔트 온도·위험 단계). 확정 공식·기상청 연동은 전혀 새로
 * 만들지 않고 {@link WalkWeatherService}(GET /api/walk/weather와 동일 계산)에 위임한다.
 */
@Component
@RequiredArgsConstructor
public class WalkWeatherMcpTool {

    private final WalkWeatherService walkWeatherService;
    private final WebLinks webLinks;

    @Tool(description = "좌표 기준 현재 기온·아스팔트 온도와 산책 위험 단계를 조회한다.")
    public String getWalkWeather(
            @ToolParam(description = "위도") double lat,
            @ToolParam(description = "경도") double lng) {

        WalkWeatherResponse weather;
        try {
            weather = walkWeatherService.getWeather(lat, lng);
        } catch (BusinessException e) {
            return e.getMessage();
        }

        String warning = weather.riskLevel() == RiskLevel.DANGER || weather.riskLevel() == RiskLevel.SEVERE
                ? " 발바닥 화상 위험이 있으니 산책 시간을 조정해 주세요."
                : "";

        return """
                기온: %.1f℃ (습도 %.0f%%, 풍속 %.1fm/s)
                아스팔트 온도: 약 %.1f℃
                위험 단계: %s%s
                산책 페이지: %s
                """.formatted(
                weather.airTemp(), weather.humidity(), weather.windSpeed(),
                weather.asphaltTemp(), riskLabel(weather.riskLevel()), warning,
                webLinks.walkUrl());
    }

    // RiskLevel enum 값을 그대로 노출하지 않고 한국어 라벨로만 응답한다 (기획 확정 — enum 노출 금지).
    static String riskLabel(RiskLevel riskLevel) {
        if (riskLevel == null) {
            return "확인 불가";
        }
        return switch (riskLevel) {
            case SAFE -> "안전";
            case CAUTION -> "주의";
            case DANGER -> "위험";
            case SEVERE -> "매우 위험";
        };
    }
}
