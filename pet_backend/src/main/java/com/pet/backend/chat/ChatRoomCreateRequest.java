package com.pet.backend.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 방 생성 요청 (docs/api-spec.md 7절). 생성자는 토큰에서 확정 — 필드로 받지 않는다
public record ChatRoomCreateRequest(

        @NotBlank(message = "방 이름은 필수입니다.")
        @Size(max = 100, message = "방 이름은 100자 이하여야 합니다.")
        String name
) {}
