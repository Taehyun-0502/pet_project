package com.pet.backend.pet;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * 반려동물 등록 요청 (docs/api-spec.md 2절).
 * memberId는 필드 자체가 없다 — 보호자는 토큰에서 확정되므로 요청으로 받으면 안 된다.
 */
public record PetCreateRequest(

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        @Size(max = 50, message = "품종은 50자 이하여야 합니다.")
        String breed,

        @PastOrPresent(message = "생년월일은 미래 날짜일 수 없습니다.")
        LocalDate birthDate
) {}
