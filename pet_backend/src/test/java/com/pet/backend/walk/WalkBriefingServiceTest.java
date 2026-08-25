package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pet.backend.common.BusinessException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * WalkBriefingService 단위 테스트 — 게이트 경계·우선순위·기록 없음/날씨 실패 경로를 검증한다.
 *
 * <p>SolarEstimator.estimate()는 실행 시각(현재 태양고도)에 좌우돼 그대로 두면 asphaltTemp를
 * 정확한 경계값으로 재현할 수 없다 — {@code mockStatic}으로 solar=0을 고정해, 아스팔트 온도가
 * {@code airTemp}와 정확히 같아지게 만든 뒤(순수 함수인 AsphaltTempCalculator는 실코드 그대로
 * 실행) 경계값을 정밀하게 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class WalkBriefingServiceTest {

    private static final double SEOUL_LAT = 37.5665;
    private static final double SEOUL_LNG = 126.9780;

    @Mock
    private WalkRecordRepository walkRecordRepository;

    @Mock
    private WalkBriefingRepository walkBriefingRepository;

    @Mock
    private KmaClient kmaClient;

    private WalkBriefingService walkBriefingService;

    private void setUp() {
        walkBriefingService = new WalkBriefingService(walkRecordRepository, walkBriefingRepository, kmaClient);
    }

    private WalkRecord walkRecordWithGap(int gapDays, Long petId) {
        Instant startedAt = Instant.now().minus(Duration.ofDays(gapDays)).minusSeconds(30);
        return WalkRecord.create(petId, startedAt, startedAt.plusSeconds(1800), 1800, 1000.0,
                List.of(new GeoPoint(SEOUL_LAT, SEOUL_LNG)), 30.0, 40.0);
    }

    @Test
    void 마지막_산책_기록이_없으면_skip_no_record로_저장하고_알리지_않는다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc()).thenReturn(Optional.empty());

        walkBriefingService.runBriefing();

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.SKIP_NO_RECORD);
        assertThat(saved.isNotify()).isFalse();
        assertThat(saved.getAirTemp()).isNull();
        assertThat(saved.getGapDays()).isNull();
    }

    @Test
    void 날씨_조회_실패시_저장하지_않는다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(3, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt())).thenThrow(new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED));

        walkBriefingService.runBriefing();

        verify(walkBriefingRepository, never()).save(any());
    }

    @Test
    void 아스팔트_온도가_정확히_35도면_hot으로_판정하고_알린다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(0, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(35.0, 60.0, 1.5, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getAsphaltTemp()).isEqualTo(35.0);
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.HOT);
        assertThat(saved.isNotify()).isTrue();
    }

    @Test
    void 아스팔트_온도가_34_9도면_hot이_아니다() {
        setUp();
        // 공백 0일 + 강수 없음이라 gap_good 조건도 만족하지 못해 none이 된다.
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(0, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(34.9, 60.0, 1.5, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getAsphaltTemp()).isEqualTo(34.9);
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.NONE);
        assertThat(saved.isNotify()).isFalse();
    }

    @Test
    void 공백이_2일_이상이고_강수가_없으면_gap_good으로_판정하고_알린다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(2, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(20.0, 60.0, 1.5, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getGapDays()).isEqualTo(2);
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.GAP_GOOD);
        assertThat(saved.isNotify()).isTrue();
    }

    @Test
    void 공백이_1일이면_gap_good이_아니다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(1, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(20.0, 60.0, 1.5, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getGapDays()).isEqualTo(1);
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.NONE);
        assertThat(saved.isNotify()).isFalse();
    }

    @Test
    void 강수가_있으면_공백이_2일_이상이어도_gap_good을_억제한다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(5, 1L)));
        // pty != 0 → 강수 중
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(20.0, 80.0, 1.5, 1, 4, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getPrecipitation()).isTrue();
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.NONE);
        assertThat(saved.isNotify()).isFalse();
    }

    @Test
    void hot_조건과_gap_good_조건이_동시에_충족되면_hot이_우선한다() {
        setUp();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(5, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(40.0, 60.0, 1.0, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            walkBriefingService.runBriefing();
        }

        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        WalkBriefing saved = captor.getValue();
        assertThat(saved.getEvent()).isEqualTo(WalkBriefingEvent.HOT);
        assertThat(saved.isNotify()).isTrue();
    }
}
