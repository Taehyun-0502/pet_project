package com.pet.backend.skin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SkinDiagnosisResultDto {

    // 피부병 AI 분석 성공 여부
    private Boolean success;

    // 12종 중 최고 신뢰도 피부 질환 결과
    @JsonProperty("top_prediction")
    @JsonAlias({"top_prediction", "topPrediction"})
    private SkinPredictionDto topPrediction;

    // 12종 전체 피부 질환 분석 결과 목록
    private List<SkinPredictionDto> predictions;
}
