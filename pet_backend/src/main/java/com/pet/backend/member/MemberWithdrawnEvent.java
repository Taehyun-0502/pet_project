package com.pet.backend.member;

/**
 * 회원이 탈퇴했다 — 커밋 후 그 회원의 WebSocket 연결을 끊는 트리거 (리뷰 백로그 110번).
 *
 * <p>REST 경로는 탈퇴 즉시 `requireActiveMember`가 막지만, <b>이미 맺어진 WS 구독에는 상한이 없다</b>.
 * 참여자 검증은 SUBSCRIBE 시점에만 돌기 때문에, 탈퇴가 참여 행을 정리해도 기존 구독은 그대로 수신한다.
 * 액세스 토큰 15분 같은 자연 만료도 없어 연결이 유지되는 한 계속 열려 있다.
 *
 * <p>강퇴가 같은 문제를 {@code ChatMemberKickedEvent}로 푸는데, 그쪽은 "이 방에서만" 끊으면 되고
 * 이쪽은 <b>그 회원의 연결 자체</b>를 끊는다는 점만 다르다 — 수신부는 같은 경로를 재사용한다.
 *
 * <p>이벤트를 member 패키지에 두는 이유: 발행자의 도메인에 이벤트를 두고 전달 수단(websocket)이
 * 그것을 구독한다는 규약(CLAUDE.md 백엔드 규약)에 따른다. MemberService는 WebSocket을 모른다.
 */
public record MemberWithdrawnEvent(Long memberId) {}
