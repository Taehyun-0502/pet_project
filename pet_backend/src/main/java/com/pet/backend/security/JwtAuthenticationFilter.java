package com.pet.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.common.ApiResponse;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.MemberErrorCode;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청마다 Authorization: Bearer 헤더의 액세스 토큰을 검사하는 검문소.
 * - 토큰 유효 → SecurityContext에 "회원 id + ROLE" 인증 정보를 실어 통과
 * - 토큰 없음 → 미인증 상태로 통과 (보호된 경로면 RestAuthenticationEntryPoint가 401 응답)
 * - 토큰 만료/위조 → 여기서 즉시 401 응답 (필터는 GlobalExceptionHandler 바깥이므로 직접 직렬화)
 */
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;

    /**
     * 회원 공개 경로 — SecurityConfig(permitAll)와 이 필터(shouldNotFilter)가 함께 참조하는
     * **단일 출처** (백로그 40번). 여기에 경로를 추가하면 양쪽에 동시에 반영된다.
     *
     * 두 목록은 원래 의미가 다르다: SecurityConfig는 "인증 없이 접근 허용",
     * 이 필터는 "토큰 검사 자체를 건너뜀"(= 만료된 토큰을 헤더에 단 채 호출해도 성공해야 하는 경로).
     * 회원 5개 경로는 두 의미가 정확히 겹치므로 공유한다. 겹치지 않는 공개 경로는 각자 관리 —
     * 이 필터의 OTHER_SKIPPED_URIS 및 SecurityConfig의 permitAll 주석 참조.
     *
     * **refresh가 특히 중요하다**: 액세스 토큰이 만료돼서 재발급을 요청하는 것이 정상 동선인데,
     * 여기서 걸러내지 않으면 필터가 먼저 401(AUTH_TOKEN_EXPIRED)을 내보내 재발급 자체가 막힌다.
     */
    public static final Set<String> MEMBER_PUBLIC_URIS = Set.of(
            "/api/members/signup",
            "/api/members/login",
            "/api/members/login/kakao",
            "/api/members/refresh",
            "/api/members/logout");

    /**
     * 회원 경로 외에 토큰 검사를 건너뛰는 경로. SecurityConfig와 공유하지 않는 이유:
     * - /api/ads: 필터는 메서드를 구분하지 못해 전 메서드 스킵, SecurityConfig는 GET만 공개 — 의미가 다르다
     * - 반대로 GET /api/shorts(피드)는 SecurityConfig에서 공개지만 여기 넣으면 안 된다 —
     *   컨트롤러가 @AuthenticationPrincipal로 로그인 사용자를 개인화하므로 필터를 타야 principal이 실린다.
     *   /ws(핸드셰이크 후 STOMP CONNECT에서 인증)·/api/v1/skin·hybrid도 같은 이유 계열로 각자 관리 (로드맵 20번 묶음 3 조사)
     */
    private static final Set<String> OTHER_SKIPPED_URIS = Set.of("/api/ads");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return MEMBER_PUBLIC_URIS.contains(uri) || OTHER_SKIPPED_URIS.contains(uri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }
        String token = header.substring(BEARER_PREFIX.length());
        try {
            JwtTokenProvider.TokenPayload payload = jwtTokenProvider.parse(token);
            var authentication = new UsernamePasswordAuthenticationToken(
                    payload.memberId(), null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + payload.role().name())));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (ExpiredJwtException e) {
            writeError(response, MemberErrorCode.TOKEN_EXPIRED);
            return;
        } catch (JwtException | IllegalArgumentException e) {
            writeError(response, MemberErrorCode.TOKEN_INVALID);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, ErrorCode code) throws IOException {
        response.setStatus(code.getStatus().value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                ApiResponse.fail(code.getCode(), code.getDefaultMessage())));
    }
}
