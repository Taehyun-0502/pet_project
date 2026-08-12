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
 * 산책 한 회차 기록. ddl-auto=none — 스키마는 docs/sql/walk_record.sql을 Supabase에서
 * 직접 실행해 관리한다("DB 테이블 없음" 방침의 예외 — 루트 CLAUDE.md 산책 Phase 확정사항).
 *
 * <p>petId는 JWT 인증 연동 전이라 nullable이다. 로그인 연동 시 토큰에서 꺼낸 값으로
 * 필수화하고 소유권 검증을 추가해야 한다(그 전까지는 누구나 임의 petId로 기록을 남길 수 있음 —
 * 데모 단계의 알려진 제약).
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
