package com.pet.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import io.modelcontextprotocol.server.transport.WebMvcSseServerTransportProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/**
 * mcp-http 프로파일(원격 커넥터 전환 1차)에서는 반대로 MCP SSE 서버 빈과, MCP 경로만
 * 별도로 여는 {@link McpHttpSecurityConfig}의 보안체인이 실제로 등록되는지 확인한다.
 * {@code webEnvironment = RANDOM_PORT}로 띄워 application-mcp-http.properties의 고정
 * 포트(8081)와 무관하게 항상 성공하게 한다(포트는 Spring Boot 테스트 프로퍼티가
 * 프로파일 파일보다 우선순위가 높아 자동으로 무작위 포트로 덮어써진다).
 *
 * <p>실제 HTTP(SSE 핸드셰이크 → initialize → tools/list) 왕복 검증은 자동화 테스트로 걷지
 * 않는다 — SSE는 응답을 스트림으로 열어 둔 채 유지하는 프로토콜이라 순진하게 블로킹
 * HTTP 클라이언트로 호출하면 테스트가 멈춘다. 그 검증은 실제 jar 기동 + curl/스크립트로
 * 별도 수행했다(작업 보고 참고).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("mcp-http")
class McpHttpProfileTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void mcp_http_프로파일에서는_SSE_전송_빈이_등록된다() {
        assertThat(applicationContext.getBeanNamesForType(WebMvcSseServerTransportProvider.class)).isNotEmpty();
    }

    @Test
    void mcp_http_프로파일에서는_MCP_전용_보안체인이_등록된다() {
        assertThat(applicationContext.containsBean("mcpHttpSecurityFilterChain")).isTrue();
    }

    @Test
    void mcp_http_프로파일에서도_기존_도구_빈은_그대로_공유된다() {
        // 도구 4종・instructions는 stdio(mcp 프로파일)와 재정의 없이 공유해야 한다
        // (루트 CLAUDE.md "도구 4종·instructions는 stdio와 공유(재정의 금지)").
        assertThat(applicationContext.getBeanNamesForType(DiseasePredictionMcpTool.class)).hasSize(1);
        assertThat(applicationContext.getBeanNamesForType(PlaceSearchMcpTool.class)).hasSize(1);
        assertThat(applicationContext.getBeanNamesForType(WalkWeatherMcpTool.class)).hasSize(1);
        assertThat(applicationContext.getBeanNamesForType(WalkBriefingMcpTool.class)).hasSize(1);
    }
}
