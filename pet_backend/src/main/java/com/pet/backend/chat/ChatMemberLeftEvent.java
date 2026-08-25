package com.pet.backend.chat;

// 자진 나가기 커밋 후 그 회원의 WebSocket 연결을 정리하기 위한 도메인 이벤트 (리뷰 백로그 71번).
// 강퇴(ChatMemberKickedEvent)와 같은 경로를 태워 "강퇴만 세션을 끊는" 비대칭을 없앤다
public record ChatMemberLeftEvent(Long roomId, Long memberId) {}
