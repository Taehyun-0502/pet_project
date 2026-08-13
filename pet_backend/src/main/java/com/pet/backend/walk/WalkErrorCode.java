package com.pet.backend.walk;

import com.pet.backend.common.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 산책 실패 코드.
 *
 * <p>기상청 단기예보 조회서비스 실패(키 미설정은 mock 폴백이라 여기 해당 없음 — 키가 있는데도
 * 호출/파싱이 실패한 경우만). place의 {@code SEARCH_FAILED}와 동일 성격이다.
 */
@Getter
@RequiredArgsConstructor
public enum WalkErrorCode implements ErrorCode {

    WEATHER_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "WALK_WEATHER_FETCH_FAILED", "날씨 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ;

    private final HttpStatus status;
    private final String code;
    private final String defaultMessage;
}
