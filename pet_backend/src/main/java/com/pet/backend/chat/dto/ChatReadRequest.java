package com.pet.backend.chat.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 읽음 위치 보고 (docs/api-spec.md 7절). 화면이 마지막으로 표시한 메시지 id —
 * 서버는 현재 값보다 클 때만 갱신한다(단조 증가, 과거 값 보고는 무해한 no-op).
 */
public record ChatReadRequest(

        @NotNull(message = "lastReadMessageId는 필수입니다.")
        Long lastReadMessageId
) {}
