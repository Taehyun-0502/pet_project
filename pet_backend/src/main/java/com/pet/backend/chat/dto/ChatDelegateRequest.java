package com.pet.backend.chat.dto;

import jakarta.validation.constraints.NotNull;

// 방장 위임 요청 (docs/api-spec.md 7절). 대상은 그 방에 참여 중인 회원이어야 한다
public record ChatDelegateRequest(

        @NotNull(message = "memberId는 필수입니다.")
        Long memberId
) {}
