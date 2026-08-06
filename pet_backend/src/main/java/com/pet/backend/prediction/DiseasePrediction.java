package com.pet.backend.prediction;

/**
 * 질병예측(멤버 3, 파이썬 모델) 조회 결과.
 * 스키마가 아직 확정되지 않았으므로 필드명이 이 파일 하나에만 모이도록 한다 —
 * 나중에 FastAPI 실제 응답 스키마가 확정되면 이 record와
 * {@link com.pet.backend.prediction.DiseasePredictionClient} 구현체(들)만 손보면 된다.
 *
 * @param prediction 예측된 질환/이상 소견명 (예: "슬개골 탈구 의심")
 * @param severity   심각도 (예: LOW / MEDIUM / HIGH — 잠정)
 * @param basis      예측 근거 요약 (챗봇이 사용자에게 설명할 때 사용)
 */
public record DiseasePrediction(String prediction, String severity, String basis) {}
