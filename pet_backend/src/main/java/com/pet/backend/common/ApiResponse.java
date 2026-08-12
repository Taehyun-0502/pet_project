package com.pet.backend.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * 공통 응답 포맷 (docs/conventions.md 2절).
 * 성공 시 error 생략, 실패 시 data 생략 — NON_NULL로 직렬화에서 제외된다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(boolean success, T data, ErrorBody error) {

    /**
     * @param details 필드별 검증 사유({@code {"password": "..."}}) — 검증 실패에만 실린다.
     *                프론트가 해당 입력 아래에 그대로 붙이기 위한 것이다 (리뷰 백로그 51번).
     *                예전에는 {@code message}에 {@code "password: 사유"}처럼 **영문 필드명이 섞인 문자열**만 있어
     *                화면이 그걸 폼 하단에 통째로 찍었고, 클라이언트 검증 오류와 표시 위치·형식이 갈렸다.
     *                {@code message}는 그대로 유지한다 — 필드 대응이 없는 화면·도구의 폴백이다.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ErrorBody(String code, String message, Map<String, String> details) {}

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null);
    }

    // data 없는 성공 (삭제 등)
    public static ApiResponse<Void> ok() {
        return new ApiResponse<>(true, null, null);
    }

    public static ApiResponse<Void> fail(String code, String message) {
        return new ApiResponse<>(false, null, new ErrorBody(code, message, null));
    }

    // 필드별 사유를 함께 내려주는 검증 실패 (GlobalExceptionHandler 전용)
    public static ApiResponse<Void> fail(String code, String message, Map<String, String> details) {
        return new ApiResponse<>(false, null, new ErrorBody(code, message, details));
    }
}
