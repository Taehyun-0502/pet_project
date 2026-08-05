package com.pet.backend.chat;

import com.pet.backend.chat.dto.ChatMessageResponse;

// 메시지 저장됨 — 커밋 후 방 구독자에게 브로드캐스트하는 트리거 (chat.websocket.ChatBroadcaster)
public record ChatMessageCreatedEvent(Long roomId, ChatMessageResponse message) {}
