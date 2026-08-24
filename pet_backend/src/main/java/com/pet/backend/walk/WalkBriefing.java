package com.pet.backend.walk;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 산책 브리핑 판정 결과 1회차. ddl-auto=none — 스키마는 walk_record와 동일한 동선대로
 * docs/sql/walk_briefing.sql을 Supabase SQL Editor에서 1회 실행해 테이블을 만든 뒤
 * 그 파일은 삭제될 예정이다(루트 CLAUDE.md AI 강아지 관리 비서 Phase v2 확정사항).
 *
 * <p>판정 주체는 이 자바 서비스({@link WalkBriefingService})이고, 발송은 이 테이블을
 * 읽는 클로드 발송 브리지가 담당한다(자바는 발송 코드를 갖지 않는다). 브리지가 컬럼명·
 * {@link WalkBriefingEvent#code()} 문자열을 그대로 읽으므로 이름을 바꾸지 않는다.
 *
 * <p>{@code event == SKIP_NO_RECORD}일 때는 날씨·좌표·gapDays 컬럼이 전부 null이다
 * (마지막 산책 기록 자체가 없어 산출할 데이터가 없음 — 기본 좌표로 대체하지 않는다는
 * 기획 확정사항).
 */
@Entity
@Table(name = "walk_briefing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WalkBriefing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "checked_at", nullable = false)
    private Instant checkedAt;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "air_temp")
    private Double airTemp;

    @Column(name = "wind_speed")
    private Double windSpeed;

    @Column(name = "humidity")
    private Double humidity;

    @Column(name = "solar")
    private Double solar;

    @Column(name = "asphalt_temp")
    private Double asphaltTemp;

    @Enumerated(EnumType.STRING)
    @Column(name = "risk_level")
    private RiskLevel riskLevel;

    @Column(name = "precipitation")
    private Boolean precipitation;

    @Column(name = "gap_days")
    private Integer gapDays;

    @Column(name = "pet_id")
    private Long petId;

    @Convert(converter = WalkBriefingEventConverter.class)
    @Column(name = "event", nullable = false)
    private WalkBriefingEvent event;

    @Column(name = "notify", nullable = false)
    private boolean notify;

    @Column(name = "reason", nullable = false)
    private String reason;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private WalkBriefing(Instant checkedAt, Double lat, Double lng, Double airTemp, Double windSpeed,
                          Double humidity, Double solar, Double asphaltTemp, RiskLevel riskLevel,
                          Boolean precipitation, Integer gapDays, Long petId, WalkBriefingEvent event,
                          boolean notify, String reason) {
        this.checkedAt = checkedAt;
        this.lat = lat;
        this.lng = lng;
        this.airTemp = airTemp;
        this.windSpeed = windSpeed;
        this.humidity = humidity;
        this.solar = solar;
        this.asphaltTemp = asphaltTemp;
        this.riskLevel = riskLevel;
        this.precipitation = precipitation;
        this.gapDays = gapDays;
        this.petId = petId;
        this.event = event;
        this.notify = notify;
        this.reason = reason;
    }

    /** 마지막 산책 기록이 없어 판정 자체를 건너뛴 경우 — 날씨 관련 컬럼은 전부 null. */
    static WalkBriefing skipNoRecord(Instant checkedAt, String reason) {
        return new WalkBriefing(checkedAt, null, null, null, null, null, null, null, null, null, null,
                null, WalkBriefingEvent.SKIP_NO_RECORD, false, reason);
    }

    /** 날씨 조회·게이트 판정까지 마친 정상 결과. */
    static WalkBriefing judged(Instant checkedAt, double lat, double lng, double airTemp, double windSpeed,
                                double humidity, double solar, double asphaltTemp, RiskLevel riskLevel,
                                boolean precipitation, int gapDays, Long petId, WalkBriefingEvent event,
                                boolean notify, String reason) {
        return new WalkBriefing(checkedAt, lat, lng, airTemp, windSpeed, humidity, solar, asphaltTemp,
                riskLevel, precipitation, gapDays, petId, event, notify, reason);
    }
}
