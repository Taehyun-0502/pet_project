package com.pet.backend.walk;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 기상청 초단기실황/초단기예보 조회에 쓸 base_date/base_time 계산.
 * 두 API 모두 "발표 분"이 있고(실황 40분, 예보 45분), 호출 시각의 분이 발표 분보다 이르면
 * 아직 그 시각 데이터가 나오지 않은 것이므로 이전 정시(전 시간대 발표분)를 사용한다.
 * {@link ZonedDateTime#minusHours(long)}가 자정 경계(날짜 롤오버)까지 자동으로 처리한다.
 */
record KmaBaseTime(String baseDate, String baseTime) {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int NCST_PUBLISH_MINUTE = 40; // 초단기실황(getUltraSrtNcst)
    private static final int FCST_PUBLISH_MINUTE = 45; // 초단기예보(getUltraSrtFcst)

    static KmaBaseTime forUltraSrtNcst(ZonedDateTime now) {
        return of(now, NCST_PUBLISH_MINUTE);
    }

    static KmaBaseTime forUltraSrtFcst(ZonedDateTime now) {
        return of(now, FCST_PUBLISH_MINUTE);
    }

    private static KmaBaseTime of(ZonedDateTime now, int publishMinute) {
        ZonedDateTime base = now.getMinute() < publishMinute ? now.minusHours(1) : now;
        String date = base.format(DATE_FORMAT);
        String time = String.format("%02d%02d", base.getHour(), publishMinute);
        return new KmaBaseTime(date, time);
    }
}
