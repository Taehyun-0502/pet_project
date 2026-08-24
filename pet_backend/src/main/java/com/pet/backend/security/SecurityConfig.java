package com.pet.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 접근 정책: 회원 공개 엔드포인트(가입·로그인)만 공개, 나머지는 인증 필요 (docs/conventions.md 4절).
 * 로그인 구현 시 JwtAuthenticationFilter가 이 체인에 추가된다.
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;

    // 허용 오리진 — WebSocket 오리진(ChatWebSocketConfig)과 단일 출처로 공유한다.
    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                /*
                 * CSRF 토큰을 쓰지 않는다. **"쿠키 기반 인증이 없어서"가 아니다** (리뷰 백로그 36번 —
                 * 종전 주석은 사실이 아니었다): `/refresh`·`/logout`은 **쿠키만으로 인증하는 상태 변경
                 * POST**라 전형적인 CSRF 대상이다. 지금 이것을 막고 있는 것은 CSRF 토큰이 아니라
                 * 리프레시 쿠키의 **SameSite=Strict**(RefreshTokenCookie) 하나뿐이다.
                 *
                 * ⚠ 그래서 **프론트를 백엔드와 다른 사이트에 배포해 SameSite=None으로 바꾸는 순간
                 * 방어가 0이 된다.** 그때는 대체 방어가 선행이어야 한다 — 엔드포인트가 2개뿐이므로
                 * Origin 헤더 화이트리스트 검증(이미 주입받는 allowedOrigins 재사용)이 가장 싸다.
                 * 판단 근거와 조건은 api-spec.md 6절에 기록했다.
                 */
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Security 기본 로그인 폼·Basic 인증 비활성화 — 인증은 JWT로만
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        // 회원 공개 경로 — JwtAuthenticationFilter.MEMBER_PUBLIC_URIS가 단일 출처 (백로그 40번).
                        // /api/members 아래에 보호 대상(/me)도 있으므로 공개 경로를 정확히 지정.
                        // refresh·logout은 Authorization 헤더가 아니라 쿠키로 인증하므로 여기서는 공개다
                        .requestMatchers(
                                JwtAuthenticationFilter.MEMBER_PUBLIC_URIS.toArray(String[]::new))
                        .permitAll()
                        // 아래 공개 경로들은 필터의 스킵 목록과 공유하지 않는다 — "인증 불요"일 뿐,
                        // 만료 토큰을 달고도 성공해야 할 요구가 없어 토큰 검사 스킵이 불필요하거나(skin·hybrid),
                        // 스킵하면 오히려 깨진다(GET /api/shorts의 @AuthenticationPrincipal 개인화).
                        // 상세는 JwtAuthenticationFilter.OTHER_SKIPPED_URIS 주석 참조 (로드맵 20번 묶음 3)
                        .requestMatchers("/api/v1/skin/**", "/api/v1/hybrid/**").permitAll()
                        // WebSocket 핸드셰이크(HTTP GET). 브라우저가 헤더를 못 붙이므로 여기서는 인증하지 않고,
                        // 그 다음 STOMP CONNECT 프레임에서 ChatStompInterceptor가 JWT를 검증한다
                        .requestMatchers("/ws").permitAll()
                        // 숏츠 피드와 댓글 목록은 로그인 없이 볼 수 있다.
                        .requestMatchers(HttpMethod.GET, "/api/shorts").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/shorts/*/comments").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/ads").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(handler ->
                        handler.authenticationEntryPoint(authenticationEntryPoint))
                // 아이디/비밀번호 폼 인증 자리에 JWT 검문소를 배치.
                .addFilterBefore(new JwtAuthenticationFilter(jwtTokenProvider, objectMapper),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /**
     * HTTP CORS. 오리진 목록은 프로퍼티(app.cors.allowed-origins) 주입
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
