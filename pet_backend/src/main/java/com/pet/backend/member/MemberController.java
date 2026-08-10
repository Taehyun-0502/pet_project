package com.pet.backend.member;

import com.pet.backend.common.ApiResponse;
import com.pet.backend.member.dto.LoginRequest;
import com.pet.backend.member.dto.LoginResponse;
import com.pet.backend.member.dto.MemberResponse;
import com.pet.backend.member.dto.PasswordChangeRequest;
import com.pet.backend.member.dto.SignupRequest;
import com.pet.backend.member.dto.TokenResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;
    private final RefreshTokenCookie refreshTokenCookie;

    @PostMapping("/api/members/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<MemberResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponse.ok(memberService.signup(request));
    }

    // 액세스 토큰은 바디, 리프레시 토큰은 HttpOnly 쿠키로 나간다 (docs/api-spec.md 1절)
    @PostMapping("/api/members/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        LoginResult result = memberService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE,
                        refreshTokenCookie.create(result.refreshToken()).toString())
                .body(ApiResponse.ok(result.response()));
    }

    /**
     * 액세스 토큰 재발급 (docs/api-spec.md 1절). Authorization 헤더가 아니라 **쿠키**로 인증하므로
     * 액세스 토큰이 이미 만료된 상태에서도 호출할 수 있어야 한다 — SecurityConfig·JwtAuthenticationFilter에서 열어둔다.
     */
    @PostMapping("/api/members/refresh")
    public ResponseEntity<ApiResponse<TokenResponse>> refresh(
            @CookieValue(name = "refreshToken", required = false) String refreshToken) {
        RefreshResult result = memberService.refresh(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE,
                        refreshTokenCookie.create(result.refreshToken()).toString())
                .body(ApiResponse.ok(result.response()));
    }

    // 로그아웃 — 쿠키가 없어도 200 (멱등). 쿠키는 같은 속성 + Max-Age=0으로 지운다
    @PostMapping("/api/members/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken) {
        memberService.logout(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.expire().toString())
                .body(ApiResponse.ok());
    }

    // 내 정보 조회 (인증 필요). memberId는 JwtAuthenticationFilter가 토큰에서 꺼내 실어준 값
    @GetMapping("/api/members/me")
    public ApiResponse<MemberResponse> getMyInfo(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(memberService.getMyInfo(memberId));
    }

    // 비밀번호 변경 — 다른 기기 토큰은 전부 폐기되고, 이 기기에는 새 리프레시 토큰이 쿠키로 내려간다
    @PatchMapping("/api/members/me/password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal Long memberId,
            @Valid @RequestBody PasswordChangeRequest request) {
        String refreshToken = memberService.changePassword(memberId, request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.create(refreshToken).toString())
                .body(ApiResponse.ok());
    }
}
