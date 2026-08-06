package com.pet.backend.chat;

/**
 * 방 참여자 구성이 바뀜 (입장·나가기·강퇴·지명·위임).
 * 커밋 후 방 구독자에게 "다시 읽어라" 신호만 보내는 트리거 — 변경 내용은 싣지 않는다
 * (chat.websocket.ChatBroadcaster). 목록의 정답은 항상 서버 조회 결과로 맞춘다.
 */
public record ChatMembersChangedEvent(Long roomId) {}
