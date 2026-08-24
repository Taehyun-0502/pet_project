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

    /**
     * HS512에 필요한 키 길이(바이트). 서명 알고리즘을 고정했으므로 이 길이도 함께 고정된다
     * (리뷰 백로그 6번). `.env`의 `JWT_SECRET`은 **문자열 그 자체가 키**이므로,
     * 48바이트 난수를 base64로 인코딩한 64자 문자열이면 정확히 64바이트가 된다.
     */
    private static final int REQUIRED_KEY_BYTES = 64;

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(JwtProperties properties) {
        byte[] keyBytes = properties.secret().getBytes(StandardCharsets.UTF_8);
        // 길이 검사를 생성자에 두는 이유 (백로그 6번): jjwt는 키 길이에 맞춰 알고리즘을 **조용히** 낮춘다.
        // 짧은 시크릿으로 바꾸면 서명이 HS512에서 HS384로 내려가도 아무 신호가 없다.
        // 여기서 막으면 그 변경이 **기동 시점에** 드러난다 — 첫 로그인까지 미뤄지지 않는다
        if (keyBytes.length < REQUIRED_KEY_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET은 UTF-8 기준 %d바이트 이상이어야 합니다(HS512). 현재 %d바이트 — .env를 확인하세요."
                            .formatted(REQUIRED_KEY_BYTES, keyBytes.length));
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMs = properties.expirationMs();
    }

    public String createAccessToken(Long memberId, Role role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(memberId))
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                // 알고리즘을 명시한다 — 생략하면 jjwt가 키 길이에 맞춰 고르므로 시크릿을 바꾸는 것만으로
                // 서명 강도가 조용히 달라진다 (백로그 6번, 위 생성자 검사와 한 쌍)
                .signWith(key, Jwts.SIG.HS512)
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
