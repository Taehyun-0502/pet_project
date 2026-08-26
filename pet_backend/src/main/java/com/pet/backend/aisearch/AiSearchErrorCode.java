package com.pet.backend.aisearch;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * AI 검색(챗봇) 실패 코드.
 *
 * <p>Anthropic API 키 미설정 상태를 place의 {@code KakaoClient} 패턴과 동일하게 다룬다 —
 * 키 없이 Claude API를 호출하면 SDK가 401을 던지고, 이를 그대로 두면 GlobalExceptionHandler의
 * 마지막 핸들러(handleUnknown)로 떨어져 원인을 알 수 없는 일반 500이 된다. 대신 호출 시점에
 * 키 설정 여부를 먼저 확인해 이 코드로 즉시 실패시킨다(QA L-9).
 */
@Getter
@RequiredArgsConstructor
public enum AiSearchErrorCode implements ErrorCode {

    API_KEY_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "AI_SEARCH_API_KEY_NOT_CONFIGURED",
            "AI 검색 기능을 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
