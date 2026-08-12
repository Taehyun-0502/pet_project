package com.pet.backend.walk;

/**
 * KmaClient가 돌려주는 격자 셀 하나의 원시 관측/예보값 — 일사량·아스팔트 온도 계산 전 단계.
 * baseTime은 "yyyyMMddHHmm"(초단기실황 base_date+base_time) 12자리로, 최종 API 응답의
 * baseTime 필드에 그대로 쓰인다.
 */
record KmaWeatherSnapshot(
        double airTemp,
        double humidity,
        double windSpeed,
        int pty,
        int sky,
        String baseTime
) {
}
