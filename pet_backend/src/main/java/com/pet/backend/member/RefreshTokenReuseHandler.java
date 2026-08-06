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
        // 정상 사용에서는 나오지 않는 경로다 — 흔적을 남겨 사후에 확인할 수 있게 한다
        log.warn("리프레시 토큰 재사용 감지 — memberId={}, 폐기한 활성 토큰 {}개", memberId, revoked);
    }
}
