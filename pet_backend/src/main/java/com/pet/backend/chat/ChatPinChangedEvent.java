package com.pet.backend.chat;

/**
 * 공지 핀이 바뀜 (고정·교체·해제 — docs/api-spec.md 7절 3차).
 * 커밋 후 방 구독자에게 "다시 읽어라" 신호만 보낸다 — 내용은 싣지 않고
 * 받은 쪽이 GET /pin으로 다시 읽는다 (ChatMembersChangedEvent와 같은 패턴).
 */
public record ChatPinChangedEvent(Long roomId) {}
