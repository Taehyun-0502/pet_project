package com.pet.backend.walk;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 기상청 초단기실황/초단기예보 조회에 쓸 base_date/base_time 계산.
 *
 * <p><b>주의(2026-08-14 QA H-1 수정)</b>: "발표 분"과 base_time에 실제로 들어가는 "분"은
 * 다르다. 발표 분(실황 40분·예보 45분)은 그 시각 자료가 언제 공개되는지를 뜻할 뿐이고,
 * 기상청 API 규격상 base_time에는 <b>실황은 정시(HH00), 예보는 30분(HH30)</b>이 들어간다
 * (관측/예보 자료 자체의 기준 시각). 예) 14:45 호출 → 실황 base_time=1400(14:00 정시 자료,
 * 14:40에 발표됨). 이전 값(발표 분을 그대로 base_time에 채움 — 실황 1440·예보 1445)은
 * 기상청이 존재하지 않는 base_time으로 인식해 NO_DATA를 반환하는 버그였다.
 *
 * <p>롤백 판정(호출 시각의 분이 발표 분보다 이르면 아직 그 시각 자료가 안 나온 것이므로
 * 이전 시간대를 쓴다)은 기존대로 발표 분(40/45) 기준을 유지한다.
 * {@link ZonedDateTime#minusHours(long)}가 자정 경계(날짜 롤오버)까지 자동으로 처리한다.
 */
record KmaBaseTime(String baseDate, String baseTime) {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

    // 롤백 판정 기준 — 이 분보다 이르면 아직 해당 시각 자료가 발표 전이므로 이전 시간대를 쓴다.
    private static final int NCST_PUBLISH_MINUTE = 40; // 초단기실황(getUltraSrtNcst) 발표 분
    private static final int FCST_PUBLISH_MINUTE = 45; // 초단기예보(getUltraSrtFcst) 발표 분

    // base_time에 실제로 들어가는 "분" — 발표 분과 별개(기상청 API 규격, 위 클래스 주석 참고).
    private static final String NCST_BASE_MINUTE = "00";
    private static final String FCST_BASE_MINUTE = "30";

    static KmaBaseTime forUltraSrtNcst(ZonedDateTime now) {
        return of(now, NCST_PUBLISH_MINUTE, NCST_BASE_MINUTE);
    }

    static KmaBaseTime forUltraSrtFcst(ZonedDateTime now) {
        return of(now, FCST_PUBLISH_MINUTE, FCST_BASE_MINUTE);
    }

    private static KmaBaseTime of(ZonedDateTime now, int publishMinute, String baseMinute) {
        ZonedDateTime base = now.getMinute() < publishMinute ? now.minusHours(1) : now;
        String date = base.format(DATE_FORMAT);
        String time = String.format("%02d", base.getHour()) + baseMinute;
        return new KmaBaseTime(date, time);
    }
}
