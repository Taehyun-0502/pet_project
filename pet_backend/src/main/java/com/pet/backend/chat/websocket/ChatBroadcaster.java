package com.pet.backend.chat.websocket;

import com.pet.backend.chat.ChatMemberKickedEvent;
import com.pet.backend.chat.ChatMemberLeftEvent;
import com.pet.backend.chat.ChatMembersChangedEvent;
import com.pet.backend.chat.ChatMessageCreatedEvent;
import com.pet.backend.chat.ChatPinChangedEvent;
import com.pet.backend.chat.ChatRoomDeletedEvent;
import com.pet.backend.member.MemberWithdrawnEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatWebSocketSessionRegistry sessionRegistry;

    static String roomTopic(Long roomId) {
        return "/topic/chat/rooms/" + roomId;
    }

    /**
     * 리스너 본문 보호 (리뷰 백로그 28번).
     *
     * <p><b>28번의 전제는 실측으로 반증됐다 (2026-08-24).</b> "AFTER_COMMIT 리스너 예외가 요청
     * 스레드로 전파돼 500이 된다"고 적혀 있었지만, 실제로는 Spring(6.2.19)의
     * {@code TransactionSynchronizationUtils.invokeAfterCompletion}이 각 동기화 호출을 try-catch로
     * 감싸 삼키고 로그만 남긴다 — 리스너에서 일부러 예외를 던지는 프로브로 확인했다(전송 응답 201 유지).
     *
     * <p>그래도 이 래퍼를 두는 이유는 둘이다. ① <b>로그 품질</b>: 프레임워크 로그는
     * "TransactionSynchronization.afterCompletion threw exception"뿐이라 어느 도메인 동작이
     * 실패했는지 알 수 없다 — 아래 로그는 무엇이 실패했고 왜 안전한지(커밋은 이미 반영, 복구 경로 있음)를
     * 남긴다. ② <b>버전 독립성</b>: 프레임워크가 삼켜 준다는 사실에 암묵적으로 기대는 대신 계약을
     * 코드로 고정한다. 푸시·세션 정리 실패는 클라이언트의 재조회·재연결이 흡수한다(1-B에서 실측한 경로).
     */
    private void safely(String action, Runnable task) {
        try {
            task.run();
        } catch (RuntimeException e) {
            log.error("WebSocket {} 실패 — 커밋은 이미 반영됨, 클라이언트 복구 경로에 맡긴다", action, e);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMessageCreated(ChatMessageCreatedEvent event) {
        safely("메시지 푸시", () ->
                messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.message(event.message())));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMemberKicked(ChatMemberKickedEvent event) {
        safely("강퇴 세션 종료", () -> sessionRegistry.disconnectMember(event.memberId()));
    }

    /**
     * 자진 나가기의 연결 정리 (리뷰 백로그 71번) — 강퇴와 같은 경로 재사용.
     * 참여자 검증은 SUBSCRIBE 시점에만 동작해, 끊지 않으면 나간 회원이 이미 맺어진 구독으로
     * 방 메시지를 계속 받는다(앱은 화면 이탈로 스스로 닫지만 직접 만든 클라이언트는 성립).
     * 그 회원의 다른 방 탭도 함께 끊기지만 자동 재연결 + SUBSCRIBE 재검증이 복구한다 — 강퇴 선례와 동일
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onMemberLeft(ChatMemberLeftEvent event) {
        safely("나가기 세션 종료", () -> sessionRegistry.disconnectMember(event.memberId()));
    }

    /**
     * 방 삭제 신호 (리뷰 백로그 25번) — 남은 참여자들이 전송 404를 반복해서 보는 대신 즉시 안내를 받는다.
     * 세션은 서버가 끊지 않는다: SimpleBroker에는 토픽 단위 구독 해제 수단이 없고, 연결을 끊으면
     * 참여자 전원의 다른 방 탭까지 죽어 재연결이 몰린다. 삭제된 방 토픽은 이후 발행이 없고(전송이 404)
     * 재구독은 SUBSCRIBE의 방 활성 검증(26번)이 거부하므로, 신호를 받은 클라이언트가 스스로 접는 것으로 충분하다
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRoomDeleted(ChatRoomDeletedEvent event) {
        safely("방 삭제 신호", () ->
                messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.roomDeleted()));
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
        safely("탈퇴 세션 종료", () -> sessionRegistry.disconnectMember(event.memberId()));
    }

    /**
     * 참여자 구성 변경 신호.
     * fallbackExecution = true 인 이유: 입장(join)은 의도적으로 트랜잭션 없이 동작하는데
     * (ChatService.join 주석 참조) 기본 설정이면 트랜잭션이 없는 호출에서 리스너가 조용히 건너뛰어진다.
     * 이 옵션을 켜면 트랜잭션이 있으면 커밋 후, 없으면 즉시 실행된다.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onMembersChanged(ChatMembersChangedEvent event) {
        safely("참여자 변경 신호", () ->
                messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.membersChanged()));
    }

    // 공지 핀 변경 신호 (3차). 핀 API는 전부 @Transactional이라 fallbackExecution이 필요 없다
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPinChanged(ChatPinChangedEvent event) {
        safely("공지 핀 신호", () ->
                messagingTemplate.convertAndSend(roomTopic(event.roomId()), ChatEvent.pinChanged()));
    }
}
