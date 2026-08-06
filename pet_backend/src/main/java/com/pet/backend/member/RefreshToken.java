package com.pet.backend.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

    private RefreshToken(Long memberId, String tokenHash, Instant expiresAt) {
        this.memberId = memberId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public static RefreshToken issue(Long memberId, String tokenHash, Instant expiresAt) {
        return new RefreshToken(memberId, tokenHash, expiresAt);
    }

    public void revoke() {
        this.revokedAt = Instant.now();
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired() {
        return expiresAt.isBefore(Instant.now());
    }
}
