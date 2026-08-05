package com.pet.backend.chat.websocket;

import lombok.RequiredArgsConstructor;
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

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // SockJS 폴백 없음 — 최신 브라우저의 native WebSocket만 대상
        // 오리진은 WebSocket 자체 검사라 HTTP CORS 설정(SecurityConfig)과 별개로 지정해야 한다
        registry.addEndpoint("/ws")
                .setAllowedOrigins("http://localhost:5173", "http://localhost:5174");
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
