package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatCategory;
import com.pet.backend.chat.ChatRoom;
import java.time.Instant;

// 방 응답 (docs/api-spec.md 7절). participantCount = 참여 중(left_at IS NULL) 인원.
// unreadCount는 안 읽은 메시지 수 — null이면 내가 참여하지 않은 방(배지 없음).
// maxMembers는 정원 — null이면 무제한 (3차)
public record ChatRoomResponse(
        Long id,
        String name,
        ChatCategory category,
        String description,
        long participantCount,
        Integer maxMembers,
        Long unreadCount,
        // 내가 이 방을 고정했는지 (F7). **null = "해당 없음"** — 전체 목록처럼 고정 여부를 싣지 않는
        // 응답에서는 null이다. unreadCount가 미참여 방에서 null인 것과 같은 규약이며,
        // false로 채우지 않는 이유는 "고정 안 함"과 "여기서는 알 수 없음"이 구분돼야 하기 때문이다
        Boolean pinned,
        Instant createdAt
) {

    public static ChatRoomResponse of(ChatRoom room, long participantCount, Long unreadCount) {
        return new ChatRoomResponse(room.getId(), room.getName(), room.getCategory(),
                room.getDescription(), participantCount, room.getMaxMembers(),
                unreadCount, null, room.getCreatedAt());
    }

    // 내 방 목록 전용 (F7) — 고정 여부를 함께 싣는다
    public static ChatRoomResponse ofMine(ChatRoom room, long participantCount,
                                          Long unreadCount, boolean pinned) {
        return new ChatRoomResponse(room.getId(), room.getName(), room.getCategory(),
                room.getDescription(), participantCount, room.getMaxMembers(),
                unreadCount, pinned, room.getCreatedAt());
    }
}
