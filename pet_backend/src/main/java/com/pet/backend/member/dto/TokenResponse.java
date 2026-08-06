package com.pet.backend.member.dto;

/**
 * 재발급 응답 (docs/api-spec.md 1절). 로그인과 달리 회원 정보는 싣지 않는다 —
 * 이미 로그인한 클라이언트가 토큰만 갱신하는 요청이라 회원 정보를 다시 내려줄 이유가 없다.
 */
public record TokenResponse(String accessToken, String tokenType, long expiresIn) {

    public static TokenResponse of(String accessToken, long expiresIn) {
        return new TokenResponse(accessToken, "Bearer", expiresIn);
    }
}
