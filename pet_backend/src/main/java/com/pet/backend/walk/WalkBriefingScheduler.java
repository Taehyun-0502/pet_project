package com.pet.backend.walk;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 산책 브리핑 판정 스케줄러. {@code @EnableScheduling}은 {@code PetBackendApplication}에
 * 이미 켜져 있다(RefreshTokenCleanup과 공용).
 *
 * <p>cron은 {@code walk.briefing.cron}(기본 매일 12:00, KST)으로 안정화 기간에는 정오,
 * 확인 후 18:00로 복귀 예정(루트 CLAUDE.md AI 강아지 관리 비서 Phase v2). 테스트 시각
 * 조정은 {@code .env}의 {@code WALK_BRIEFING_CRON}으로 오버라이드한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WalkBriefingScheduler {

    private final WalkBriefingService walkBriefingService;

    @Scheduled(cron = "${walk.briefing.cron:0 55 17 * * *}", zone = "Asia/Seoul")
    public void run() {
        try {
            walkBriefingService.runBriefing();
        } catch (Exception e) {
            // 스케줄 스레드가 예외로 죽지 않도록 어떤 예외든 여기서 잡아 로그만 남긴다.
            log.error("산책 브리핑 스케줄 실행 중 예외가 발생했습니다.", e);
        }
    }
}
