package com.pet.backend.member.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 이름 수정 요청 (docs/api-spec.md 1절). 수정 가능한 필드는 name뿐 —
 * email은 로그인 ID라 불변이고 role은 요청으로 받지 않는다 (가입과 동일 원칙).
 */
public record NameUpdateRequest(

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {

    // 검증 전에 앞뒤 공백 제거 — 가입과 같은 규칙이다 (근거는 SignupRequest의 같은 자리, 백로그 96번)
    public NameUpdateRequest {
        name = name == null ? null : name.trim();
    }
}
