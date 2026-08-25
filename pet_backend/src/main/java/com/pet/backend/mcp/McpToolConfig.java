package com.pet.backend.mcp;

import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MCP 서버가 노출할 도구 묶음. 각 도구 클래스({@code @Component})는 이미 기존 서비스에
 * 위임하는 얇은 어댑터이고, 이 설정은 그것들을 하나의 {@link ToolCallbackProvider}로 묶어
 * spring-ai-starter-mcp-server 자동구성이 MCP {@code tools/list}에 등록하게 한다
 * (루트 CLAUDE.md "Phase: MCP 대화형 입구").
 */
@Configuration
@RequiredArgsConstructor
public class McpToolConfig {

    private final DiseasePredictionMcpTool diseasePredictionMcpTool;
    private final PlaceSearchMcpTool placeSearchMcpTool;
    private final WalkWeatherMcpTool walkWeatherMcpTool;
    private final WalkBriefingMcpTool walkBriefingMcpTool;

    @Bean
    public ToolCallbackProvider petCareMcpTools() {
        return MethodToolCallbackProvider.builder()
                .toolObjects(diseasePredictionMcpTool, placeSearchMcpTool, walkWeatherMcpTool, walkBriefingMcpTool)
                .build();
    }
}
