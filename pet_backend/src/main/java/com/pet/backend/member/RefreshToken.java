package com.pet.backend.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 리프레시 토큰 (docs/api-spec.md 1절). 스키마 기준은 docs/schema.sql 2절.
 *
 * **원문은 저장하지 않는다** — DB가 통째로 새어도 그것만으로 남의 세션을 이어받을 수 없도록
 * SHA-256 해시만 보관하고, 원문은 HttpOnly 쿠키로만 오간다.
 * 재발급 시 회전(기존 토큰 폐기 + 새로 발급)하므로 한 토큰은 한 번만 쓰인다.
 */
@Entity
@Table(name = "refresh_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "token_id")
    private Long id;

    // 토큰 소유자 — pet_member.id 참조 FK
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    // SHA-256 hex 64자
    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // NULL = 활성. 회전·로그아웃·재사용 감지 시 기록
    @Column(name = "revoked_at")
    private Instant revokedAt;

    // 폐기 사유 — revokedAt과 반드시 함께 기록 (DB CHECK ck_refresh_tokens_revoked).
    // 재사용 판정이 이 값에 따라 갈린다 (RevokedReason 주석 참조)
    @Enumerated(EnumType.STRING)
    @Column(name = "revoked_reason", length = 20)
    private RevokedReason revokedReason;

    private RefreshToken(Long memberId, String tokenHash, Instant expiresAt) {
        this.memberId = memberId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public static RefreshToken issue(Long memberId, String tokenHash, Instant expiresAt) {
        return new RefreshToken(memberId, tokenHash, expiresAt);
    }

    public void revoke(RevokedReason reason) {
        this.revokedAt = Instant.now();
        this.revokedReason = reason;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    /**
     * 회전으로 폐기된 뒤 아직 유예 안에 있는가 — 즉 "정상적인 중복 제출"로 볼 수 있는가.
     * 로그아웃·재사용 감지로 끊긴 토큰은 아무리 최근이어도 false다.
     */
    public boolean isWithinRotationGrace(Duration grace) {
        return revokedReason == RevokedReason.ROTATED
                && revokedAt != null
                && revokedAt.isAfter(Instant.now().minus(grace));
    }

    public boolean isExpired() {
        return expiresAt.isBefore(Instant.now());
    }
}
