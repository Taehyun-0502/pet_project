package com.pet.backend.walk;

import jakarta.validation.constraints.NotNull;

/**
 * 산책 경로의 좌표 한 점. POST /api/walk/records 요청 바디의 path 배열 원소이자,
 * {@link WalkRecord}에 jsonb로 그대로 저장·응답되는 표현이기도 하다 — 별도 변환 없이 재사용한다.
 */
public record GeoPoint(
        @NotNull(message = "path 원소의 lat는 필수입니다.") Double lat,
        @NotNull(message = "path 원소의 lng는 필수입니다.") Double lng
) {
}
