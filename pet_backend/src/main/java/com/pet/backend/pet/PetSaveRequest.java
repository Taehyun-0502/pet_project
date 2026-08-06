package com.pet.backend.pet;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * 반려동물 등록·수정 요청 (docs/api-spec.md 2절).
 *
 * 등록과 수정이 **같은 record를 공유한다** — 명세상 바디가 동일한데 따로 두면 검증 규칙이
 * 두 곳에 복사되고, 한쪽만 고쳤을 때 등록과 수정의 규칙이 조용히 갈라진다.
 *
 * memberId는 필드 자체가 없다 — 보호자는 토큰에서 확정되므로 요청으로 받으면 안 된다.
 */
public record PetSaveRequest(

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        @Size(max = 50, message = "품종은 50자 이하여야 합니다.")
        String breed,

        @PastOrPresent(message = "생년월일은 미래 날짜일 수 없습니다.")
        LocalDate birthDate
) {}
