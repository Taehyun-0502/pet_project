package com.pet.backend.security;

import com.pet.backend.member.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * JWT 토큰 제공자 — 액세스 토큰을 만들어 서명한다.
 * 클레임은 sub(회원 id), role, iat, exp 최소한만 담는다.
 * JWT는 서명만 될 뿐 암호화되지 않으므로 email·name 같은 개인정보는 넣지 않는다 (docs/api-spec.md 1절).
 */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(JwtProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
        this.expirationMs = properties.expirationMs();
    }

    public String createAccessToken(Long memberId, Role role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(memberId))
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                .signWith(key)
                .compact();
    }

    // 로그인 응답의 expiresIn 필드용 (초 단위)
    public long expirationSeconds() {
        return expirationMs / 1000;
    }

    // 토큰에서 꺼낸 인증 정보
    public record TokenPayload(Long memberId, Role role) {}

    /**
     * 토큰을 열어 회원 id와 role을 꺼낸다.
     * 서명 위조·형식 오류면 JwtException, 만료면 ExpiredJwtException이 던져진다
     * — 구분 처리는 JwtAuthenticationFilter가 담당.
     */
    public TokenPayload parse(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new TokenPayload(
                Long.valueOf(claims.getSubject()),
                Role.valueOf(claims.get("role", String.class)));
    }
}
