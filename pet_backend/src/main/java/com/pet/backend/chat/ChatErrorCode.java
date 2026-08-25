package com.pet.backend.chat;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/** 오픈채팅 실패 코드. 코드 문자열의 {@code CHAT_} 접두어는 프론트와의 기존 계약이라 그대로 유지한다. */
@Getter
@RequiredArgsConstructor
public enum ChatErrorCode implements ErrorCode {

    NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "CHAT_NOT_PARTICIPANT", "참여하지 않은 채팅방입니다."),
    KICKED(HttpStatus.FORBIDDEN, "CHAT_KICKED", "강퇴된 채팅방에는 다시 입장할 수 없습니다."),
    ROLE_FORBIDDEN(HttpStatus.FORBIDDEN, "CHAT_ROLE_FORBIDDEN", "채팅방 내 권한이 없습니다."),
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_ROOM_NOT_FOUND", "채팅방을 찾을 수 없습니다."),
    MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_MEMBER_NOT_FOUND", "해당 회원은 이 채팅방에 참여하고 있지 않습니다."),
    MESSAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_MESSAGE_NOT_FOUND", "메시지를 찾을 수 없습니다."),
    OWNER_CANNOT_LEAVE(HttpStatus.CONFLICT, "CHAT_OWNER_CANNOT_LEAVE", "방장은 위임 후에만 나갈 수 있습니다."),
    ROOM_FULL(HttpStatus.CONFLICT, "CHAT_ROOM_FULL", "정원이 가득 차 입장할 수 없습니다."),
    // 방 고정 상한 (F7). 이름·코드에 ROOM_PIN을 쓴 것은 **공지 핀과 구분하기 위해서다** —
    // 공지 핀은 방 전체에 걸리는 OWNER·MANAGER 기능이고, 이건 개인이 자기 목록을 정렬하는 기능이다
    ROOM_PIN_LIMIT(HttpStatus.BAD_REQUEST, "CHAT_ROOM_PIN_LIMIT", "방 고정은 5개까지 가능합니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
