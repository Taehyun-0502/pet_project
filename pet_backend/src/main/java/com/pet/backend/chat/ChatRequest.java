package com.pet.backend.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ChatRequest(

        @NotBlank(message = "메시지는 필수입니다.")
        String message,

        @NotNull(message = "petId는 필수입니다.")
        Long petId,

        // 현재 위치(선택) — 프론트가 브라우저 Geolocation API로 획득해 전달한다.
        // 둘 다 존재할 때만 유효한 위치로 간주하고(하나만 오면 무시), 저장하지 않고
        // 요청 스코프에서만 시스템 프롬프트 주입에 사용한다.
        Double lat,
        Double lng
) {
    public ChatRequest(String message, Long petId) {
        this(message, petId, null, null);
    }
}
