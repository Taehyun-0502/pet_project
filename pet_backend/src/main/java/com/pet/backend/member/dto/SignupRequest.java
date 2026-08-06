package com.pet.backend.member.dto;

import com.pet.backend.common.MaxBytes;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 회원가입 요청 (docs/api-spec.md 1절).
 * role·provider는 받지 않는다 — 서버가 MEMBER/LOCAL로 고정.
 */
public record SignupRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.")
        String email,

        // BCrypt는 입력을 72바이트까지만 받는다. @Size는 글자 수 기준이라
        // 한글(글자당 3바이트) 25자면 통과한 뒤 encode()에서 터진다 — 바이트 상한을 따로 건다
        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, max = 60, message = "비밀번호는 8자 이상 60자 이하여야 합니다.")
        @MaxBytes(value = 72, message = "비밀번호가 너무 깁니다. (UTF-8 기준 72바이트 이하, 한글은 24자까지)")
        String password,

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {}
