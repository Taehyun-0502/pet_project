package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatCategory;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 방 생성·수정 요청 (docs/api-spec.md 7절 3차). 생성자·방장은 토큰에서 확정 — 필드로 받지 않는다.
 *
 * 생성과 수정(PUT)이 **같은 record를 공유한다** (PetSaveRequest 선례) — 명세상 바디가 동일한데
 * 따로 두면 검증 규칙이 두 곳에 복사되어 조용히 갈라진다. 수정은 전체 교체라
 * 생략된 선택 항목(description·maxMembers)이 null이 되어 값을 지우는 수단이기도 하다.
 */
public record ChatRoomSaveRequest(

        @NotBlank(message = "방 이름은 필수입니다.")
        @Size(max = 100, message = "방 이름은 100자 이하여야 합니다.")
        String name,

        // 잘못된 enum 값은 요청 본문 파싱 단계에서 400 (GlobalExceptionHandler — 3차 리뷰에서 확인된 경로)
        @NotNull(message = "카테고리는 필수입니다.")
        ChatCategory category,

        @Size(max = 200, message = "소개는 200자 이하여야 합니다.")
        String description,

        @Min(value = 2, message = "정원은 2명 이상이어야 합니다.")
        @Max(value = 100, message = "정원은 100명 이하여야 합니다.")
        Integer maxMembers
) {}
