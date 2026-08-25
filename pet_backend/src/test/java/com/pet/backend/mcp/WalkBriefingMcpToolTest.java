package com.pet.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.pet.backend.walk.RiskLevel;
import com.pet.backend.walk.WalkBriefingService;
import com.pet.backend.walk.WalkBriefingSummary;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * MCP 도구 ④가 새 판정을 하지 않고 {@link WalkBriefingService#getTodaysBriefing()}이
 * 돌려준 오늘자 최신 판정을 그대로 자연어로 옮기는지 확인한다 (판정 로직은
 * WalkBriefingServiceTest가 이미 검증 — 여기서는 위임·문구 조립만 본다).
 */
@ExtendWith(MockitoExtension.class)
class WalkBriefingMcpToolTest {

    @Mock
    private WalkBriefingService walkBriefingService;

    private final WebLinks webLinks = new WebLinks("http://localhost:5173");

    @Test
    void 오늘_행이_없으면_스케줄_미실행_안내를_반환한다() {
        when(walkBriefingService.getTodaysBriefing()).thenReturn(Optional.empty());
        WalkBriefingMcpTool tool = new WalkBriefingMcpTool(walkBriefingService, webLinks);

        String result = tool.getTodaysWalkBriefing();

        assertThat(result).contains("오늘 판정 없음");
        assertThat(result).contains("http://localhost:5173/walk");
    }

    @Test
    void notify가_false면_특별한_안내가_없다는_문구를_반환한다() {
        WalkBriefingSummary summary = new WalkBriefingSummary(
                "none", false, "알림 조건 미충족", RiskLevel.SAFE, 22.0, 0, 1L, Instant.now());
        when(walkBriefingService.getTodaysBriefing()).thenReturn(Optional.of(summary));
        WalkBriefingMcpTool tool = new WalkBriefingMcpTool(walkBriefingService, webLinks);

        String result = tool.getTodaysWalkBriefing();

        assertThat(result).contains("특별히 알려드릴 산책 안내가 없어요");
    }

    @Test
    void hot_이벤트는_아스팔트_온도와_한국어_위험_라벨을_안내한다() {
        Instant checkedAt = Instant.now();
        WalkBriefingSummary summary = new WalkBriefingSummary(
                "hot", true, "아스팔트 온도 위험", RiskLevel.DANGER, 40.3, null, 7L, checkedAt);
        when(walkBriefingService.getTodaysBriefing()).thenReturn(Optional.of(summary));
        WalkBriefingMcpTool tool = new WalkBriefingMcpTool(walkBriefingService, webLinks);

        String result = tool.getTodaysWalkBriefing();

        assertThat(result).contains("40.3").contains("위험").doesNotContain("DANGER");
        assertThat(result).contains("http://localhost:5173/walk");
    }

    @Test
    void gap_good_이벤트는_경과일수를_안내한다() {
        WalkBriefingSummary summary = new WalkBriefingSummary(
                "gap_good", true, "산책 공백 3일 이상", null, null, 3, 7L, Instant.now());
        when(walkBriefingService.getTodaysBriefing()).thenReturn(Optional.of(summary));
        WalkBriefingMcpTool tool = new WalkBriefingMcpTool(walkBriefingService, webLinks);

        String result = tool.getTodaysWalkBriefing();

        assertThat(result).contains("3일");
    }
}
