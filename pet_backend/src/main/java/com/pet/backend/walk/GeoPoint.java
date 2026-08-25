package com.pet.backend.walk;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * 산책 경로의 좌표 한 점. POST /api/walk/records 요청 바디의 path 배열 원소이자,
 * {@link WalkRecord}에 jsonb로 그대로 저장·응답되는 표현이기도 하다 — 별도 변환 없이 재사용한다.
 *
 * <p>범위는 {@link WalkWeatherController}와 동일한 한반도 범위(lat 33~43, lng 124~132)로
 * 제한한다(QA M-3) — 산책은 국내 GPS 좌표만 의미가 있고 날씨 조회도 같은 범위로 제한되어
 * 있으므로, 장소 검색(전 세계 대상)에 쓰는 place 패키지의 전역 범위(-90~90/-180~180)를
 * 따를 이유가 없다.
 */
public record GeoPoint(
        @NotNull(message = "path 원소의 lat는 필수입니다.")
        @DecimalMin(value = "33.0", message = "path 원소의 lat는 한반도 범위(33~43)를 벗어났습니다.")
        @DecimalMax(value = "43.0", message = "path 원소의 lat는 한반도 범위(33~43)를 벗어났습니다.")
        Double lat,

        @NotNull(message = "path 원소의 lng는 필수입니다.")
        @DecimalMin(value = "124.0", message = "path 원소의 lng는 한반도 범위(124~132)를 벗어났습니다.")
        @DecimalMax(value = "132.0", message = "path 원소의 lng는 한반도 범위(124~132)를 벗어났습니다.")
        Double lng
) {
}
