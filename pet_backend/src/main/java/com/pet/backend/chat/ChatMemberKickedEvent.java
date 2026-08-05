package com.pet.backend.chat;

// 회원 강퇴됨 — 커밋 후 그 회원의 WebSocket 연결을 끊는 트리거 (chat.websocket.ChatBroadcaster)
public record ChatMemberKickedEvent(Long roomId, Long memberId) {}
