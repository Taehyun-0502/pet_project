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

    // 참여자 구성이 바뀌었다는 신호만 — 받은 쪽이 GET /members로 다시 읽는다.
    // 변경 내용을 실어 보내면 이벤트 유실·순서 역전 때 목록이 서버와 어긋난 채 남는다
    public static ChatEvent<Void> membersChanged() {
        return new ChatEvent<>("MEMBERS_CHANGED", null);
    }

    // 공지 핀이 바뀌었다는 신호만 — 받은 쪽이 GET /pin으로 다시 읽는다 (같은 이유의 신호+재조회, 3차)
    public static ChatEvent<Void> pinChanged() {
        return new ChatEvent<>("PIN_CHANGED", null);
    }
}
