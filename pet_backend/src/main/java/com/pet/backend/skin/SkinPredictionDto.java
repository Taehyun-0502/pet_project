package com.pet.backend.skin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SkinPredictionDto {

    // 클래스 인덱스 번호
    @JsonProperty("class_index")
    @JsonAlias({"class_index", "classIndex"})
    private Integer classIndex;

    // 피부 질환 클래스명 (12종 중 1개)
    @JsonProperty("class_name")
    @JsonAlias({"class_name", "className"})
    private String className;

    // 신뢰도 확률 퍼센트
    private Double confidence;
}
