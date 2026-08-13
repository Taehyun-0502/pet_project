package com.pet.backend.device;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 디바이스 실패 코드.
 *
 * <p><b>아직 쓰는 코드가 없다</b> — 디바이스 도메인은 담당 미정이라 명세(api-spec.md 3절)와
 * 테이블 설계만 있고 구현이 없다 (CLAUDE.md). 에러 코드는 명세와 1:1이어야 하므로 지우지 않고
 * 도메인 자리에 옮겨만 뒀다. 담당자가 도메인을 구현할 때 이 파일을 그대로 쓰면 된다.
 */
@Getter
@RequiredArgsConstructor
public enum DeviceErrorCode implements ErrorCode {

    NOT_FOUND(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "디바이스를 찾을 수 없습니다."),
    SERIAL_DUPLICATED(HttpStatus.CONFLICT, "DEVICE_SERIAL_DUPLICATED", "이미 등록된 시리얼 번호입니다."),
    ALREADY_MAPPED(HttpStatus.CONFLICT, "DEVICE_ALREADY_MAPPED", "해당 반려동물에 이미 디바이스가 매핑되어 있습니다."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
