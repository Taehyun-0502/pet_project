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
     * 세션 폐기가 놓치는 **회전 유예 안의 토큰**을 함께 무력화한다 (리뷰 백로그 108번).
     *
     * <p>위 {@link #revokeAllBySession}은 `revoked_at is null`만 잡는데, 유예 중인 토큰은
     * 회전으로 이미 `revoked_at`이 찍혀 있어 그 조건에 걸리지 않는다. 그대로 두면 원격 로그아웃 직후
     * 그 토큰을 재제출해 같은 `session_id`를 상속한 새 토큰을 받을 수 있다 — **끊은 기기가 되살아난다.**
     *
     * <p>그래서 `revoked_at`이 아니라 **사유만** 바꾼다. 유예 자격은 사유가 `ROTATED`일 때만 주어지므로
     * (`RefreshToken.isWithinRotationGrace`) 사유가 바뀌는 순간 유예에서 빠진다.
     * `revoked_at`을 다시 쓰지 않는 것이 중요하다 — 그것이 108번의 원인이었다.
     *
     * <p>대상을 `revokedAt > :graceCutoff`로 좁히는 이유: 유예를 이미 넘긴 옛 `ROTATED` 토큰까지 사유를 바꾸면
     * 그 토큰의 재제출이 재사용 감지(전체 폐기)가 아니라 단순 401로 떨어져 **감지가 약해진다.**
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedReason = :reason
            where t.memberId = :memberId and t.sessionId = :sessionId
              and t.revokedReason = :rotated and t.revokedAt > :graceCutoff
            """)
    int expireRotationGraceBySession(@Param("memberId") Long memberId, @Param("sessionId") UUID sessionId,
                                     @Param("reason") RevokedReason reason,
                                     @Param("rotated") RevokedReason rotated,
                                     @Param("graceCutoff") Instant graceCutoff);

    /**
     * 이 토큰이 지금 그 사유로 폐기돼 있는가 — **DB의 현재 값**을 읽는다 (리뷰 백로그 109번).
     *
     * <p>엔티티가 아니라 스칼라 집계를 조회하는 것이 핵심이다. 회전 대상 토큰은 이미 영속성 컨텍스트에
     * 올라와 있고 그 스냅샷은 **검증 시점의 낡은 값**이라, 그 사이 다른 트랜잭션이 커밋한 폐기를 보지 못한다.
     * 엔티티로 다시 조회해도 1차 캐시가 돌려주므로 낡은 값 그대로다.
     *
     * <p>이 조회를 왜 회전 **전에** 해야 하는지: 낡은 스냅샷으로 회전하면 `revoke(ROTATED)`의
     * dirty update가 DB에 찍혀 있던 `DEVICE_REVOKED`를 **덮어쓴다**. 회전 뒤에 확인하면
     * 방금 스스로 지운 흔적을 찾는 꼴이라 언제나 통과한다 (2026-08-13 검증에서 13라운드 중 4건 실측).
     */
    @Query("select count(t) > 0 from RefreshToken t where t.id = :tokenId and t.revokedReason = :reason")
    boolean isRevokedWithReason(@Param("tokenId") Long tokenId, @Param("reason") RevokedReason reason);

    /**
     * {@link #expireRotationGraceBySession}의 회원 전체 판 — 재사용 감지 전용.
     *
     * <p>감지가 발동해도 유예 중 토큰이 살아남으면 30초 안에 새 활성 토큰을 하나 더 만들 수 있어
     * **세션을 완전히 끊지 못한다.** 비밀번호 변경·탈퇴는 같은 구멍이 있어도 `tokens_valid_from`(백로그 77번)이
     * 재발급을 막으므로 이 처리가 필요 없다 — 그래서 호출부는 재사용 감지 한 곳뿐이다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedReason = :reason
            where t.memberId = :memberId
              and t.revokedReason = :rotated and t.revokedAt > :graceCutoff
            """)
    int expireRotationGraceByMember(@Param("memberId") Long memberId,
                                    @Param("reason") RevokedReason reason,
                                    @Param("rotated") RevokedReason rotated,
                                    @Param("graceCutoff") Instant graceCutoff);

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
