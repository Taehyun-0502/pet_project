package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatRoom;
import java.time.Instant;

// 방 응답 (docs/api-spec.md 7절). participantCount = 참여 중(left_at IS NULL) 인원.
// unreadCount는 안 읽은 메시지 수 — null이면 내가 참여하지 않은 방(배지 없음)
public record ChatRoomResponse(
        Long id,
        String name,
        long participantCount,
        Long unreadCount,
        Instant createdAt
) {

    public static ChatRoomResponse of(ChatRoom room, long participantCount, Long unreadCount) {
        return new ChatRoomResponse(room.getId(), room.getName(), participantCount,
                unreadCount, room.getCreatedAt());
    }
}
