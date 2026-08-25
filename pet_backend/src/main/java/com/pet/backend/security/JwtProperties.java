package com.pet.backend.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 설정값 통. application.properties의 jwt.* 값(원본은 .env)이 여기로 주입된다.
 * 코드 곳곳에서 @Value로 흩어 쓰지 않고 이 record 하나로만 받는다 (docs/conventions.md 4절).
 */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(
        // 서명 시크릿. **문자열 그 자체가 키**이며 HS512 고정이므로 UTF-8 기준 64바이트 이상이어야 한다
        // (짧으면 JwtTokenProvider 생성자가 기동을 막는다 — 리뷰 백로그 6번)
        String secret,
        long expirationMs     // 액세스 토큰 만료 (밀리초). 현재 합의값 15분 = 900000
) {}
