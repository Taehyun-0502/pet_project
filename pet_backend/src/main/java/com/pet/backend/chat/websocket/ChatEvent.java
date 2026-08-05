package com.pet.backend.chat.websocket;

import com.pet.backend.chat.dto.ChatMessageResponse;

/**
 * 브로드캐스트 페이로드 봉투 (docs/api-spec.md 7절) — {"type": "...", "data": {...}}.
 * 지금은 MESSAGE 하나지만, 참여자 변동 같은 이벤트가 늘어도 클라이언트 계약이 깨지지 않게 감싼다.
 */
public record ChatEvent<T>(String type, T data) {

    public static ChatEvent<ChatMessageResponse> message(ChatMessageResponse message) {
        return new ChatEvent<>("MESSAGE", message);
    }
}
