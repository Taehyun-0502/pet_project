package com.pet.backend.place;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 장소 검색 실패 코드.
 *
 * <p>카카오 로컬 API 등 외부 연동 실패 — 원본 예외 메시지(응답 본문 일부 등)를 그대로
 * 클라이언트/모델에 노출하지 않기 위해 도메인 서비스가 이 코드로 감싸 던진다.
 */
@Getter
@RequiredArgsConstructor
public enum PlaceErrorCode implements ErrorCode {

    SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "PLACE_SEARCH_FAILED", "장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
