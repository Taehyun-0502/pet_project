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
                // 세션·쿠키 기반 인증을 쓰지 않으므로(JWT stateless) CSRF 방어 대상이 없다
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Security 기본 로그인 폼·Basic 인증 비활성화 — 인증은 JWT로만
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        // /api/members 아래에 보호 대상(/me)도 있으므로 공개 경로를 정확히 지정.
                        // refresh·logout은 Authorization 헤더가 아니라 쿠키로 인증하므로 여기서는 공개다
                        .requestMatchers("/api/members/signup", "/api/members/login",
                                "/api/members/login/kakao",
                                "/api/members/refresh", "/api/members/logout",
                                "/api/v1/skin/**", "/api/v1/hybrid/**").permitAll()
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
