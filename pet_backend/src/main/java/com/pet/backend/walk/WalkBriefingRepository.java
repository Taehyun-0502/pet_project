package com.pet.backend.walk;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface WalkBriefingRepository extends JpaRepository<WalkBriefing, Long> {

    // MCP 도구 ④(오늘 산책 브리핑, WalkBriefingService.getTodaysBriefing())의 조회용 —
    // checkedAt이 [start, end) 구간(오늘 00:00 KST ~ 지금)에 속하는 가장 최근 판정 1건.
    Optional<WalkBriefing> findFirstByCheckedAtBetweenOrderByCheckedAtDesc(Instant start, Instant end);
}
