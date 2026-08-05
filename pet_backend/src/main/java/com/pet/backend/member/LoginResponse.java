package com.pet.backend.member;

// 로그인 응답 (docs/api-spec.md 1절). 2차에서 리프레시 토큰이 생겨도 이 바디는 그대로 유지된다
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
