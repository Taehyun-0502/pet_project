package com.pet.backend.member;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    // 쿠키로 받은 원문을 해시해 조회 — 폐기된 토큰도 찾아야 재사용을 감지할 수 있으므로 상태로 거르지 않는다
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // 기기 목록 조회 (api-spec.md 1절 5차). ix_refresh_tokens_member_active 부분 인덱스 사용.
    // 만료됐지만 폐기 안 된 행이 섞여 있을 수 있다 — 만료 필터는 서비스에서
    List<RefreshToken> findAllByMemberIdAndRevokedAtIsNull(Long memberId);

    /**
     * 세션(=기기) 단위 일괄 폐기 — 기기 원격 로그아웃. 세션의 활성 토큰을 전부 잡아야
     * 회전 유예 안의 직전 토큰으로 기기가 되살아나지 못한다 (api-spec.md 1절 5차, b안 채택 이유).
     * memberId 조건은 소유자 격리 — 남의 sessionId를 넘겨도 0행이라 404로 이어진다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedAt = :now, t.revokedReason = :reason
            where t.memberId = :memberId and t.sessionId = :sessionId and t.revokedAt is null
            """)
    int revokeAllBySession(@Param("memberId") Long memberId, @Param("sessionId") UUID sessionId,
                           @Param("now") Instant now, @Param("reason") RevokedReason reason);

    /**
     * 회원의 활성 토큰 일괄 폐기 (재사용 감지 시). 건별로 읽어 고치지 않고 UPDATE 한 번으로 끝낸다 —
     * `ix_refresh_tokens_member_active` 부분 인덱스를 그대로 쓴다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedAt = :now, t.revokedReason = :reason
            where t.memberId = :memberId and t.revokedAt is null
            """)
    int revokeAllByMemberId(@Param("memberId") Long memberId, @Param("now") Instant now,
                            @Param("reason") RevokedReason reason);

    /**
     * 만료 후 한참 지난 행 삭제 (정리 배치 — 리뷰 백로그 37번).
     * **만료(expires_at) 기준만 쓴다** — revoked_at 기준으로 지우면 폐기 행이 사라져
     * 재사용 감지가 "DB에 없음"(단순 401) 경로로 빠지고 발동하지 않는다.
     * 만료 행은 지워도 안전하다: 만료 검사가 폐기 검사보다 앞이라, 삭제된 만료 토큰의 제출은 어차피 단순 401이다.
     */
    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff")
    int deleteAllExpiredBefore(@Param("cutoff") Instant cutoff);
}
