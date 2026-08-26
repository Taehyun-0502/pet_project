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

    // runBriefing()을 호출하는 테스트 전용 — QA M-2 가드(키 미설정이면 즉시 return)를 통과시켜
    // 기존 판정 로직(게이트 경계·우선순위)을 그대로 검증할 수 있게 한다. getTodaysBriefing()만
    // 호출하는 테스트는 이 가드를 타지 않으므로 setUp()만 쓴다(안 그러면 미사용 스텁으로 실패).
    private void setUpWithConfiguredKey() {
        setUp();
        when(kmaClient.isServiceKeyConfigured()).thenReturn(true);
    }

    private WalkRecord walkRecordWithGap(int gapDays, Long petId) {
        Instant startedAt = Instant.now().minus(Duration.ofDays(gapDays)).minusSeconds(30);
        return WalkRecord.create(petId, startedAt, startedAt.plusSeconds(1800), 1800, 1000.0,
                List.of(new GeoPoint(SEOUL_LAT, SEOUL_LNG)), 30.0, 40.0);
    }

    @Test
    void 마지막_산책_기록이_없으면_skip_no_record로_저장하고_알리지_않는다() {
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
        when(walkRecordRepository.findFirstByOrderByStartedAtDesc())
                .thenReturn(Optional.of(walkRecordWithGap(3, 1L)));
        when(kmaClient.fetch(anyInt(), anyInt())).thenThrow(new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED));

        walkBriefingService.runBriefing();

        verify(walkBriefingRepository, never()).save(any());
    }

    @Test
    void 아스팔트_온도가_정확히_35도면_hot으로_판정하고_알린다() {
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
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
        setUpWithConfiguredKey();
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

    // 오늘 산책 브리핑 조회(getTodaysBriefing()) — MCP 도구 ④(mcp 패키지)가 사용하는 경로.
    // 새 판정 로직은 없고 저장된 값을 WalkBriefingSummary로 옮겨 담기만 하므로, 매핑이
    // 정확한지와 "오늘 행 없음"일 때 빈 Optional을 돌려주는지만 검증한다.
    @Test
    void 오늘_판정이_있으면_요약으로_변환해_반환한다() {
        setUp();
        Instant checkedAt = Instant.now();
        WalkBriefing briefing = WalkBriefing.judged(checkedAt, SEOUL_LAT, SEOUL_LNG, 32.0, 1.5, 60.0, 500.0,
                40.3, RiskLevel.DANGER, false, 3, 7L, WalkBriefingEvent.HOT, true, "테스트 사유");
        when(walkBriefingRepository.findFirstByCheckedAtBetweenOrderByCheckedAtDesc(any(), any()))
                .thenReturn(Optional.of(briefing));

        Optional<WalkBriefingSummary> summary = walkBriefingService.getTodaysBriefing();

        assertThat(summary).isPresent();
        WalkBriefingSummary value = summary.get();
        assertThat(value.eventCode()).isEqualTo("hot");
        assertThat(value.shouldNotify()).isTrue();
        assertThat(value.reason()).isEqualTo("테스트 사유");
        assertThat(value.riskLevel()).isEqualTo(RiskLevel.DANGER);
        assertThat(value.asphaltTemp()).isEqualTo(40.3);
        assertThat(value.gapDays()).isEqualTo(3);
        assertThat(value.petId()).isEqualTo(7L);
        assertThat(value.checkedAt()).isEqualTo(checkedAt);
    }

    @Test
    void 오늘_판정이_없으면_빈_값을_반환한다() {
        setUp();
        when(walkBriefingRepository.findFirstByCheckedAtBetweenOrderByCheckedAtDesc(any(), any()))
                .thenReturn(Optional.empty());

        assertThat(walkBriefingService.getTodaysBriefing()).isEmpty();
    }

    // QA M-2 — 키 미설정(mcp/mcp-http 로컬 검증 등)이라 mock 날씨로 폴백한 상태에서는
    // 판정 자체를 시도하지 않고 저장도 하지 않는다. 실배포(EC2)의 최신 판정 행을 mock 값이
    // 덮어쓰는 사고를 막기 위한 방어선(스케줄러 @Profile 게이트와 이중 방어).
    @Test
    void 키가_미설정이면_판정을_시도하지_않고_저장하지_않는다() {
        walkBriefingService = new WalkBriefingService(walkRecordRepository, walkBriefingRepository, kmaClient);
        when(kmaClient.isServiceKeyConfigured()).thenReturn(false);

        walkBriefingService.runBriefing();

        verify(walkRecordRepository, never()).findFirstByOrderByStartedAtDesc();
        verify(walkRecordRepository, never()).findFirstByPetIdOrderByStartedAtDesc(any());
        verify(walkBriefingRepository, never()).save(any());
    }

    // QA M-1 — walk.briefing.pet-id가 지정되면 전체 사용자 최신 기록이 아니라 그 반려동물의
    // 최신 기록을 기준으로 판정해야 한다("개인 비서" 전제 — 팀원이 남긴 기록에 영향받지 않음).
    @Test
    void 판정_기준_petId가_지정되면_그_반려동물의_최신_기록을_사용한다() {
        WalkBriefingService service = new WalkBriefingService(
                walkRecordRepository, walkBriefingRepository, kmaClient, "7");
        when(kmaClient.isServiceKeyConfigured()).thenReturn(true);
        when(walkRecordRepository.findFirstByPetIdOrderByStartedAtDesc(7L))
                .thenReturn(Optional.of(walkRecordWithGap(0, 7L)));
        when(kmaClient.fetch(anyInt(), anyInt()))
                .thenReturn(new KmaWeatherSnapshot(20.0, 60.0, 1.5, 0, 1, "202608241200"));

        try (MockedStatic<SolarEstimator> solar = mockStatic(SolarEstimator.class)) {
            solar.when(() -> SolarEstimator.estimate(anyDouble(), anyDouble(), any(), anyInt(), anyInt()))
                    .thenReturn(0.0);

            service.runBriefing();
        }

        verify(walkRecordRepository, never()).findFirstByOrderByStartedAtDesc();
        ArgumentCaptor<WalkBriefing> captor = ArgumentCaptor.forClass(WalkBriefing.class);
        verify(walkBriefingRepository).save(captor.capture());
        assertThat(captor.getValue().getPetId()).isEqualTo(7L);
    }
}
