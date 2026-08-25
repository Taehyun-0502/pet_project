package com.pet.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pet.backend.common.BusinessException;
import com.pet.backend.walk.RiskLevel;
import com.pet.backend.walk.WalkErrorCode;
import com.pet.backend.walk.WalkWeatherResponse;
import com.pet.backend.walk.WalkWeatherService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * MCP 도구 ③이 확정 공식·기상청 연동을 새로 만들지 않고 {@link WalkWeatherService}에
 * 위임하는지, RiskLevel enum 값을 그대로 노출하지 않고 한국어 라벨로만 응답하는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class WalkWeatherMcpToolTest {

    @Mock
    private WalkWeatherService walkWeatherService;

    private final WebLinks webLinks = new WebLinks("http://localhost:5173");

    @Test
    void 위험_단계이면_화상_주의_문구와_함께_한국어_라벨로_응답한다() {
        when(walkWeatherService.getWeather(37.5, 127.0))
                .thenReturn(new WalkWeatherResponse(32.0, 60.0, 1.5, 700.0, 40.3, RiskLevel.DANGER, "202608241200"));
        WalkWeatherMcpTool tool = new WalkWeatherMcpTool(walkWeatherService, webLinks);

        String result = tool.getWalkWeather(37.5, 127.0);

        verify(walkWeatherService).getWeather(37.5, 127.0);
        assertThat(result).contains("위험").doesNotContain("DANGER");
        assertThat(result).contains("화상");
        assertThat(result).contains("http://localhost:5173/walk");
    }

    @Test
    void 안전_단계이면_화상_주의_문구가_없다() {
        when(walkWeatherService.getWeather(37.5, 127.0))
                .thenReturn(new WalkWeatherResponse(20.0, 60.0, 1.5, 300.0, 22.0, RiskLevel.SAFE, "202608241200"));
        WalkWeatherMcpTool tool = new WalkWeatherMcpTool(walkWeatherService, webLinks);

        String result = tool.getWalkWeather(37.5, 127.0);

        assertThat(result).contains("안전").doesNotContain("화상");
    }

    @Test
    void 날씨_조회_실패시_원본_예외_대신_도메인_안내_메시지를_반환한다() {
        when(walkWeatherService.getWeather(37.5, 127.0))
                .thenThrow(new BusinessException(WalkErrorCode.WEATHER_FETCH_FAILED));
        WalkWeatherMcpTool tool = new WalkWeatherMcpTool(walkWeatherService, webLinks);

        String result = tool.getWalkWeather(37.5, 127.0);

        assertThat(result).isEqualTo(WalkErrorCode.WEATHER_FETCH_FAILED.getDefaultMessage());
    }
}
