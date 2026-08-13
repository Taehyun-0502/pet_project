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
import java.util.UUID;
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
 *
 * <p><b>이 "한 번만"에는 유예라는 예외가 있다</b> — 회전 직후 30초 안의 재제출은 정상 사용으로 보고
 * 통과시킨다(백로그 32번: 재발급 응답이 닿기 전 새로고침·탭 경합). 그래서 한 토큰이 여러 번 쓰일 수 있고,
 * 대신 그 창이 **고정 30초를 넘지 않는 것**이 불변식이다 — {@link #revoke}가 폐기 시각을 덮지 않는 이유.
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

    // 세션(=기기) 식별자 — 로그인 시 발급되고 회전 체인 전체가 이어받는다.
    // "기기 로그아웃"의 폐기 단위이고, 활성 행의 세션 목록이 곧 로그인 중인 기기 목록이다 (api-spec.md 1절 5차)
    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    // 로그인 시점 User-Agent 간단 파싱 결과 (예: "Chrome · Windows"). NULL = 매칭 실패 → 프론트가 "알 수 없는 기기" 표시
    @Column(name = "device_info", length = 100)
    private String deviceInfo;

    // 세션 시작(최초 로그인) 시각 — 회전 시 새 행에 복사된다. createdAt은 이 행의 발급(회전) 시각이라 구분된다
    @Column(name = "session_started_at", nullable = false)
    private Instant sessionStartedAt;

    // NULL = 활성. 회전·로그아웃·재사용 감지 시 기록
    @Column(name = "revoked_at")
    private Instant revokedAt;

    // 폐기 사유 — revokedAt과 반드시 함께 기록 (DB CHECK ck_refresh_tokens_revoked).
    // 재사용 판정이 이 값에 따라 갈린다 (RevokedReason 주석 참조)
    @Enumerated(EnumType.STRING)
    @Column(name = "revoked_reason", length = 20)
    private RevokedReason revokedReason;

    private RefreshToken(Long memberId, String tokenHash, Instant expiresAt,
                         UUID sessionId, String deviceInfo, Instant sessionStartedAt) {
        this.memberId = memberId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.sessionId = sessionId;
        this.deviceInfo = deviceInfo;
        this.sessionStartedAt = sessionStartedAt;
    }

    // 세션 필드는 호출자(RefreshTokenService)가 결정한다 — 새 세션이면 새 UUID·now, 회전이면 기존 체인 값 복사
    public static RefreshToken issue(Long memberId, String tokenHash, Instant expiresAt,
                                     UUID sessionId, String deviceInfo, Instant sessionStartedAt) {
        return new RefreshToken(memberId, tokenHash, expiresAt, sessionId, deviceInfo, sessionStartedAt);
    }

    /**
     * 폐기한다. **이미 폐기된 토큰이면 아무것도 바꾸지 않는다** (리뷰 백로그 108번).
     *
     * <p>유예 판정({@link #isWithinRotationGrace})이 `revokedAt`을 기준으로 삼기 때문에,
     * 유예 안의 재제출을 회전할 때 이 값을 다시 쓰면 **유예 시작점이 계속 뒤로 밀려**
     * 30초마다 재제출하는 것만으로 폐기된 토큰을 만료일까지 쓸 수 있게 된다.
     * 재사용 감지도 영원히 발동하지 않는다. 그래서 폐기 시각은 **최초 1회만** 기록한다.
     *
     * <p>사유(reason)를 바꿔야 하는 경우는 벌크 UPDATE가 담당한다
     * ({@link RefreshTokenRepository#expireRotationGraceBySession}) — 그쪽은 `revokedAt`을 건드리지 않는다.
     */
    public void revoke(RevokedReason reason) {
        if (revokedAt != null) {
            return;
        }
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
