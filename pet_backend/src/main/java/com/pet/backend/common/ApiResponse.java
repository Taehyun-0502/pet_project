package com.pet.backend.common;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 공통 응답 포맷 (docs/conventions.md 2절).
 * 성공 시 error 생략, 실패 시 data 생략 — NON_NULL로 직렬화에서 제외된다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(boolean success, T data, ErrorBody error) {

    public record ErrorBody(String code, String message) {}

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null);
    }

    // data 없는 성공 (삭제 등)
    public static ApiResponse<Void> ok() {
        return new ApiResponse<>(true, null, null);
    }

    public static ApiResponse<Void> fail(String code, String message) {
        return new ApiResponse<>(false, null, new ErrorBody(code, message));
    }
}
