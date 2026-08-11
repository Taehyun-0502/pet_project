package com.pet.backend.member;

/**
 * 리프레시 토큰이 폐기된 이유. 재사용 판정이 이 값에 따라 갈린다 (리뷰 백로그 32번).
 *
 * 회전으로 폐기된 토큰이 곧바로 다시 오는 것은 침해가 아니라 정상 상황이다 —
 * 응답(Set-Cookie)이 도착하기 전에 새로고침했거나, 탭 두 개가 동시에 재발급했을 때가 그렇다.
 * 반면 로그아웃으로 끊은 토큰이 다시 오는 것은 유예할 이유가 없다.
 */
public enum RevokedReason {
    ROTATED,           // 재발급으로 회전됨 — 짧은 유예 동안 재제출을 정상으로 취급
    LOGOUT,            // 로그아웃으로 폐기 — 유예 없음
    REUSE_DETECTED,    // 재사용 감지로 일괄 폐기됨
    PASSWORD_CHANGED,  // 비밀번호 변경으로 전 기기 일괄 폐기 — 유출 대응이 목적이므로 유예 없음
    REPLACED_BY_LOGIN, // 재로그인으로 대체됨 (백로그 37번) — 새 쿠키로 덮여 도달 불가가 될 토큰의 선제 폐기
    DEVICE_REVOKED;    // 기기 관리 화면의 원격 로그아웃 (api-spec.md 1절 5차)

    /**
     * 이 사유로 폐기된 토큰의 재제출을 침해(재사용 감지 → 전체 폐기)로 판정하지 않고 단순 401로 끝낼지.
     * 셋 다 "폐기당한 쪽이 폐기 사실을 모른 채 다음 재발급 때 반드시 그 토큰을 제출하는" 경로가 있다 —
     * PASSWORD_CHANGED·DEVICE_REVOKED는 다른 기기의 자동 재발급(보장된 정상 동작),
     * REPLACED_BY_LOGIN은 로그인 응답(Set-Cookie) 유실·탭 경합. 전체 폐기로 응수하면
     * 정상 사용자의 전 기기가 로그아웃된다 (2026-08-10 비밀번호 변경 검증에서 실측한 그 결함과 동일 계열).
     */
    public boolean exemptFromReuseDetection() {
        return this == PASSWORD_CHANGED || this == REPLACED_BY_LOGIN || this == DEVICE_REVOKED;
    }
}
