package com.pet.backend.member;

import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 만료 리프레시 토큰 정리 배치 (리뷰 백로그 37번). 회전이 15분마다 행을 하나씩 남기므로
 * 정리가 없으면 세션 1개당 하루 ~96행이 무한히 쌓인다 (Supabase 무료 플랜 용량 문제).
 *
 * 삭제 기준은 "만료 후 7일 경과"다 — 폐기(revoked_at) 여부는 보지 않는다.
 * 이유는 {@link RefreshTokenRepository#deleteAllExpiredBefore} 주석 참조 (재사용 감지 보존).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RefreshTokenCleanup {

    // 만료 후 이만큼 더 보관한다. 만료 직후 삭제해도 동작은 같지만(만료 검사가 폐기 검사보다 앞),
    // 감사·문제 추적 시 최근 행을 볼 수 있게 여유를 둔다
    static final Duration RETENTION_AFTER_EXPIRY = Duration.ofDays(7);

    private final RefreshTokenRepository refreshTokenRepository;

    // 매일 04:30 (서버 시간대 기준 — 배포 시 서버 TZ 확인은 백로그 61번과 함께)
    @Scheduled(cron = "0 30 4 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        int deleted = refreshTokenRepository
                .deleteAllExpiredBefore(Instant.now().minus(RETENTION_AFTER_EXPIRY));
        if (deleted > 0) {
            log.info("만료 리프레시 토큰 {}건 삭제 (만료 후 {}일 경과분)",
                    deleted, RETENTION_AFTER_EXPIRY.toDays());
        }
    }
}
