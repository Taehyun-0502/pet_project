package com.pet.backend.common;

import lombok.Getter;

/**
 * 도메인 예외의 단일 베이스 (docs/conventions.md 3절).
 * 예외 클래스를 도메인마다 늘리지 않고 ErrorCode 추가로 대응한다.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getDefaultMessage());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String overrideMessage) {
        super(overrideMessage);
        this.errorCode = errorCode;
    }
}
