package com.pet.backend.mcp;

import com.pet.backend.prediction.DiseasePrediction;
import com.pet.backend.prediction.DiseasePredictionClient;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 도구 ① — 질병예측 조회. 판정 로직은 전혀 새로 만들지 않고
 * {@link DiseasePredictionClient}(현재 mock)에 그대로 위임한다.
 */
@Component
@RequiredArgsConstructor
public class DiseasePredictionMcpTool {

    private final DiseasePredictionClient diseasePredictionClient;
    private final WebLinks webLinks;

    @Tool(description = "반려동물 ID로 질병예측 결과(예측 소견·심각도·근거)를 조회한다. "
            + "실제 진단이 아니라 참고용 소견이므로 필요하면 병원 상담을 권해야 한다.")
    public String getDiseasePrediction(@ToolParam(description = "반려동물 ID") Long petId) {
        DiseasePrediction prediction = diseasePredictionClient.predict(petId);
        return """
                예측 소견: %s
                심각도: %s
                근거: %s
                자세히 보기: %s
                """.formatted(
                prediction.prediction(),
                severityLabel(prediction.severity()),
                prediction.basis(),
                webLinks.diagnosisUrl());
    }

    // DiseasePrediction.severity()는 아직 스키마 확정 전 mock 값(LOW/MEDIUM/HIGH)이라
    // 개발 용어처럼 보일 수 있어 한국어 라벨로 바꿔 노출한다. 실제 FastAPI 연동 후 값이
    // 달라져도 안전하게 원문을 그대로 보여주도록 알 수 없는 값은 그대로 반환한다.
    private String severityLabel(String severity) {
        return switch (severity) {
            case "LOW" -> "낮음";
            case "MEDIUM" -> "보통";
            case "HIGH" -> "높음";
            default -> severity;
        };
    }
}
