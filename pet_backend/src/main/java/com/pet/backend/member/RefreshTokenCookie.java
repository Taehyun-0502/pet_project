package com.pet.backend.member;

import org.springframework.http.ResponseCookie;

/**
 * 리프레시 토큰 쿠키 조립 (docs/api-spec.md 1절의 Set-Cookie 규격).
 * 로그인·재발급·로그아웃이 같은 속성을 써야 브라우저가 같은 쿠키로 인식하므로 한곳에 모은다
 * — 속성이 하나라도 어긋나면 삭제가 안 되거나 쿠키가 둘로 늘어난다.
 */
final class RefreshTokenCookie {

    static final String NAME = "refreshToken";

    // 회원 경로에만 실려 나간다. /api/members/me 등에도 함께 전송되지만 서버가 무시하므로 실해는 없다
    private static final String PATH = "/api/members";

    private RefreshTokenCookie() {
    }

    static ResponseCookie create(String rawToken) {
        return base(rawToken).maxAge(RefreshTokenService.TOKEN_TTL).build();
    }

    // 로그아웃용 — 같은 속성 + Max-Age=0으로 브라우저에서 지운다
    static ResponseCookie expire() {
        return base("").maxAge(0).build();
    }

    private static ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                // JS에서 못 읽는다 — XSS로 리프레시 토큰이 새는 면적을 없앤다
                .httpOnly(true)
                // localhost는 브라우저가 보안 컨텍스트로 취급해 http에서도 전송된다
                .secure(true)
                // 프론트를 다른 도메인에 배포하면 "None"으로 바꿔야 한다 (api-spec.md 6절)
                .sameSite("Strict")
                .path(PATH);
    }
}
