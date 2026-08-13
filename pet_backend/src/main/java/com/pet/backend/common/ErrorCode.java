package com.pet.backend.common;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 에러 코드. docs/api-spec.md 5절의 에러 코드 표와 1:1 — HTTP 상태 매핑의 단일 출처.
 * Controller/Service에서 상태 코드를 직접 다루지 않는다.
 *
 * <p><b>{@code code}는 클라이언트와의 계약이다 (2026-08-13).</b> 응답 본문의
 * {@code error.code}로 그대로 나가고 프론트가 이 값으로 분기한다. 예전에는 {@code name()}을
 * 응답에 실었는데, 그러면 상수명을 리팩터링하는 순간 계약이 조용히 깨지고 컴파일러는 아무 말도
 * 하지 않는다. 상수명(자유롭게 바꿔도 되는 것)과 코드(바꾸면 안 되는 것)를 떼어놓은 이유다.
 * 상수명은 바꿔도 되지만 {@code code} 문자열은 프론트와 합의 없이 바꾸지 않는다.
 */
@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "요청 값이 올바르지 않습니다."),
    AUTH_PASSWORD_UNCHANGED(HttpStatus.BAD_REQUEST, "AUTH_PASSWORD_UNCHANGED", "새 비밀번호는 현재 비밀번호와 달라야 합니다."),
    AUTH_SOCIAL_LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "AUTH_SOCIAL_LOGIN_FAILED", "카카오 로그인에 실패했습니다. 다시 시도해 주세요."),
    AUTH_SOCIAL_EMAIL_CONFLICT(HttpStatus.CONFLICT, "AUTH_SOCIAL_EMAIL_CONFLICT", "이미 이메일로 가입된 계정입니다. 이메일과 비밀번호로 로그인해 주세요."),
    AUTH_INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."),
    AUTH_TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_INVALID", "유효하지 않은 토큰입니다."),
    AUTH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_EXPIRED", "토큰이 만료되었습니다."),
    AUTH_INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_REFRESH_TOKEN", "유효하지 않은 리프레시 토큰입니다."),
    AUTH_REFRESH_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_REFRESH_EXPIRED", "리프레시 토큰이 만료되었습니다. 다시 로그인해 주세요."),
    AUTH_SESSION_CURRENT(HttpStatus.BAD_REQUEST, "AUTH_SESSION_CURRENT", "현재 사용 중인 기기는 여기서 로그아웃할 수 없습니다."),
    AUTH_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "AUTH_SESSION_NOT_FOUND", "해당 기기를 찾을 수 없습니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다."),
    CHAT_NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "CHAT_NOT_PARTICIPANT", "참여하지 않은 채팅방입니다."),
    CHAT_KICKED(HttpStatus.FORBIDDEN, "CHAT_KICKED", "강퇴된 채팅방에는 다시 입장할 수 없습니다."),
    CHAT_ROLE_FORBIDDEN(HttpStatus.FORBIDDEN, "CHAT_ROLE_FORBIDDEN", "채팅방 내 권한이 없습니다."),
    CHAT_ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_ROOM_NOT_FOUND", "채팅방을 찾을 수 없습니다."),
    CHAT_MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_MEMBER_NOT_FOUND", "해당 회원은 이 채팅방에 참여하고 있지 않습니다."),
    CHAT_MESSAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_MESSAGE_NOT_FOUND", "메시지를 찾을 수 없습니다."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다."),
    PET_NOT_FOUND(HttpStatus.NOT_FOUND, "PET_NOT_FOUND", "반려동물을 찾을 수 없습니다."),
    DEVICE_NOT_FOUND(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "디바이스를 찾을 수 없습니다."),

    // ───── 라우팅·프로토콜 오류 ─────
    // 특정 도메인이 아니라 요청 자체가 잘못된 경우. Service가 던지는 코드가 아니라
    // GlobalExceptionHandler가 Spring MVC 예외를 옮겨 담는 자리다 (리뷰 백로그 3·79번)
    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "요청한 경로를 찾을 수 없습니다."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식입니다."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 Content-Type입니다."),

    AUTH_EMAIL_DUPLICATED(HttpStatus.CONFLICT, "AUTH_EMAIL_DUPLICATED", "이미 가입된 이메일입니다."),
    DEVICE_SERIAL_DUPLICATED(HttpStatus.CONFLICT, "DEVICE_SERIAL_DUPLICATED", "이미 등록된 시리얼 번호입니다."),
    DEVICE_ALREADY_MAPPED(HttpStatus.CONFLICT, "DEVICE_ALREADY_MAPPED", "해당 반려동물에 이미 디바이스가 매핑되어 있습니다."),
    CHAT_OWNER_CANNOT_LEAVE(HttpStatus.CONFLICT, "CHAT_OWNER_CANNOT_LEAVE", "방장은 위임 후에만 나갈 수 있습니다."),
    CHAT_ROOM_FULL(HttpStatus.CONFLICT, "CHAT_ROOM_FULL", "정원이 가득 차 입장할 수 없습니다."),
    WITHDRAW_CHAT_OWNER(HttpStatus.CONFLICT, "WITHDRAW_CHAT_OWNER", "방장인 채팅방이 있습니다. 위임하거나 방을 삭제한 뒤 탈퇴할 수 있습니다."),
    CONCURRENT_UPDATE(HttpStatus.CONFLICT, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리되었습니다. 새로고침 후 다시 시도해 주세요."),

    // ───── 숏츠(릴스) 파트 ─────
    // 다른 파트와 줄이 섞이지 않게 한 덩어리로 모아둔다 (동시 수정 시 머지 충돌 최소화)
    SHORTS_NOT_FOUND(HttpStatus.NOT_FOUND, "SHORTS_NOT_FOUND", "숏츠를 찾을 수 없습니다."),
    SHORTS_COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SHORTS_COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다."),
    SHORTS_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "SHORTS_UPLOAD_FAILED", "영상 업로드에 실패했습니다."),

    IMAGE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "서버 오류가 발생했습니다."),

    // 카카오 로컬 API 등 외부 연동 실패 — 원본 예외 메시지(응답 본문 일부 등)를 그대로
    // 클라이언트/모델에 노출하지 않기 위해 도메인 서비스가 이 코드로 감싸 던진다.
    PLACE_SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "PLACE_SEARCH_FAILED", "장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요."),

    // 기상청 단기예보 조회서비스 실패(키 미설정은 mock 폴백이라 여기 해당 없음 — 키가
    // 있는데도 호출/파싱이 실패한 경우만) — walk 패키지, place의 PLACE_SEARCH_FAILED와 동일 성격
    WALK_WEATHER_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "WALK_WEATHER_FETCH_FAILED", "날씨 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");

    private final HttpStatus status;

    /** 응답 {@code error.code}로 나가는 계약값. 상수명과 별개다 — 클래스 주석 참고. */
    private final String code;

    private final String defaultMessage;
}
