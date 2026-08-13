package com.pet.backend.common;

import jakarta.validation.ConstraintViolationException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.convert.ConversionFailedException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.validation.FieldError;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

// 모든 예외를 ApiResponse 실패 포맷으로 변환한다 (docs/conventions.md 3절)
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        ErrorCode code = e.getErrorCode();
        return ResponseEntity.status(code.getStatus())
                .body(ApiResponse.fail(code.getCode(), e.getMessage()));
    }

    /**
     * 요청 바디 검증 실패. `message`(사람이 읽는 한 줄)와 함께 **필드별 사유 맵**을 내려준다 —
     * 프론트가 각 입력 아래에 붙일 수 있게 하기 위한 것이다 (리뷰 백로그 51번).
     * 맵 키는 DTO 필드명이라 폼 필드명과 1:1로 맞춰 두면 그대로 꽂힌다.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        // 한 필드에 제약이 여러 개 걸려 함께 실패하면 먼저 온 사유만 남긴다 —
        // 입력 하나에 오류 문구를 여러 줄 붙이는 것보다 고칠 것을 하나씩 보여주는 편이 낫다
        Map<String, String> details = e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        error -> error.getDefaultMessage() == null
                                ? CommonErrorCode.VALIDATION_ERROR.getDefaultMessage()
                                : error.getDefaultMessage(),
                        (first, ignored) -> first,
                        LinkedHashMap::new));
        String message = details.entrySet().stream()
                .map(entry -> entry.getKey() + ": " + entry.getValue())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(), message, details));
    }

    // @RequestParam/@RequestBody 없이 쿼리 파라미터 자체에 붙인 Bean Validation 제약 위반
    // (예: GET /api/places?lat=200) — Spring MVC의 핸들러 메서드 검증(6.1+)이 던진다.
    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiResponse<Void>> handleHandlerMethodValidation(HandlerMethodValidationException e) {
        String message = e.getAllErrors().stream()
                .map(error -> error.getDefaultMessage())
                .filter(msg -> msg != null && !msg.isBlank())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(),
                        message.isBlank() ? CommonErrorCode.VALIDATION_ERROR.getDefaultMessage() : message));
    }

    // @Validated(클래스 레벨) AOP 경로로 검증할 때 던져지는 예외 — 위 핸들러와 함께 방어적으로 둔다.
    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(), message));
    }

    // 필수 쿼리 파라미터 자체가 없는 경우 (예: GET /api/places에 lat 누락)
    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ApiResponse<Void>> handleMissingParameter(MissingServletRequestParameterException e) {
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(),
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
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(), message));
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
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(), "요청 본문을 읽을 수 없습니다."));
    }

    // ───────── 라우팅·프로토콜 오류 (리뷰 백로그 3·79번) ─────────
    // 아래 셋은 전부 "클라이언트가 잘못 부른 요청"이다. 핸들러가 없으면 handleUnknown으로 떨어져
    // 500 + ERROR 스택트레이스가 남는데, 그러면 서버 장애와 클라이언트 오타가 로그에서 구분되지 않는다.

    // 매핑된 핸들러가 없는 경로 (예: GET /api/petz).
    // Spring Boot 3.2+는 정적 리소스 조회 실패 형태로 이 예외를 던진다.
    // 로그를 남기지 않는 이유: 오타·스캐너 요청이 대부분이라 기록해도 노이즈만 된다
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException e) {
        return ResponseEntity.status(CommonErrorCode.NOT_FOUND.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.NOT_FOUND.getCode(),
                        CommonErrorCode.NOT_FOUND.getDefaultMessage()));
    }

    // 경로는 맞지만 메서드가 다른 경우 (예: DELETE /api/pets)
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(CommonErrorCode.METHOD_NOT_ALLOWED.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.METHOD_NOT_ALLOWED.getCode(),
                        e.getMethod() + " 메서드는 이 경로에서 지원하지 않습니다."));
    }

    // Content-Type 불일치 (예: multipart 엔드포인트에 application/json으로 요청)
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ApiResponse<Void>> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException e) {
        return ResponseEntity.status(CommonErrorCode.UNSUPPORTED_MEDIA_TYPE.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.UNSUPPORTED_MEDIA_TYPE.getCode(),
                        CommonErrorCode.UNSUPPORTED_MEDIA_TYPE.getDefaultMessage()));
    }

    // ───────── multipart 업로드 (리뷰 백로그 79번) ─────────

    // @RequestPart("file")은 required 기본 true라, 파트가 없으면 **컨트롤러에 닿기 전에** 던져진다.
    // 그래서 ImageStorageClient.validateImage의 file == null 분기는 도달할 수 없다 —
    // "파일 누락 = 400"이라는 명세를 지키는 자리는 서비스가 아니라 여기다
    @ExceptionHandler(MissingServletRequestPartException.class)
    ResponseEntity<ApiResponse<Void>> handleMissingPart(MissingServletRequestPartException e) {
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(),
                        e.getRequestPartName() + " 파일을 첨부해 주세요."));
    }

    // 컨테이너 한도(spring.servlet.multipart.max-file-size) 초과.
    // 서비스 계층의 용량 검사(이미지 5MB·영상 50MB)와 같은 400으로 맞춘다 —
    // 같은 사용자 실수가 파일 크기에 따라 400과 500으로 갈리지 않게 한다
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiResponse<Void>> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(),
                        "파일 용량이 너무 큽니다."));
    }

    // 깨진 multipart 본문 등 나머지 (용량 초과는 더 구체적인 위 핸들러가 먼저 잡는다)
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ApiResponse<Void>> handleMultipart(MultipartException e) {
        return ResponseEntity.status(CommonErrorCode.VALIDATION_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.VALIDATION_ERROR.getCode(),
                        "파일 업로드 요청 형식이 올바르지 않습니다."));
    }

    // ───────── 동시 수정 충돌 (리뷰 백로그 22·66번) ─────────

    // @Version 충돌(채팅 권한 변경 등). 22번에서 추가했지만 이후 머지에서 유실돼
    // 500으로 되돌아가 있던 것을 복구한다 (2026-08-12 확인 — fec6447의 해당 hunk만 사라져 있었다)
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<ApiResponse<Void>> handleOptimisticLock(ObjectOptimisticLockingFailureException e) {
        return ResponseEntity.status(CommonErrorCode.CONCURRENT_UPDATE.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.CONCURRENT_UPDATE.getCode(),
                        CommonErrorCode.CONCURRENT_UPDATE.getDefaultMessage()));
    }

    // DB 제약 위반. 도메인이 의미를 아는 위반(가입 이메일 중복·채팅 중복 입장 등)은 각 Service가 직접
    // catch해 자기 에러 코드로 바꾸므로, 여기까지 오는 것은 ux_chat_room_owner 같은 **백스톱**이 걸린 경우다.
    // 낙관적 잠금과 성격이 같으므로 같은 409로 통일한다 (예전에는 한쪽만 409, 한쪽은 500이었다).
    // 다만 FK·CHECK 위반(=서버 버그)도 같은 예외 타입이라 응답만으로는 구분할 수 없다 —
    // 그래서 상태 코드는 409로 주되 스택트레이스는 반드시 남긴다
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiResponse<Void>> handleDataIntegrity(DataIntegrityViolationException e) {
        log.error("DB 제약 위반 — 도메인이 흡수하지 못한 경로", e);
        return ResponseEntity.status(CommonErrorCode.CONCURRENT_UPDATE.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.CONCURRENT_UPDATE.getCode(),
                        CommonErrorCode.CONCURRENT_UPDATE.getDefaultMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiResponse<Void>> handleUnknown(Exception e) {
        // 상세는 로그로만 남기고 응답에는 노출하지 않는다
        log.error("처리되지 않은 예외", e);
        return ResponseEntity.status(CommonErrorCode.INTERNAL_ERROR.getStatus())
                .body(ApiResponse.fail(CommonErrorCode.INTERNAL_ERROR.getCode(),
                        CommonErrorCode.INTERNAL_ERROR.getDefaultMessage()));
    }
}
