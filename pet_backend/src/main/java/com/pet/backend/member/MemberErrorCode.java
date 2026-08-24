package com.pet.backend.member;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 회원·인증 실패 코드. 가입·로그인·토큰·세션·탈퇴가 한 도메인이라 함께 둔다 (CLAUDE.md 패키지 규약).
 * 코드 문자열의 {@code AUTH_} 접두어는 프론트와의 기존 계약이라 그대로 유지한다.
 */
@Getter
@RequiredArgsConstructor
public enum MemberErrorCode implements ErrorCode {

    PASSWORD_UNCHANGED(HttpStatus.BAD_REQUEST, "AUTH_PASSWORD_UNCHANGED", "새 비밀번호는 현재 비밀번호와 달라야 합니다."),
    SOCIAL_LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "AUTH_SOCIAL_LOGIN_FAILED", "카카오 로그인에 실패했습니다. 다시 시도해 주세요."),
    SOCIAL_EMAIL_CONFLICT(HttpStatus.CONFLICT, "AUTH_SOCIAL_EMAIL_CONFLICT", "이미 이메일로 가입된 계정입니다. 이메일과 비밀번호로 로그인해 주세요."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."),
    TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_INVALID", "유효하지 않은 토큰입니다."),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_EXPIRED", "토큰이 만료되었습니다."),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_REFRESH_TOKEN", "유효하지 않은 리프레시 토큰입니다."),
    REFRESH_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_REFRESH_EXPIRED", "리프레시 토큰이 만료되었습니다. 다시 로그인해 주세요."),
    SESSION_CURRENT(HttpStatus.BAD_REQUEST, "AUTH_SESSION_CURRENT", "현재 사용 중인 기기는 여기서 로그아웃할 수 없습니다."),
    SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "AUTH_SESSION_NOT_FOUND", "해당 기기를 찾을 수 없습니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다."),
    EMAIL_DUPLICATED(HttpStatus.CONFLICT, "AUTH_EMAIL_DUPLICATED", "이미 가입된 이메일입니다."),
    // 이름(닉네임) 중복 — 가입·이름 수정 양쪽에서 쓴다 (2026-08-13, docs/plan-2026-08-13.md F2).
    // code 접두어를 EMAIL_DUPLICATED와 맞춰 AUTH_로 둔다 (계획서의 MEMBER_ 안에서 변경)
    NAME_DUPLICATED(HttpStatus.CONFLICT, "AUTH_NAME_DUPLICATED", "이미 사용 중인 이름입니다."),

    // 탈퇴 시점의 회원 상태 문제 — 방장인 방이 남아 있으면 탈퇴할 수 없다
    WITHDRAW_CHAT_OWNER(HttpStatus.CONFLICT, "WITHDRAW_CHAT_OWNER", "방장인 채팅방이 있습니다. 위임하거나 방을 삭제한 뒤 탈퇴할 수 있습니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
