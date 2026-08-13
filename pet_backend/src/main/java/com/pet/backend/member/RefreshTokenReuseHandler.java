package com.pet.backend.member;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 리프레시 토큰 재사용이 감지됐을 때의 폐기 처리.
 *
 * **별도 클래스로 분리한 이유**: 재사용 감지는 "폐기한 뒤 401을 던지는" 흐름인데,
 * 같은 트랜잭션에서 폐기하면 뒤이어 던지는 예외가 그 폐기까지 롤백시켜 아무 일도 일어나지 않는다.
 * `REQUIRES_NEW`로 새 트랜잭션에서 먼저 커밋해야 요청이 실패로 끝나도 폐기가 남는다.
 * (같은 클래스 안에서 호출하면 프록시를 타지 않아 전파 설정이 무시되므로 빈을 따로 둔다)
 */
@Slf4j
@Component
@RequiredArgsConstructor
class RefreshTokenReuseHandler {

    private final RefreshTokenRepository refreshTokenRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void revokeAllOf(Long memberId) {
        int revoked = refreshTokenRepository.revokeAllByMemberId(
                memberId, Instant.now(), RevokedReason.REUSE_DETECTED);
        // 활성 토큰 폐기만으로는 **회전 유예 안의 토큰이 살아남는다** — 이미 revoked_at이 찍혀 있어
        // `revoked_at is null` 조건에서 빠지기 때문. 그대로 두면 감지 직후 30초 안에 그 토큰으로
        // 새 활성 토큰을 하나 더 만들 수 있어 세션을 완전히 끊지 못한다 (리뷰 백로그 108번).
        // 비밀번호 변경·탈퇴에는 같은 처리가 필요 없다 — tokens_valid_from(77번)이 재발급을 막는다
        int graceExpired = refreshTokenRepository.expireRotationGraceByMember(
                memberId, RevokedReason.REUSE_DETECTED,
                RevokedReason.ROTATED, RefreshTokenService.rotationGraceCutoff());
        // 정상 사용에서는 나오지 않는 경로다 — 흔적을 남겨 사후에 확인할 수 있게 한다
        log.warn("리프레시 토큰 재사용 감지 — memberId={}, 폐기한 활성 토큰 {}개 + 유예 토큰 {}개",
                memberId, revoked, graceExpired);
    }
}
