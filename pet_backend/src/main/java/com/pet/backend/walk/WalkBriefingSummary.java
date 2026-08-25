package com.pet.backend.walk;

import java.time.Instant;

/**
 * "오늘 산책 브리핑" 조회 결과를 도메인 밖(주로 {@code mcp} 패키지)에 노출하기 위한 요약 DTO.
 * {@link WalkBriefingEvent}는 도메인 내부 타입(패키지 전용)이라 밖으로 그대로 내보낼 수 없으므로,
 * 판정 로직은 전혀 새로 만들지 않고 {@link WalkBriefing} 엔티티 값만 그대로 옮겨 담는다
 * (루트 CLAUDE.md "Phase: MCP 대화형 입구" — 도구는 기존 서비스 위임, 로직 복제 금지).
 *
 * @param eventCode     판정 이벤트 코드 — walk_briefing.event 컬럼과 동일 문자열
 *                      ("hot" | "gap_good" | "none" | "skip_no_record")
 * @param shouldNotify  알림(발송) 대상 여부 (필드명 notify는 record에서 예약된 Object#notify()와
 *                      충돌해 사용할 수 없다 — DB 컬럼명 자체는 여전히 notify)
 * @param reason        판정 사유 — 이미 자연어 문장(WalkBriefingService.judge() 참고)
 * @param riskLevel     위험 단계. skip_no_record일 때는 null(날씨 자체를 조회하지 않음)
 * @param asphaltTemp   아스팔트 온도(℃). skip_no_record일 때는 null
 * @param gapDays       마지막 산책 이후 경과 일수. skip_no_record일 때는 null
 * @param petId         마지막 산책 기록의 반려동물 ID. 기록 자체가 nullable이라 이 값도 nullable
 * @param checkedAt     판정 시각
 */
public record WalkBriefingSummary(
        String eventCode,
        boolean shouldNotify,
        String reason,
        RiskLevel riskLevel,
        Double asphaltTemp,
        Integer gapDays,
        Long petId,
        Instant checkedAt
) {

    static WalkBriefingSummary from(WalkBriefing briefing) {
        return new WalkBriefingSummary(
                briefing.getEvent().code(),
                briefing.isNotify(),
                briefing.getReason(),
                briefing.getRiskLevel(),
                briefing.getAsphaltTemp(),
                briefing.getGapDays(),
                briefing.getPetId(),
                briefing.getCheckedAt());
    }
}
