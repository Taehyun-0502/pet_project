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
    AUTH_PASSWORD_UNCHANGED(HttpStatus.BAD_REQUEST, "새 비밀번호는 현재 비밀번호와 달라야 합니다."),
    AUTH_SOCIAL_LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "카카오 로그인에 실패했습니다. 다시 시도해 주세요."),
    AUTH_SOCIAL_EMAIL_CONFLICT(HttpStatus.CONFLICT, "이미 이메일로 가입된 계정입니다. 이메일과 비밀번호로 로그인해 주세요."),
    AUTH_INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    AUTH_TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),
    AUTH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "토큰이 만료되었습니다."),
    AUTH_INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 리프레시 토큰입니다."),
    AUTH_REFRESH_EXPIRED(HttpStatus.UNAUTHORIZED, "리프레시 토큰이 만료되었습니다. 다시 로그인해 주세요."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    CHAT_NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "참여하지 않은 채팅방입니다."),
    CHAT_KICKED(HttpStatus.FORBIDDEN, "강퇴된 채팅방에는 다시 입장할 수 없습니다."),
    CHAT_ROLE_FORBIDDEN(HttpStatus.FORBIDDEN, "채팅방 내 권한이 없습니다."),
    CHAT_ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "채팅방을 찾을 수 없습니다."),
    CHAT_MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "해당 회원은 이 채팅방에 참여하고 있지 않습니다."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),
    PET_NOT_FOUND(HttpStatus.NOT_FOUND, "반려동물을 찾을 수 없습니다."),
    DEVICE_NOT_FOUND(HttpStatus.NOT_FOUND, "디바이스를 찾을 수 없습니다."),
    AUTH_EMAIL_DUPLICATED(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    DEVICE_SERIAL_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 시리얼 번호입니다."),
    DEVICE_ALREADY_MAPPED(HttpStatus.CONFLICT, "해당 반려동물에 이미 디바이스가 매핑되어 있습니다."),
    CHAT_OWNER_CANNOT_LEAVE(HttpStatus.CONFLICT, "방장은 위임 후에만 나갈 수 있습니다."),
    CONCURRENT_UPDATE(HttpStatus.CONFLICT, "다른 요청이 먼저 처리되었습니다. 새로고침 후 다시 시도해 주세요."),

    // ───── 숏츠(릴스) 파트 ─────
    // 다른 파트와 줄이 섞이지 않게 한 덩어리로 모아둔다 (동시 수정 시 머지 충돌 최소화)
    SHORTS_NOT_FOUND(HttpStatus.NOT_FOUND, "숏츠를 찾을 수 없습니다."),
    SHORTS_COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."),
    SHORTS_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "영상 업로드에 실패했습니다."),

    IMAGE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 업로드에 실패했습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),
     // 카카오 로컬 API 등 외부 연동 실패 — 원본 예외 메시지(응답 본문 일부 등)를 그대로
    // 클라이언트/모델에 노출하지 않기 위해 도메인 서비스가 이 코드로 감싸 던진다.
    PLACE_SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    
    private final HttpStatus status;
    private final String defaultMessage;
}
