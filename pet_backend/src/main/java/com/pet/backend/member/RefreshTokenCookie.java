package com.pet.backend.member;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * 리프레시 토큰 쿠키 조립 (docs/api-spec.md 1절의 Set-Cookie 규격).
 * 로그인·재발급·로그아웃이 같은 속성을 써야 브라우저가 같은 쿠키로 인식하므로 한곳에 모은다
 * — 속성이 하나라도 어긋나면 삭제가 안 되거나 쿠키가 둘로 늘어난다.
 */
@Component
class RefreshTokenCookie {

    static final String NAME = "refreshToken";

    // 회원 경로에만 실려 나간다. /api/members/me 등에도 함께 전송되지만 서버가 무시하므로 실해는 없다
    private static final String PATH = "/api/members";

    private final boolean secure;

    /**
     * `Secure`를 설정으로 뺀 이유 (리뷰 백로그 33번).
     *
     * `Secure` 쿠키는 보안 컨텍스트에서만 저장되는데, 브라우저가 예외로 인정하는 것은
     * `localhost`/`127.0.0.1`뿐이고 **사설 IP는 포함되지 않는다.** 그래서 LAN 주소(`http://192.168.x.x`)로
     * 접속하면 로그인 응답의 Set-Cookie가 통째로 폐기되고, 그 실패가 조용하다 —
     * 로그인은 액세스 토큰이 바디로 와서 성공하고 **15분 뒤부터** 재발급이 실패하며 로그아웃된다.
     *
     * 기본값은 `true`다. LAN 시연·휴대폰 테스트처럼 평문 HTTP로 접속해야 할 때만
     * `.env`에 `COOKIE_SECURE=false`를 넣어 **의식적으로** 끈다. 배포 환경은 반드시 true.
     * (설정 묶음이 아니라 플래그 하나라 JwtProperties 같은 record를 따로 두지 않았다)
     */
    RefreshTokenCookie(@Value("${app.cookie.secure}") boolean secure) {
        this.secure = secure;
    }

    ResponseCookie create(String rawToken) {
        return base(rawToken).maxAge(RefreshTokenService.TOKEN_TTL).build();
    }

    // 로그아웃용 — 같은 속성 + Max-Age=0으로 브라우저에서 지운다
    ResponseCookie expire() {
        return base("").maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                // JS에서 못 읽는다 — XSS로 리프레시 토큰이 새는 면적을 없앤다
                .httpOnly(true)
                .secure(secure)
                // 프론트를 다른 도메인에 배포하면 "None"으로 바꿔야 한다 (api-spec.md 6절)
                .sameSite("Strict")
                .path(PATH);
    }
}
