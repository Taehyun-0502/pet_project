package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

/**
 * 기상청 API 규격 기준 base_time 검증(QA H-1) — 실황은 정시(HH00), 예보는 30분(HH30)이
 * base_time에 들어간다. 발표 분(실황 40분·예보 45분)은 롤백 판정에만 쓰인다.
 */
class KmaBaseTimeTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Test
    void 실황_40분_이상이면_당해_시각_정시를_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 45, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1400");
    }

    @Test
    void 실황_40분_미만이면_이전_시각_정시를_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 35, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1300");
    }

    @Test
    void 자정_직후_40분_미만이면_전날_23시_정시로_날짜가_롤오버된다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 0, 10, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260811");
        assertThat(base.baseTime()).isEqualTo("2300");
    }

    @Test
    void 예보_45분_미만이면_이전_시각_30분을_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 40, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtFcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1330");
    }

    @Test
    void 예보_45분_이상이면_당해_시각_30분을_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 50, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtFcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1430");
    }

    @Test
    void 자정_직후_45분_미만이면_전날_23시_30분으로_날짜가_롤오버된다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 0, 10, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtFcst(now);

        assertThat(base.baseDate()).isEqualTo("20260811");
        assertThat(base.baseTime()).isEqualTo("2330");
    }
}
