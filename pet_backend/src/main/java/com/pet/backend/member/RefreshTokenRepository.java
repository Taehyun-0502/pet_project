package com.pet.backend.member;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    // 쿠키로 받은 원문을 해시해 조회 — 폐기된 토큰도 찾아야 재사용을 감지할 수 있으므로 상태로 거르지 않는다
    Optional<RefreshToken> findByTokenHash(String tokenHash);

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
}
