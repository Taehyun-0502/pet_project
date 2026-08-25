package com.pet.backend.chat.websocket;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

/**
 * 채팅 실시간 수신용 STOMP 설정 (docs/api-spec.md 7절).
 * 엔드포인트 /ws, 구독 경로 /topic/chat/rooms/{roomId}.
 *
 * 발행 prefix(/app)를 등록하지 않는다 — 클라이언트→서버 전송은 REST(POST /messages)만 쓰고
 * WebSocket은 수신 전용이다. 브로커는 내장 SimpleBroker(단일 인스턴스 배포 전제).
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class ChatWebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final ChatStompInterceptor chatStompInterceptor;
    private final ChatWebSocketSessionRegistry sessionRegistry;

    // WebSocket 오리진 검사는 HTTP CORS(SecurityConfig)와 **별개**라 목록이 갈라지면
    // REST만 되고 실시간만 조용히 죽는다 — 65번에서 한 번, 2026-08-11 LAN 휴대폰에서 두 번째 실측
    // (CORS에만 LAN 오리진이 추가되고 여기가 빠져 "새로고침해야 메시지가 보이는" 증상).
    // 그래서 같은 프로퍼티를 주입받아 단일 출처로 통일했다 (application.properties 주석 참조)
    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // ERROR 프레임의 내부 정보 노출 차단 (백로그 24번) — 클래스 주석 참조
        registry.setErrorHandler(new ChatStompErrorHandler());
        // SockJS 폴백 없음 — 최신 브라우저의 native WebSocket만 대상
        registry.addEndpoint("/ws")
                .setAllowedOrigins(allowedOrigins.toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(chatStompInterceptor);
    }

    /**
     * 강퇴 시 연결을 끊으려면 WebSocketSession 자체를 들고 있어야 한다.
     * STOMP 계층에서는 세션 객체에 닿을 수 없어 전송 계층에서 장부에 등록한다.
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.addDecoratorFactory(handler -> new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                // 이 시점엔 아직 누구인지 모른다 — 회원 결합은 CONNECT 인증 후 인터셉터가 한다
                sessionRegistry.register(session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus status)
                    throws Exception {
                sessionRegistry.unregister(session.getId());
                super.afterConnectionClosed(session, status);
            }
        });
    }
}
