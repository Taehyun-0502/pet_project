package com.pet.backend.chat;

// 방 삭제(소프트) 커밋 후 남은 구독자들에게 알리기 위한 도메인 이벤트 (리뷰 백로그 25번).
// 수신은 chat.websocket.ChatBroadcaster — 이벤트는 도메인 패키지에 두고 의존은 전달 수단 → 도메인 한쪽으로만
public record ChatRoomDeletedEvent(Long roomId) {}
