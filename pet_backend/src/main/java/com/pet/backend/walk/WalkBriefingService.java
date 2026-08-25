package com.pet.backend.walk;

import com.pet.backend.common.BusinessException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 산책 브리핑 게이트 판정 — 자바가 판정과 DB 기록까지만 맡는다(발송·문구 생성은 클로드
 * 발송 브리지 담당, 루트 CLAUDE.md AI 강아지 관리 비서 Phase v2 역할 경계).
 *
 * <p>날씨는 기존 {@link KmaClient}·{@link SolarEstimator}·{@link AsphaltTempCalculator}를
 * 그대로 재사용해 조합한다({@link WalkWeatherService}를 쓰지 않는 이유: 그 응답 DTO에는
 * 게이트에 필요한 강수 여부(PTY)가 없고, 기존 공개 계약을 건드리지 않기 위해서다) — 새
 * 공식·새 기상청 호출 코드는 만들지 않는다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WalkBriefingService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 산책 공백 게이트(gap_good) 임계 — 기획 확정값(2일 이상).
    private static final int GAP_GOOD_MIN_DAYS = 2;

    private final WalkRecordRepository walkRecordRepository;
    private final WalkBriefingRepository walkBriefingRepository;
    private final KmaClient kmaClient;

    @Transactional
    public void runBriefing() {
        Instant now = Instant.now();
        Optional<WalkRecord> lastRecord = walkRecordRepository.findFirstByOrderByStartedAtDesc();

        if (lastRecord.isEmpty()) {
            walkBriefingRepository.save(
                    WalkBriefing.skipNoRecord(now, "마지막 산책 기록이 없어 판정을 건너뜁니다."));
            log.info("산책 브리핑: 최근 산책 기록이 없어 skip_no_record로 저장했습니다.");
            return;
        }

        WalkRecord record = lastRecord.get();
        GeoPoint origin = firstPointOf(record);
        if (origin == null) {
            // path가 비어있는 비정상 기록 — 기준 좌표를 만들 수 없으므로 기록 없음과 동일하게 취급한다.
            walkBriefingRepository.save(
                    WalkBriefing.skipNoRecord(now, "마지막 산책 기록에 경로 좌표가 없어 판정을 건너뜁니다."));
            log.warn("산책 브리핑: walk_record id={}에 path가 비어 있어 skip 처리했습니다.", record.getId());
            return;
        }

        int gapDays = (int) Duration.between(record.getStartedAt(), now).toDays();

        WeatherResult weather;
        try {
            weather = fetchWeather(origin.lat(), origin.lng());
        } catch (BusinessException e) {
            // 저장하지 않고 로그만 남긴다 — 브리지는 "오늘 행 없음"을 미가동/실패로 해석한다.
            log.warn("산책 브리핑: 날씨 조회 실패로 이번 회차는 저장하지 않습니다.", e);
            return;
        }

        Judgement judgement = judge(weather, gapDays);

        walkBriefingRepository.save(WalkBriefing.judged(
                now, origin.lat(), origin.lng(),
                weather.airTemp(), weather.windSpeed(), weather.humidity(), weather.solar(),
                weather.asphaltTemp(), weather.riskLevel(), weather.precipitation(), gapDays,
                record.getPetId(), judgement.event(), judgement.shouldNotify(), judgement.reason()));

        log.info("산책 브리핑 저장 완료 — event={}, notify={}, gapDays={}",
                judgement.event().code(), judgement.shouldNotify(), gapDays);
    }

    /**
     * 오늘(KST) 최신 판정 1건 조회 — MCP 도구 ④(mcp 패키지)가 사용한다. 새 판정 로직은
     * 만들지 않고, 이미 저장된 값을 {@link WalkBriefingSummary}로 그대로 옮겨 담는다.
     * 오늘 행이 없으면(스케줄러 미실행 등) 빈 Optional을 반환한다.
     */
    @Transactional(readOnly = true)
    public Optional<WalkBriefingSummary> getTodaysBriefing() {
        Instant now = Instant.now();
        Instant startOfDay = LocalDate.now(KST).atStartOfDay(KST).toInstant();
        return walkBriefingRepository
                .findFirstByCheckedAtBetweenOrderByCheckedAtDesc(startOfDay, now)
                .map(WalkBriefingSummary::from);
    }

    // 게이트 우선순위(기획 확정): hot이 gap_good보다 우선한다 — 둘 다 조건을 만족해도 hot만 기록.
    private Judgement judge(WeatherResult weather, int gapDays) {
        boolean isHot = weather.riskLevel() == RiskLevel.DANGER || weather.riskLevel() == RiskLevel.SEVERE;
        if (isHot) {
            return new Judgement(WalkBriefingEvent.HOT, true,
                    "아스팔트 온도 약 %.1f℃로 위험 단계입니다.".formatted(weather.asphaltTemp()));
        }
        if (!weather.precipitation() && gapDays >= GAP_GOOD_MIN_DAYS) {
            return new Judgement(WalkBriefingEvent.GAP_GOOD, true,
                    "산책 공백 %d일 이상 + 강수 없음으로 산책하기 좋은 조건입니다.".formatted(gapDays));
        }
        return new Judgement(WalkBriefingEvent.NONE, false,
                "알림 조건 미충족 (아스팔트 약 %.1f℃, 공백 %d일, 강수 %s)"
                        .formatted(weather.asphaltTemp(), gapDays, weather.precipitation() ? "있음" : "없음"));
    }

    private GeoPoint firstPointOf(WalkRecord record) {
        List<GeoPoint> path = record.getPath();
        return (path == null || path.isEmpty()) ? null : path.get(0);
    }

    // WalkWeatherService.getWeather()와 같은 조합(격자 변환 → 기상청 조회 → 일사량 → 아스팔트
    // 온도 → 위험 단계)이지만, 게이트에 필요한 강수 여부(PTY)까지 함께 돌려준다.
    private WeatherResult fetchWeather(double lat, double lng) {
        KmaGridConverter.Grid grid = KmaGridConverter.toGrid(lat, lng);
        KmaWeatherSnapshot snapshot = kmaClient.fetch(grid.nx(), grid.ny());

        double solar = SolarEstimator.estimate(lat, lng, ZonedDateTime.now(KST), snapshot.sky(), snapshot.pty());
        double asphaltTemp = AsphaltTempCalculator.calculate(snapshot.airTemp(), snapshot.windSpeed(), solar);
        RiskLevel riskLevel = RiskLevel.from(asphaltTemp);
        boolean precipitation = snapshot.pty() != 0;

        return new WeatherResult(snapshot.airTemp(), snapshot.humidity(), snapshot.windSpeed(), solar,
                asphaltTemp, riskLevel, precipitation);
    }

    private record WeatherResult(double airTemp, double humidity, double windSpeed, double solar,
                                  double asphaltTemp, RiskLevel riskLevel, boolean precipitation) {
    }

    private record Judgement(WalkBriefingEvent event, boolean shouldNotify, String reason) {
    }
}
