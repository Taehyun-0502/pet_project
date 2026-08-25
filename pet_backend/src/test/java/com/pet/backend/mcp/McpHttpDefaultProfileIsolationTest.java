package com.pet.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import io.modelcontextprotocol.server.McpSyncServer;
import io.modelcontextprotocol.server.transport.WebMvcSseServerTransportProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

/**
 * 원격 커넥터 전환 1차(2026-08-24, 루트 CLAUDE.md "원격 커넥터 전환 — 단계 기획" ①)의
 * 절대 조건 — "기본 프로파일(팀원 일반 bootRun) 무영향"을 직접 증명한다.
 *
 * <p>{@code spring-ai-starter-mcp-server-webmvc}(build.gradle)를 추가한 것만으로 기본
 * 프로파일에도 MCP SSE 엔드포인트가 자동 노출될 위험이 있었다 — 이 스타터가 클래스패스에
 * 있으면 {@code spring.ai.mcp.server.enabled} 기본값(true)·{@code protocol} 기본값(SSE)
 * 조합으로 {@code McpServerSseWebMvcAutoConfiguration}이 활성화되기 때문이다.
 * {@code application.properties}에 추가한 {@code spring.ai.mcp.server.enabled=false}가
 * 실제로 이를 막는지 확인한다.
 *
 * <p>HTTP 상태코드로는 증명할 수 없다 — {@code SecurityConfig}의
 * {@code anyRequest().authenticated()}가 라우트 존재 여부와 무관하게 미인증 요청을 먼저
 * 401로 가로채므로, "라우트가 아예 없음"과 "라우트는 있는데 인증만 막힘"을 구분하지 못한다.
 * 그래서 빈 존재 여부를 컨텍스트 레벨에서 직접 확인한다. 이 테스트는 {@code @ActiveProfiles}를
 * 지정하지 않아 기본 프로파일로 컨텍스트를 띄운다({@link PetBackendApplicationTests}와 동일).
 */
@SpringBootTest
class McpHttpDefaultProfileIsolationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void 기본_프로파일에서는_MCP_서버_빈이_생성되지_않는다() {
        assertThat(applicationContext.getBeanNamesForType(McpSyncServer.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(WebMvcSseServerTransportProvider.class)).isEmpty();
    }

    @Test
    void 기본_프로파일에서는_MCP_HTTP_전용_보안체인이_생성되지_않는다() {
        // McpHttpSecurityConfig는 @Profile("mcp-http") 전용이라 기본 프로파일에는 등록되지 않는다.
        assertThat(applicationContext.containsBean("mcpHttpSecurityFilterChain")).isFalse();
    }
}
