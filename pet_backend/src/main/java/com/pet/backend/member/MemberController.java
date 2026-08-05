package com.pet.backend.member;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    @PostMapping("/api/members/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<MemberResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponse.ok(memberService.signup(request));
    }

    @PostMapping("/api/members/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(memberService.login(request));
    }

    // 내 정보 조회 (인증 필요). memberId는 JwtAuthenticationFilter가 토큰에서 꺼내 실어준 값
    @GetMapping("/api/members/me")
    public ApiResponse<MemberResponse> getMyInfo(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(memberService.getMyInfo(memberId));
    }
}
