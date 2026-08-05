package com.pet.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.common.ApiResponse;
import com.pet.backend.common.ErrorCode;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
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

    // 공개 경로(가입·로그인)는 토큰 검사 자체를 건너뛴다 —
    // 만료된 토큰을 헤더에 단 채 재로그인하는 경우에도 로그인은 성공해야 하므로
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/api/auth/");
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
            writeError(response, ErrorCode.AUTH_TOKEN_EXPIRED);
            return;
        } catch (JwtException | IllegalArgumentException e) {
            writeError(response, ErrorCode.AUTH_TOKEN_INVALID);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, ErrorCode code) throws IOException {
        response.setStatus(code.getStatus().value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                ApiResponse.fail(code.name(), code.getDefaultMessage())));
    }
}
