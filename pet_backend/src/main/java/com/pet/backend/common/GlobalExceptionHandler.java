package com.pet.backend.common;

import jakarta.validation.ConstraintViolationException;
import java.util.Arrays;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.convert.ConversionFailedException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

// 모든 예외를 ApiResponse 실패 포맷으로 변환한다 (docs/conventions.md 3절)
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        ErrorCode code = e.getErrorCode();
        return ResponseEntity.status(code.getStatus())
                .body(ApiResponse.fail(code.name(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(), message));
    }

    // @RequestParam/@RequestBody 없이 쿼리 파라미터 자체에 붙인 Bean Validation 제약 위반
    // (예: GET /api/places?lat=200) — Spring MVC의 핸들러 메서드 검증(6.1+)이 던진다.
    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiResponse<Void>> handleHandlerMethodValidation(HandlerMethodValidationException e) {
        String message = e.getAllErrors().stream()
                .map(error -> error.getDefaultMessage())
                .filter(msg -> msg != null && !msg.isBlank())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(),
                        message.isBlank() ? ErrorCode.VALIDATION_ERROR.getDefaultMessage() : message));
    }

    // @Validated(클래스 레벨) AOP 경로로 검증할 때 던져지는 예외 — 위 핸들러와 함께 방어적으로 둔다.
    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(), message));
    }

    // 필수 쿼리 파라미터 자체가 없는 경우 (예: GET /api/places에 lat 누락)
    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ApiResponse<Void>> handleMissingParameter(MissingServletRequestParameterException e) {
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(),
                        e.getParameterName() + "는 필수입니다."));
    }

    // 쿼리 파라미터 타입 불일치 (예: GET /api/places?lat=abc, categories=FOO — enum 변환 실패 포함)
    // QA M-1: 핸들러 부재로 500 낙하하던 것을 400/VALIDATION_ERROR로 수정.
    // QA N-7: 대상 타입이 enum이면 내부 클래스명(예: "PlaceCategory") 대신 허용값 목록을 안내한다 —
    // 사용자가 "PlaceCategory"라는 서버 내부 타입명을 보고 뭘 넣어야 하는지 알 수 없었던 문제.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        // categories=FOO처럼 컬렉션(List<PlaceCategory>) 파라미터의 원소 변환이 실패하면
        // getRequiredType()은 컬렉션 자체(List)를 반환하고 실제 대상 enum 타입은 원인 체인의
        // ConversionFailedException 안에 있다 — 그래서 원인 체인까지 함께 살핀다.
        Class<?> enumType = enumTargetType(e);
        String message;
        if (enumType != null) {
            String allowedValues = Arrays.stream(enumType.getEnumConstants())
                    .map(Object::toString)
                    .collect(Collectors.joining(", "));
            message = e.getName() + "는 " + allowedValues + " 중 하나여야 합니다.";
        } else {
            message = e.getName() + "의 형식이 올바르지 않습니다.";
        }
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(), message));
    }

    // 요청 자체(e.getRequiredType())와 원인 체인(ConversionFailedException) 양쪽에서
    // enum 타입을 찾는다 — 단일 파라미터(lat 등)는 전자, 컬렉션 원소(categories 등)는 후자로 드러난다.
    private Class<?> enumTargetType(MethodArgumentTypeMismatchException e) {
        Class<?> requiredType = e.getRequiredType();
        if (requiredType != null && requiredType.isEnum()) {
            return requiredType;
        }
        for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ConversionFailedException cfe && cfe.getTargetType().getType().isEnum()) {
                return cfe.getTargetType().getType();
            }
        }
        return null;
    }

    // 깨진 JSON, 타입 불일치 등 본문 자체를 읽지 못한 경우 — 클라이언트 잘못이므로 400
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<ApiResponse<Void>> handleUnreadable(Exception e) {
        return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_ERROR.name(), "요청 본문을 읽을 수 없습니다."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiResponse<Void>> handleUnknown(Exception e) {
        // 상세는 로그로만 남기고 응답에는 노출하지 않는다
        log.error("처리되지 않은 예외", e);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR.name(),
                        ErrorCode.INTERNAL_ERROR.getDefaultMessage()));
    }
}
