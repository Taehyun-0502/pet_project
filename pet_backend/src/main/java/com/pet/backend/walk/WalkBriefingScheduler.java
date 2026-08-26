package com.pet.backend.walk;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 산책 브리핑 판정 스케줄러. {@code @EnableScheduling}은 {@code PetBackendApplication}에
 * 이미 켜져 있다(RefreshTokenCleanup과 공용).
 *
 * <p>cron은 {@code walk.briefing.cron}(기본 매일 17:55, KST — 자바 판정을 클로드 발송
 * 브리지 18:00보다 5분 앞서 돌리는 확정값. 루트 CLAUDE.md AI 강아지 관리 비서 Phase v2)이다.
 * 테스트 시각 조정은 {@code .env}의 {@code WALK_BRIEFING_CRON}으로 오버라이드한다.
 *
 * <p>{@code mcp}·{@code mcp-http} 프로파일(키 없는 로컬 검증 환경)에서는 이 스케줄러 자체를
 * 등록하지 않는다(QA M-2) — 이 프로파일들에서 KMA_SERVICE_KEY가 없으면 mock 날씨로 hot이
 * 오판정돼 실배포(EC2)가 저장한 최신 판정 행을 덮어쓸 수 있었다. {@link WalkBriefingService}의
 * mock 폴백 저장 차단과 이중 방어를 이룬다.
 */
@Component
@Profile("!mcp & !mcp-http")
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
