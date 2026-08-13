package com.pet.backend.common;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 특정 도메인에 속하지 않는 에러 코드 — 요청 자체가 잘못됐거나(검증·라우팅), 어느 도메인에서나
 * 같은 뜻으로 쓰이는 것들. 도메인 실패는 각 도메인 enum에 둔다.
 */
@Getter
@RequiredArgsConstructor
public enum CommonErrorCode implements ErrorCode {

    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "요청 값이 올바르지 않습니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다."),

    // ───── 라우팅·프로토콜 오류 ─────
    // 특정 도메인이 아니라 요청 자체가 잘못된 경우. Service가 던지는 코드가 아니라
    // GlobalExceptionHandler가 Spring MVC 예외를 옮겨 담는 자리다 (리뷰 백로그 3·79번)
    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "요청한 경로를 찾을 수 없습니다."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식입니다."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 Content-Type입니다."),

    CONCURRENT_UPDATE(HttpStatus.CONFLICT, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리되었습니다. 새로고침 후 다시 시도해 주세요."),

    // 프로필 사진 업로드 — 회원·반려동물이 같은 ImageStorageClient를 쓰므로 공통에 둔다
    IMAGE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "서버 오류가 발생했습니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
