package com.pet.backend.member.dto;

import com.pet.backend.common.MaxBytes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 비밀번호 변경 요청 (docs/api-spec.md 1절).
 * currentPassword는 로그인과 같은 정책으로 길이를 검증하지 않는다 — 대조에 실패하면 어차피 401이다.
 */
public record PasswordChangeRequest(

        @NotBlank(message = "현재 비밀번호는 필수입니다.")
        String currentPassword,

        // 가입(SignupRequest.password)과 같은 규칙. encode()를 새로 호출하는 자리이므로
        // @MaxBytes(72)가 없으면 리뷰 1번(한글 25자 → 500)이 이 경로로 재발한다
        @NotBlank(message = "새 비밀번호는 필수입니다.")
        @Size(min = 8, max = 60, message = "비밀번호는 8자 이상 60자 이하여야 합니다.")
        @MaxBytes(value = 72, message = "비밀번호가 너무 깁니다. (UTF-8 기준 72바이트 이하, 한글은 24자까지)")
        String newPassword
) {}
