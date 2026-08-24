package com.pet.backend.walk;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/**
 * 산책 기록 저장 요청. petId는 JWT 연동 전이라 선택(null 허용) — 인증 붙으면 토큰에서 꺼내는
 * 방식으로 교체 예정(WalkRecord 클래스 주석 참고).
 */
public record WalkRecordCreateRequest(

        Long petId,

        @NotNull(message = "startedAt은 필수입니다.")
        Instant startedAt,

        @NotNull(message = "endedAt은 필수입니다.")
        Instant endedAt,

        @NotNull(message = "durationSeconds는 필수입니다.")
        @PositiveOrZero(message = "durationSeconds는 0 이상이어야 합니다.")
        Integer durationSeconds,

        @NotNull(message = "distanceMeters는 필수입니다.")
        @PositiveOrZero(message = "distanceMeters는 0 이상이어야 합니다.")
        Double distanceMeters,

        @NotEmpty(message = "path는 비어있지 않아야 합니다.")
        // 5m 간격 좌표 기준 100km 상당(QA M-3) — 임의 크기 jsonb 저장을 막는 상한.
        @Size(max = 20000, message = "path가 너무 깁니다. (최대 20000개, 5m 간격 기준 약 100km)")
        @Valid
        List<GeoPoint> path,

        Double airTemp,
        Double asphaltTemp
) {

    // startedAt < endedAt 교차 검증 — Hibernate Validator는 isXxx() 형태의 메서드를
    // "xxx" 프로퍼티로 인식해 @AssertTrue를 평가한다(레코드도 동일하게 동작).
    // 둘 중 하나라도 null이면 각자의 @NotNull이 이미 걸리므로 여기서는 true로 통과시켜
    // 에러 메시지가 중복(둘 다 VALIDATION_ERROR로 합쳐지긴 하지만) 나지 않게 한다.
    @AssertTrue(message = "startedAt은 endedAt보다 이전이어야 합니다.")
    public boolean isStartBeforeEnd() {
        return startedAt == null || endedAt == null || startedAt.isBefore(endedAt);
    }
}
