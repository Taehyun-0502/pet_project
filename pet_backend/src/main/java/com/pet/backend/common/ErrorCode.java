package com.pet.backend.common;

import org.springframework.http.HttpStatus;

/**
 * 에러 코드의 계약. 구현은 도메인별 enum이다 — {@code CommonErrorCode}, {@code MemberErrorCode},
 * {@code ChatErrorCode} 등. docs/api-spec.md 5절의 에러 코드 표와 1:1이고 HTTP 상태 매핑의 단일 출처다.
 * Controller/Service에서 상태 코드를 직접 다루지 않는다.
 *
 * <p><b>도메인별로 나눈 이유 (2026-08-13)</b>: 파트 4개가 한 파일의 상수 목록을 동시에 고쳐
 * 머지 충돌이 반복됐다. 이제 각자 자기 도메인 enum만 연다.
 *
 * <p><b>{@code getCode()}는 클라이언트와의 계약이다.</b> 응답 {@code error.code}로 그대로 나가고
 * 프론트가 이 값으로 분기한다. 상수명과 별개로 두는 이유가 여기 있다 — 상수명은 도메인 안에서
 * 짧게(예: {@code ChatErrorCode.ROOM_FULL}) 짓고, 코드는 도메인 접두어를 붙인 전역 유일 값
 * ({@code "CHAT_ROOM_FULL"})을 유지한다. 상수명은 리팩터링해도 되지만 코드 문자열은 프론트와
 * 합의 없이 바꾸지 않는다.
 *
 * <p>코드가 전역에서 유일한지는 {@code ErrorCodeTest}가 검사한다. 한 enum 안에 있을 때는
 * 상수명 중복을 컴파일러가 막아줬지만, 나뉜 뒤로는 서로 다른 enum이 같은 코드를 써도 컴파일된다.
 *
 * <p><b>구현 enum은 마지막 상수 뒤에 쉼표를 두고 세미콜론을 다음 줄에 단독으로 둔다.</b> 오타가
 * 아니다 — 맨 끝에 상수를 추가할 때 기존 줄을 고치지 않아도 되므로, 두 사람이 동시에 추가해도
 * "같은 줄을 서로 다르게 고쳤다"는 머지 충돌이 나지 않는다. (같은 위치에 동시 삽입하는 충돌까지
 * 막아주지는 않는다.)
 */
public interface ErrorCode {

    HttpStatus getStatus();

    /** 응답 {@code error.code}로 나가는 계약값. 도메인 접두어를 포함한 전역 유일 문자열이다. */
    String getCode();

    String getDefaultMessage();
}
