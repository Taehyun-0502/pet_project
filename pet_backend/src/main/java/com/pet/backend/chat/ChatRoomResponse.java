package com.pet.backend.chat;

import java.time.Instant;

// 방 응답 (docs/api-spec.md 7절). participantCount = 참여 중(left_at IS NULL) 인원
public record ChatRoomResponse(
        Long id,
        String name,
        long participantCount,
        Instant createdAt
) {

    public static ChatRoomResponse of(ChatRoom room, long participantCount) {
        return new ChatRoomResponse(room.getId(), room.getName(), participantCount, room.getCreatedAt());
    }
}
