package com.pet.backend.chat.websocket;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

/**
 * 연결된 WebSocket 세션 장부 — 강퇴 시 그 회원의 연결을 서버가 끊기 위해 존재한다
 * (docs/api-spec.md 7절 "강퇴 시 강제 연결 해제").
 *
 * 두 단계로 채워진다: 연결 수립 시 세션 등록(이 시점엔 누구인지 모름) →
 * STOMP CONNECT 인증 성공 시 회원 id 결합.
 */
@Slf4j
@Component
public class ChatWebSocketSessionRegistry {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionMembers = new ConcurrentHashMap<>();

    void register(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    // CONNECT 인증 통과 후 "이 세션 = 이 회원" 결합
    void bindMember(String sessionId, Long memberId) {
        sessionMembers.put(sessionId, memberId);
    }

    void unregister(String sessionId) {
        sessions.remove(sessionId);
        sessionMembers.remove(sessionId);
    }

    Long findMemberId(String sessionId) {
        return sessionMembers.get(sessionId);
    }

    /**
     * 해당 회원의 모든 연결을 끊는다 — **강퇴**와 **탈퇴** 커밋 후 호출된다 (후자는 리뷰 백로그 110번).
     * SimpleBroker에는 서버발 "구독만 해제" 수단이 없어 연결 자체를 끊는다 — 다른 방 구독도 함께
     * 끊기지만 클라이언트 자동 재연결이 복구하고, 강퇴된 방만 SUBSCRIBE 거부로 걸러진다.
     *
     * <p>탈퇴는 재연결까지 막혀야 하는데, 그쪽은 이 메서드가 아니라 회원이 이미 삭제됐다는 사실이 막는다 —
     * 재연결의 CONNECT는 통과해도(액세스 토큰이 최대 15분 유효) SUBSCRIBE는 참여 행이 정리돼 거부된다.
     *
     * 전체 세션 순회지만 강퇴·탈퇴 모두 드문 동작이고 단일 인스턴스라 역방향 색인은 두지 않았다.
     */
    void disconnectMember(Long memberId) {
        sessionMembers.forEach((sessionId, ownerId) -> {
            if (!ownerId.equals(memberId)) {
                return;
            }
            WebSocketSession session = sessions.get(sessionId);
            if (session == null) {
                return;
            }
            try {
                session.close(CloseStatus.NORMAL);
            } catch (IOException e) {
                // 이미 끊긴 세션 — 목적(연결 종료)은 달성된 상태라 로그만 남긴다
                log.warn("회원 세션 강제 종료 실패 sessionId={}, memberId={}", sessionId, memberId, e);
            }
        });
    }
}
