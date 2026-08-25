package com.pet.backend.mcp;

import com.pet.backend.walk.WalkBriefingService;
import com.pet.backend.walk.WalkBriefingSummary;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

/**
 * MCP 도구 ④ — 오늘 산책 브리핑. 판정은 이미 자바 스케줄러({@code WalkBriefingScheduler} →
 * {@code WalkBriefingService.runBriefing()})가 끝내 DB(walk_briefing)에 기록해 두었으므로,
 * 이 도구는 새 판정을 하지 않고 오늘자 최신 판정 1건을 그대로 읽어 자연어로 옮길 뿐이다
 * (루트 CLAUDE.md AI 강아지 관리 비서 Phase v2와 동일 판정 공유 — 비서 알림의 "당기기" 짝).
 * 좌표 파라미터가 없다 — 기준 좌표는 이미 판정 시점에 마지막 산책 기록에서 정해졌다.
 */
@Component
@RequiredArgsConstructor
public class WalkBriefingMcpTool {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm").withZone(KST);

    private final WalkBriefingService walkBriefingService;
    private final WebLinks webLinks;

    @Tool(description = "오늘 산책 브리핑(아스팔트 온도 경고 또는 산책하기 좋은 시점 안내)의 최신 판정을 조회한다. "
            + "좌표는 필요 없다.")
    public String getTodaysWalkBriefing() {
        Optional<WalkBriefingSummary> maybeBriefing = walkBriefingService.getTodaysBriefing();
        if (maybeBriefing.isEmpty()) {
            return "오늘 판정 없음 — 아직 오늘 산책 브리핑이 만들어지지 않았어요(백엔드 스케줄이 아직 실행되지 않았을 수 있어요). "
                    + "산책 페이지에서 직접 확인해보세요: " + webLinks.walkUrl();
        }

        WalkBriefingSummary briefing = maybeBriefing.get();
        if (!briefing.shouldNotify()) {
            return "오늘은 특별히 알려드릴 산책 안내가 없어요. 산책 페이지: " + webLinks.walkUrl();
        }

        String message = switch (briefing.eventCode()) {
            case "hot" -> "오늘 %s 기준 아스팔트 온도가 약 %.1f℃(%s)로 확인돼요. 발바닥 화상 위험이 있으니 산책 시간을 조정해 주세요."
                    .formatted(TIME_FORMAT.format(briefing.checkedAt()), briefing.asphaltTemp(),
                            WalkWeatherMcpTool.riskLabel(briefing.riskLevel()));
            case "gap_good" -> "마지막 산책 이후 %d일이 지났고 오늘은 날씨도 산책하기 좋은 조건이에요."
                    .formatted(briefing.gapDays());
            default -> briefing.reason();
        };
        return message + "\n산책 페이지: " + webLinks.walkUrl();
    }
}
