package com.pet.backend.prediction;

/**
 * 질병예측(멤버 3, 파이썬/FastAPI) 조회 인터페이스.
 * 스키마 미확정 구간을 감안해 목(mock) ↔ 실제 FastAPI 연동 구현체를 자유롭게 교체할 수 있도록
 * 인터페이스만 챗봇 로직(ChatService)에 노출한다.
 *
 * 실구현 전환 시: prediction.mode=fastapi 등으로 새 구현체를 @ConditionalOnProperty로 등록하고
 * MockDiseasePredictionClient는 그대로 두어 로컬/테스트에서 계속 쓸 수 있게 한다.
 */
public interface DiseasePredictionClient {

    DiseasePrediction predict(Long petId);
}
