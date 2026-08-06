package com.pet.backend.common;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 에러 코드. docs/api-spec.md 5절의 에러 코드 표와 1:1 — HTTP 상태 매핑의 단일 출처.
 * Controller/Service에서 상태 코드를 직접 다루지 않는다.
 */
@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    AUTH_INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    AUTH_TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),
    AUTH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "토큰이 만료되었습니다."),
    AUTH_INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 리프레시 토큰입니다."),
    AUTH_REFRESH_EXPIRED(HttpStatus.UNAUTHORIZED, "리프레시 토큰이 만료되었습니다. 다시 로그인해 주세요."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),
    PET_NOT_FOUND(HttpStatus.NOT_FOUND, "반려동물을 찾을 수 없습니다."),
    DEVICE_NOT_FOUND(HttpStatus.NOT_FOUND, "디바이스를 찾을 수 없습니다."),
    AUTH_EMAIL_DUPLICATED(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    DEVICE_SERIAL_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 시리얼 번호입니다."),
    DEVICE_ALREADY_MAPPED(HttpStatus.CONFLICT, "해당 반려동물에 이미 디바이스가 매핑되어 있습니다."),
    // 카카오 로컬 API 등 외부 연동 실패 — 원본 예외 메시지(응답 본문 일부 등)를 그대로
    // 클라이언트/모델에 노출하지 않기 위해 도메인 서비스가 이 코드로 감싸 던진다.
    PLACE_SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String defaultMessage;
}
