package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatMessage;
import java.time.Instant;

// 메시지 응답 (docs/api-spec.md 7절). senderName·senderProfileImageUrl은 pet_member에서 조회해 채운다
public record ChatMessageResponse(
        Long id,
        Long senderId,
        String senderName,
        String senderProfileImageUrl,  // 사진 없으면 null — 프론트가 placeholder 표시
        // 이미지 메시지에서는 null (F10b) — 둘 중 정확히 하나만 값이 있다
        String content,
        // 이미지 메시지의 공개 URL. 텍스트 메시지에서는 null
        String imageUrl,
        Instant createdAt
) {

    public static ChatMessageResponse of(ChatMessage message, String senderName,
                                         String senderProfileImageUrl) {
        return new ChatMessageResponse(message.getId(), message.getSenderId(), senderName,
                senderProfileImageUrl, message.getContent(), message.getImageUrl(),
                message.getCreatedAt());
    }
}
