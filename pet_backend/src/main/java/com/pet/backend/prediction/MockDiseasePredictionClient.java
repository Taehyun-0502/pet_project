package com.pet.backend.prediction;

import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 질병예측 목(mock) 구현체 — 멤버 3의 파이썬 모델 스키마가 확정되기 전까지 시연용으로 사용한다.
 * prediction.mode=mock(기본값)일 때 활성화되며, 실제 FastAPI 연동체가 준비되면
 * prediction.mode를 바꾸고 새 @Component 구현체를 추가해 교체한다.
 */
@Component
@ConditionalOnProperty(prefix = "prediction", name = "mode", havingValue = "mock", matchIfMissing = true)
public class MockDiseasePredictionClient implements DiseasePredictionClient {

    // 시연 가능한 현실적인 목 응답 (petId % 3 으로 순환 선택)
    private static final List<DiseasePrediction> SAMPLE_CASES = List.of(
            new DiseasePrediction(
                    "슬개골 탈구 의심",
                    "MEDIUM",
                    "최근 7일간 평균 활동량이 직전 2주 대비 약 35% 감소했고, 보행 중 다리를 절뚝이는 패턴이 3회 감지되었습니다."
            ),
            new DiseasePrediction(
                    "급성 위장염 의심",
                    "HIGH",
                    "최근 24시간 동안 사료 섭취량이 급격히 줄었고, 구토로 추정되는 행동 패턴이 2회 감지되었습니다."
            ),
            new DiseasePrediction(
                    "특이 소견 없음",
                    "LOW",
                    "최근 14일간 심박수와 활동량이 모두 정상 범위 내에서 안정적으로 유지되고 있습니다."
            )
    );

    @Override
    public DiseasePrediction predict(Long petId) {
        int index = (int) Math.floorMod(petId, (long) SAMPLE_CASES.size());
        return SAMPLE_CASES.get(index);
    }
}
