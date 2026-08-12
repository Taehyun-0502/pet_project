package com.pet.backend.chat.dto;

import jakarta.validation.constraints.NotNull;

// 공지 고정 요청 (docs/api-spec.md 7절 3차) — 고정할 메시지는 그 방의 것이어야 한다 (검증은 Service)
public record ChatPinRequest(

        @NotNull(message = "messageId는 필수입니다.")
        Long messageId
) {}
