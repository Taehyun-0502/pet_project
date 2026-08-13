package com.pet.backend.shorts;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/** 숏츠(릴스) 실패 코드. 코드 문자열의 {@code SHORTS_} 접두어는 프론트와의 기존 계약이라 그대로 유지한다. */
@Getter
@RequiredArgsConstructor
public enum ShortsErrorCode implements ErrorCode {

    NOT_FOUND(HttpStatus.NOT_FOUND, "SHORTS_NOT_FOUND", "숏츠를 찾을 수 없습니다."),
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SHORTS_COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다."),
    UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "SHORTS_UPLOAD_FAILED", "영상 업로드에 실패했습니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
