package com.pet.backend.chat.websocket;

import com.pet.backend.common.CommonErrorCode;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

/**
 * STOMP ERROR 프레임의 message 정제 (리뷰 백로그 24번).
 *
 * 인터셉터의 의도된 거부(reject)는 ErrorCode 문자열(예: CHAT_KICKED)을 message로 실어 보내고
 * 클라이언트(chatSocket.js)가 그 코드로 안내문을 고른다 — 이건 그대로 통과시킨다.
 *
 * 문제는 그 외 런타임 예외다. 기본 핸들러는 {@code ex.getMessage()} **원문**을 ERROR 프레임에
 * 싣는데, SUBSCRIBE 검증 중 DB 예외라면 접속 정보 등 내부 상세가 그대로 클라이언트로 나간다 —
 * HTTP 쪽 handleUnknown("상세는 로그로만")과 비대칭인 정보 노출 경로였다.
 * 여기서는 코드 형식이 아닌 메시지를 전부 INTERNAL_ERROR로 치환하고 원문은 서버 로그로만 남긴다.
 */
@Slf4j
public class ChatStompErrorHandler extends StompSubProtocolErrorHandler {

    // ErrorCode의 code 문자열 형식 (대문자·숫자·언더스코어 — conventions.md 3절의 전역 유일 코드 규약)
    private static final Pattern ERROR_CODE = Pattern.compile("^[A-Z][A-Z0-9_]*$");

    @Override
    public Message<byte[]> handleClientMessageProcessingError(Message<byte[]> clientMessage, Throwable ex) {
        String code = resolveCode(ex);
        if (code == null) {
            log.error("STOMP 처리 중 예상 밖 예외 — 클라이언트에는 INTERNAL_ERROR만 보낸다", ex);
            code = CommonErrorCode.INTERNAL_ERROR.getCode();
        }
        // 부모 구현이 이 예외의 getMessage()를 ERROR 프레임의 message 헤더에 싣는다
        return super.handleClientMessageProcessingError(clientMessage, new MessageDeliveryException(code));
    }

    // 예외 자신 → 원인 순으로 ErrorCode 형식의 메시지를 찾는다 — 인터셉터의 reject가
    // 채널 계층에서 한 번 감싸여 도착하는 경우까지 커버한다. 못 찾으면 null(내부 예외)
    private String resolveCode(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String message = t.getMessage();
            if (message != null && ERROR_CODE.matcher(message).matches()) {
                return message;
            }
        }
        return null;
    }
}
