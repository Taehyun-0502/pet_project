package com.pet.backend.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 설정값 통. application.properties의 jwt.* 값(원본은 .env)이 여기로 주입된다.
 * 코드 곳곳에서 @Value로 흩어 쓰지 않고 이 record 하나로만 받는다 (docs/conventions.md 4절).
 */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(
        String secret,        // 서명 시크릿 (32바이트 이상)
        long expirationMs     // 액세스 토큰 만료 (밀리초)
) {}
