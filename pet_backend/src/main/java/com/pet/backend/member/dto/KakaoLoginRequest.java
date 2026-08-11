package com.pet.backend.member.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 카카오 로그인 요청 (docs/api-spec.md 1절 4차).
 * redirectUri는 인가 요청에 썼던 값 그대로 — 카카오 토큰 교환의 필수 파라미터라 중계한다
 * (등록된 URI인지는 카카오가 검증한다).
 */
public record KakaoLoginRequest(

        @NotBlank(message = "인가 코드는 필수입니다.")
        String code,

        @NotBlank(message = "redirectUri는 필수입니다.")
        String redirectUri
) {}
