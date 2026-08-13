package com.pet.backend.pet;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 반려동물 실패 코드.
 *
 * <p>타인 소유·삭제된·없는 id를 전부 이 하나로 응답한다 — 소유자 조건을 쿼리에 걸어 조회하므로
 * 서비스는 셋을 구분하지 못하고, 구분해서 내려주면 남의 반려동물 존재 여부가 새어 나간다.
 */
@Getter
@RequiredArgsConstructor
public enum PetErrorCode implements ErrorCode {

    NOT_FOUND(HttpStatus.NOT_FOUND, "PET_NOT_FOUND", "반려동물을 찾을 수 없습니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
