package com.pet.backend.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 메시지 전송 요청 (docs/api-spec.md 7절). 발신자는 토큰에서 확정
public record ChatMessageCreateRequest(

        @NotBlank(message = "메시지 내용은 필수입니다.")
        @Size(max = 1000, message = "메시지는 1000자 이하여야 합니다.")
        String content
) {}
