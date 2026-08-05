package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatMessage;
import java.time.Instant;

// 메시지 응답 (docs/api-spec.md 7절). senderName은 pet_member에서 조회해 채운다
public record ChatMessageResponse(
        Long id,
        Long senderId,
        String senderName,
        String content,
        Instant createdAt
) {

    public static ChatMessageResponse of(ChatMessage message, String senderName) {
        return new ChatMessageResponse(message.getId(), message.getSenderId(), senderName,
                message.getContent(), message.getCreatedAt());
    }
}
