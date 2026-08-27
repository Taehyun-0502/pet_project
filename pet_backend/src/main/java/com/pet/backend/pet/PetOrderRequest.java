package com.pet.backend.pet;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 노출 순서 저장 요청 (api-spec.md 2절 PUT /api/pets/order).
 * 배열 순서가 곧 노출 순서다. 내 활성 반려동물 전체의 id가 정확히 한 번씩 와야 하며,
 * 집합 검증(누락·중복·타인 소유)은 서비스가 한다 — 여기서는 형태만 본다.
 */
public record PetOrderRequest(
        @NotEmpty(message = "petIds는 비어 있을 수 없습니다.")
        List<Long> petIds
) {
}
