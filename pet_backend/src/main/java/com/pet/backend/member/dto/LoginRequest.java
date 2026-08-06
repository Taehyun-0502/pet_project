package com.pet.backend.member.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 로그인 요청 (docs/api-spec.md 1절).
 * 가입과 달리 형식 검증은 걸지 않는다 — 형식이 틀리면 어차피 조회 실패로
 * AUTH_INVALID_CREDENTIALS가 되므로, 빈 값만 걸러낸다.
 */
public record LoginRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        String password
) {}
