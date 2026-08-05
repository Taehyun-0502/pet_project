package com.pet.backend.chat;

import jakarta.validation.constraints.NotNull;

// MANAGER 지명·해제 요청 (docs/api-spec.md 7절). OWNER 값은 Service에서 거부 — 위임은 /delegate가 담당
public record ChatRoleChangeRequest(

        @NotNull(message = "role은 필수입니다.")
        ChatRole role
) {}
