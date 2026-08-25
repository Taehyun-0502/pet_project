package com.pet.backend.chat.websocket;

import com.pet.backend.chat.ChatErrorCode;
import com.pet.backend.chat.ChatLeftReason;
import com.pet.backend.chat.ChatRoomMemberRepository;
import com.pet.backend.chat.ChatRoomRepository;
import com.pet.backend.common.CommonErrorCode;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.MemberErrorCode;
import com.pet.backend.security.JwtTokenProvider;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import java.security.Principal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * STOMP 프레임 검문소 (docs/api-spec.md 7절).
 * - CONNECT: Authorization 헤더의 JWT를 검증하고 세션에 회원 id를 부여. 실패 시 연결 거부
 * - SUBSCRIBE: /topic/chat/rooms/{roomId} 형식 확인 + 참여자 검증. 미참여·강퇴자는 구독 거부
 *
 * 검증은 연결·구독 시점에만 한다 — 연결 유지 중 토큰이 만료돼도 끊지 않으며, 재연결 시 다시 검증한다.
 * 클라이언트→서버 메시지 전송(SEND)은 받지 않는다 (전송은 REST 유지).
 */
@Component
@RequiredArgsConstructor
public class ChatStompInterceptor implements ChannelInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final Pattern ROOM_TOPIC = Pattern.compile("^/topic/chat/rooms/(\\d+)$");

    private final JwtTokenProvider jwtTokenProvider;
    private final ChatRoomMemberRepository chatRoomMemberRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatWebSocketSessionRegistry sessionRegistry;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            // 알려진 도달 경로는 없지만, 이 분기가 보안 검문의 유일한 fail-open 지점이었다 (백로그 70번) —
            // 정체를 알 수 없는 프레임은 통과가 아니라 거부가 맞다(fail-closed)
            throw reject(message, CommonErrorCode.FORBIDDEN);
        }
        if (accessor.getCommand() == null) {
            // 하트비트 등 STOMP 명령이 아닌 프레임
            return message;
        }
        switch (accessor.getCommand()) {
            case CONNECT, STOMP -> authenticate(message, accessor);   // STOMP는 CONNECT의 1.2 표기
            case SUBSCRIBE -> authorizeSubscribe(message, accessor);
            case UNSUBSCRIBE, DISCONNECT -> { /* 정리 동작 — 허용 */ }
            // SEND 포함 나머지 전부 거부 (리뷰 백로그 21번).
            // SimpleBroker는 클라이언트 SEND를 검증 없이 구독자 전원에게 중계하므로,
            // "전송은 REST뿐"이라는 설계는 여기서 강제해야 한다 — 발행 prefix 미등록만으로는 막히지 않는다.
            // ⚠ ACK·NACK·BEGIN·COMMIT·ABORT도 여기서 끊기고, 거부는 연결 종료 → 프론트 fatal로 이어진다 —
            // 나중에 ack:'client' 구독이나 STOMP 트랜잭션을 도입하려면 이 화이트리스트 확장이 선행이다 (백로그 70번)
            default -> throw reject(message, CommonErrorCode.FORBIDDEN);
        }
        return message;
    }

    // CONNECT — 토큰을 검증해 세션의 주인을 확정한다
    private void authenticate(Message<?> message, StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            throw reject(message, MemberErrorCode.TOKEN_INVALID);
        }
        JwtTokenProvider.TokenPayload payload;
        try {
            payload = jwtTokenProvider.parse(header.substring(BEARER_PREFIX.length()));
        } catch (ExpiredJwtException e) {
            throw reject(message, MemberErrorCode.TOKEN_EXPIRED);
        } catch (JwtException | IllegalArgumentException e) {
            throw reject(message, MemberErrorCode.TOKEN_INVALID);
        }
        accessor.setUser(new ChatPrincipal(payload.memberId()));
        sessionRegistry.bindMember(accessor.getSessionId(), payload.memberId());
    }

    // SUBSCRIBE — 참여 중인 방만 구독할 수 있다 (REST의 CHAT_NOT_PARTICIPANT와 같은 규칙)
    private void authorizeSubscribe(Message<?> message, StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        Matcher matcher = destination == null ? null : ROOM_TOPIC.matcher(destination);
        if (matcher == null || !matcher.matches()) {
            // 채팅방 토픽 외에는 열어줄 대상이 없다
            throw reject(message, CommonErrorCode.FORBIDDEN);
        }
        Long memberId = memberIdOf(accessor);
        if (memberId == null) {
            throw reject(message, MemberErrorCode.TOKEN_INVALID);
        }
        Long roomId = Long.valueOf(matcher.group(1));
        // 나간·강퇴된 회원은 leftAt이 채워져 있어 함께 걸러지고, **삭제된 방**도 여기서 거른다
        // (백로그 26번 — 삭제된 방의 참여 행은 활성으로 남는 설계라 방 활성을 조인으로 확인한다).
        // 정상 구독은 이 한 쿼리로 끝난다 — 사유 판별은 거부가 확정된 뒤에만
        if (!chatRoomMemberRepository.existsActiveParticipantInActiveRoom(roomId, memberId)) {
            throw reject(message, subscribeRejectionCode(roomId, memberId));
        }
    }

    /**
     * 구독 거부 사유를 정확히 가려낸다 (리뷰 백로그 26·30번) — **실패 경로에서만** 도는 추가 조회라
     * 정상 구독의 쿼리 수는 늘지 않는다. 특히 강퇴자를 NOT_PARTICIPANT로 뭉뚱그리면 화면에
     * "이 방에 입장하기" 버튼이 떠서, 눌러 봐야 강퇴 사실을 아는 우회 UX가 됐다(30번) —
     * CHAT_KICKED로 거부하면 재연결 즉시 안내가 뜨고 입장 버튼도 나오지 않는다
     */
    private ErrorCode subscribeRejectionCode(Long roomId, Long memberId) {
        if (!chatRoomRepository.existsByIdAndDeletedAtIsNull(roomId)) {
            return ChatErrorCode.ROOM_NOT_FOUND;
        }
        if (chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftReason(
                roomId, memberId, ChatLeftReason.KICKED)) {
            return ChatErrorCode.KICKED;
        }
        return ChatErrorCode.NOT_PARTICIPANT;
    }

    private Long memberIdOf(StompHeaderAccessor accessor) {
        Principal user = accessor.getUser();
        if (user instanceof ChatPrincipal principal) {
            return principal.memberId();
        }
        // CONNECT에서 부여한 Principal이 없으면 세션 장부로 한 번 더 확인
        return sessionRegistry.findMemberId(accessor.getSessionId());
    }

    // 프레임을 거부한다 — 클라이언트는 ERROR 프레임의 message로 원인을 구분한다
    private MessageDeliveryException reject(Message<?> message, ErrorCode code) {
        return new MessageDeliveryException(message, code.getCode());
    }

    // 세션의 주인. HTTP 인증(SecurityContext의 memberId)과 같은 값을 담는다
    record ChatPrincipal(Long memberId) implements Principal {
        @Override
        public String getName() {
            return String.valueOf(memberId);
        }
    }
}
