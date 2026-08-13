package com.pet.backend.chat.websocket;

import com.pet.backend.chat.ChatMemberKickedEvent;
import com.pet.backend.chat.ChatMembersChangedEvent;
import com.pet.backend.chat.ChatMessageCreatedEvent;
import com.pet.backend.chat.ChatPinChangedEvent;
import com.pet.backend.member.MemberWithdrawnEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 도메인 이벤트를 WebSocket 동작으로 옮기는 자리. Service는 메시징 인프라를 모른 채 이벤트만 던진다
 * (그래서 이벤트 클래스는 chat 패키지에 두고, 의존 방향은 websocket → chat 한쪽으로만 흐른다).
 *
 * 전부 **커밋 이후**에 실행한다:
 * - 메시지: 커밋 전에 push하면 롤백된 메시지를 보내거나, 아직 커밋되지 않은 작은 id를 건너뛴 채
 *   클라이언트가 afterId를 전진시킬 수 있다 (docs/troubleshooting.md 3번이 예고한 해소 지점)
 * - 강퇴: 롤백된 강퇴로 멀쩡한 사용자의 연결을 끊지 않기 위해
 */
@Component
@RequiredArgsConstructor
public class ChatBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatWebSocketSessionRegistry sessionRegistry;

    static String roomTopic(Long roomId) {
        return "/topic/chat/rooms/" + roomId;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageCreated(ChatMessageCreatedEvent event) {
        messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.message(event.message()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMemberKicked(ChatMemberKickedEvent event) {
        sessionRegistry.disconnectMember(event.memberId());
    }

    /**
     * 탈퇴 회원의 연결 끊기 (리뷰 백로그 110번) — 강퇴와 같은 경로를 재사용한다.
     *
     * <p>탈퇴가 참여 행을 정리해도 <b>이미 맺어진 구독은 계속 수신한다</b>(참여자 검증은 SUBSCRIBE 시점에만).
     * REST는 `ChatService.requireActiveMember`가 막지만 WS에는 그런 상한이 없어 여기서 끊는다.
     *
     * <p>이 클래스가 member 도메인의 이벤트를 받는 유일한 자리다 — 의존 방향은 여전히
     * 전달 수단(websocket) → 도메인 한쪽이고, MemberService는 WebSocket을 모른다.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMemberWithdrawn(MemberWithdrawnEvent event) {
        sessionRegistry.disconnectMember(event.memberId());
    }

    /**
     * 참여자 구성 변경 신호.
     * fallbackExecution = true 인 이유: 입장(join)은 의도적으로 트랜잭션 없이 동작하는데
     * (ChatService.join 주석 참조) 기본 설정이면 트랜잭션이 없는 호출에서 리스너가 조용히 건너뛰어진다.
     * 이 옵션을 켜면 트랜잭션이 있으면 커밋 후, 없으면 즉시 실행된다.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onMembersChanged(ChatMembersChangedEvent event) {
        messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.membersChanged());
    }

    // 공지 핀 변경 신호 (3차). 핀 API는 전부 @Transactional이라 fallbackExecution이 필요 없다
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPinChanged(ChatPinChangedEvent event) {
        messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.pinChanged());
    }
}
