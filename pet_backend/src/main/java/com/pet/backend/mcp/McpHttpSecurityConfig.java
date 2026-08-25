package com.pet.backend.mcp;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * mcp-http 프로파일(원격 커넥터 전환 1차, 루트 CLAUDE.md "원격 커넥터 전환 — 단계 기획")
 * 전용 — MCP 엔드포인트(SSE: {@code /sse}, {@code /mcp/**})만 별도 {@link SecurityFilterChain}으로
 * 분리해 인증 없이 연다.
 *
 * <p><b>{@code security.SecurityConfig}(멤버 1 도메인)는 건드리지 않는다.</b> Spring Security는
 * 여러 개의 {@code SecurityFilterChain} 빈을 등록할 수 있고, 각 체인은 {@code securityMatcher}로
 * 담당 경로를 지정하며 {@code @Order} 값이 작을수록 먼저 검사된다. 이 클래스는 MCP 경로만
 * 가로채는 최우선순위 체인을 새로 추가할 뿐이고, 그 외 모든 경로는 그대로
 * {@code SecurityConfig}의 기존 체인({@code anyRequest().authenticated()})으로 흘러간다.
 * {@code @Profile("mcp-http")}로 한정돼 있어 기본 프로파일(팀원 일반 bootRun)에는 이 빈
 * 자체가 생성되지 않는다 — 영향 없음.
 *
 * <p><b>왜 인증 없이 여는가</b>: 이 프로파일은 "배포만 하면 커스텀 커넥터로 등록 가능한 서버"
 * 상태를 만드는 1차 작업의 localhost 검증용이다. 실제 인터넷에 노출하는 배포·인증(비밀 경로
 * URL 또는 OAuth)은 2차 범위로 이미 기획만 확정돼 있다(루트 CLAUDE.md 해당 절 ② 참고).
 * 지금 인증을 붙이면 SecurityConfig의 JWT 필터·CORS 설정과 얽혀 다른 멤버 도메인을 건드리게
 * 되므로, 1차에서는 이 프로파일이 로컬 검증에서만 쓰인다는 전제로 열어 둔다.
 */
@Configuration
@Profile("mcp-http")
public class McpHttpSecurityConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public SecurityFilterChain mcpHttpSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                // 이 체인은 MCP 경로에만 적용된다 — 다른 모든 요청은 SecurityConfig의 기존
                // 체인(더 낮은 우선순위, securityMatcher 없음 = 전체 경로 매칭)으로 넘어간다.
                .securityMatcher("/sse/**", "/mcp/**")
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
