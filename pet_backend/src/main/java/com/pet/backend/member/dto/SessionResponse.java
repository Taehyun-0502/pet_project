package com.pet.backend.member.dto;

import com.pet.backend.member.RefreshToken;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

// 로그인 기기(세션) 1건 (docs/api-spec.md 1절 5차). lastUsedAt은 마지막 재발급 시각이라 실제 활동보다 최대 15분 뒤처진다
public record SessionResponse(
        UUID sessionId,
        String deviceInfo,
        Instant loggedInAt,
        Instant lastUsedAt,
        boolean current
) {

    /**
     * 같은 세션의 활성 토큰 묶음 → 응답 1건. 보통 체인당 활성 토큰은 1개지만,
     * 회전 유예의 중복 회전이 남긴 고아가 같은 세션에 있을 수 있어 목록으로 받는다 —
     * 세션 정보(deviceInfo·loggedInAt)는 체인 공통값이고 lastUsedAt만 가장 최근 발급 시각을 쓴다.
     */
    public static SessionResponse of(List<RefreshToken> chain, boolean current) {
        RefreshToken latest = chain.stream()
                .max(Comparator.comparing(RefreshToken::getCreatedAt))
                .orElseThrow(); // 호출자(groupingBy 결과)가 빈 목록을 넘길 수 없다
        return new SessionResponse(
                latest.getSessionId(),
                latest.getDeviceInfo(),
                latest.getSessionStartedAt(),
                latest.getCreatedAt(),
                current);
    }
}
