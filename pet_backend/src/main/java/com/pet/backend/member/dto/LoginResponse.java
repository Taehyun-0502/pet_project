package com.pet.backend.member.dto;

import com.pet.backend.member.Member;

// 로그인 응답 (docs/api-spec.md 1절). 리프레시 토큰은 쿠키로 나가므로 이 바디에 없다
public record LoginResponse(
        String accessToken,
        String tokenType,      // 항상 "Bearer"
        long expiresIn,        // 액세스 토큰 만료까지 남은 초
        MemberResponse user
) {

    public static LoginResponse of(String accessToken, long expiresIn, Member member) {
        return new LoginResponse(accessToken, "Bearer", expiresIn, MemberResponse.from(member));
    }
}
