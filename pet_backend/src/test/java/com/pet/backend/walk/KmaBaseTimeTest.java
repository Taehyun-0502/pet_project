package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

class KmaBaseTimeTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Test
    void 실황_40분_이후면_같은_시간대의_40분을_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 45, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1440");
    }

    @Test
    void 실황_40분_이전이면_이전_시간대의_40분을_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 20, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1340");
    }

    @Test
    void 자정_직후_40분_이전이면_전날_23시_40분으로_날짜가_롤오버된다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 0, 10, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtNcst(now);

        assertThat(base.baseDate()).isEqualTo("20260811");
        assertThat(base.baseTime()).isEqualTo("2340");
    }

    @Test
    void 예보_45분_이전이면_이전_시간대의_45분을_base_time으로_쓴다() {
        ZonedDateTime now = ZonedDateTime.of(2026, 8, 12, 14, 30, 0, 0, KST);

        KmaBaseTime base = KmaBaseTime.forUltraSrtFcst(now);

        assertThat(base.baseDate()).isEqualTo("20260812");
        assertThat(base.baseTime()).isEqualTo("1345");
    }
}
