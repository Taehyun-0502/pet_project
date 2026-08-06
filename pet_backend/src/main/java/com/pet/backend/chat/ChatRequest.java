package com.pet.backend.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ChatRequest(

        @NotBlank(message = "메시지는 필수입니다.")
        String message,

        @NotNull(message = "petId는 필수입니다.")
        Long petId
) {}
