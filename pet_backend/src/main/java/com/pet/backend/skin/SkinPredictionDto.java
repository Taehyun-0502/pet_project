package com.pet.backend.skin;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class SkinPredictionDto {

    // 클래스 인덱스 번호
    private Integer classIndex;

    // 피부 질환 클래스명 (12종 중 1개)
    private String className;

    // 신뢰도 확률 퍼센트
    private Double confidence;
}
