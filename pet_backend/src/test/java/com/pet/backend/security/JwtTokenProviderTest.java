package com.pet.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.pet.backend.member.Role;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/**
 * 서명 알고리즘이 시크릿 길이에 따라 **조용히 바뀌지 않는지** 지킨다 (리뷰 백로그 6번).
 *
 * <p>예전에는 알고리즘을 명시하지 않아 jjwt가 키 길이에 맞춰 골랐다. 그래서 누군가 `.env`의
 * `JWT_SECRET`을 짧은 값으로 바꾸면 서명이 HS512에서 HS384로 내려가도 **아무 신호가 없었다** —
 * 토큰은 정상 발급되고 검증도 통과하므로 테스트 없이는 잡히지 않는다.
 * 이 테스트가 그 회귀를 막는다.
 */
class JwtTokenProviderTest {

    // 실제 운영값과 같은 형태 — 48바이트 난수를 base64로 인코딩하면 64자(=64바이트) 문자열이 된다
    private static final String VALID_SECRET =
            Base64.getEncoder().encodeToString(new byte[48]).replace('=', 'A');

    private JwtTokenProvider provider(String secret) {
        return new JwtTokenProvider(new JwtProperties(secret, 900_000L));
    }

    @Test
    void 짧은_시크릿은_기동_시점에_거부된다() {
        // 63바이트 — HS512에 한 바이트 모자란다. 예전 구현이라면 조용히 HS384로 서명했을 값이다
        String tooShort = "a".repeat(63);
        assertThatThrownBy(() -> provider(tooShort))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("64")
                .hasMessageContaining("63");
    }

    @Test
    void 유효한_시크릿은_64바이트다() {
        assertThat(VALID_SECRET.getBytes(StandardCharsets.UTF_8)).hasSize(64);
        assertThat(provider(VALID_SECRET)).isNotNull();
    }

    @Test
    void 발급한_토큰의_알고리즘은_HS512다() {
        String token = provider(VALID_SECRET).createAccessToken(1L, Role.MEMBER);
        // JWT 헤더(첫 마디)는 base64url — 표준 디코더가 읽도록 URL 디코더를 쓴다
        String header = new String(
                Base64.getUrlDecoder().decode(token.split("\\.")[0]), StandardCharsets.UTF_8);
        assertThat(header).contains("\"alg\":\"HS512\"");
    }

    @Test
    void 발급한_토큰을_그대로_파싱한다() {
        JwtTokenProvider provider = provider(VALID_SECRET);
        String token = provider.createAccessToken(42L, Role.MEMBER);
        JwtTokenProvider.TokenPayload payload = provider.parse(token);
        assertThat(payload.memberId()).isEqualTo(42L);
        assertThat(payload.role()).isEqualTo(Role.MEMBER);
    }
}
