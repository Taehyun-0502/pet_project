package com.pet.backend.walk;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 산책 한 회차 기록. ddl-auto=none — 스키마는 확정된 동선대로 docs/sql/walk_record.sql을
 * Supabase SQL Editor에서 1회 실행해 테이블을 만든 뒤 그 파일은 삭제됐다(2026-08-12,
 * QA L-3·D-4 정정 — 더 이상 실행할 파일이 없다). 이제 스키마는 Supabase에서 직접
 * 관리한다("DB 테이블 없음" 방침의 예외 — 루트 CLAUDE.md 산책 Phase 확정사항).
 *
 * <p>petId 컬럼 자체는 nullable(과거 인증 연동 전에 petId 없이 저장된 레거시 행이 있을 수 있음)
 * 이지만, 신규 저장은 {@link WalkRecordCreateRequest}가 petId를 필수로 검증하고
 * {@link WalkRecordService#create}가 인증된 memberId의 소유인지 확인한다(QA H-1, IDOR 수정).
 * 조회({@link WalkRecordService#list})도 인증된 memberId 소유 petId로만 필터링되므로,
 * petId가 null인 레거시 행은 조회 결과에서 자연히 제외된다.
 */
@Entity
@Table(name = "walk_record")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WalkRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pet_id")
    private Long petId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at", nullable = false)
    private Instant endedAt;

    @Column(name = "duration_seconds", nullable = false)
    private Integer durationSeconds;

    @Column(name = "distance_meters", nullable = false)
    private Double distanceMeters;

    // 경로 좌표 배열을 그대로 jsonb로 저장 — PetMap 폴리라인 렌더링이 가공 없이 바로 쓴다.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "path", nullable = false, columnDefinition = "jsonb")
    private List<GeoPoint> path;

    @Column(name = "air_temp")
    private Double airTemp;

    @Column(name = "asphalt_temp")
    private Double asphaltTemp;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private WalkRecord(Long petId, Instant startedAt, Instant endedAt, Integer durationSeconds,
                        Double distanceMeters, List<GeoPoint> path, Double airTemp, Double asphaltTemp) {
        this.petId = petId;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.durationSeconds = durationSeconds;
        this.distanceMeters = distanceMeters;
        this.path = path;
        this.airTemp = airTemp;
        this.asphaltTemp = asphaltTemp;
    }

    public static WalkRecord create(Long petId, Instant startedAt, Instant endedAt, Integer durationSeconds,
                                     Double distanceMeters, List<GeoPoint> path, Double airTemp,
                                     Double asphaltTemp) {
        return new WalkRecord(petId, startedAt, endedAt, durationSeconds, distanceMeters, path, airTemp,
                asphaltTemp);
    }
}
