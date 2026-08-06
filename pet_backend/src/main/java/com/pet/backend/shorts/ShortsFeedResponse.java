package com.pet.backend.shorts;

import java.util.List;

/**
 * 피드 응답 (shorts_guide_1.md 4절).
 * nextCursor는 "이 값 다음부터 더 주세요"에 쓰는 마지막 항목의 id이고,
 * null이면 더 볼 게 없다는 뜻이다 — 페이지 번호가 아니다.
 */
public record ShortsFeedResponse(
        List<ShortsResponse> items,
        Long nextCursor
) {
}
