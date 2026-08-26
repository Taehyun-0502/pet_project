package com.pet.backend.shorts;

import java.util.List;

/**
 * 회원별 릴스 목록 응답 (docs/api-spec.md 8절).
 *
 * <p>{@link ShortsFeedResponse}와 달리 <b>커서를 쓴다</b>. 피드가 커서를 버리고 {@code excludeIds}로
 * 간 이유는 품질점수 순서가 id 순서와 무관해서인데(가이드 9절), 이 목록의 두 정렬(최신순·좋아요순)은
 * 순서가 안정적이라 커서가 성립한다. 피드의 방식을 복사하면 요청 URL만 길어지고 얻는 것이 없다.
 *
 * @param hasNext    {@code nextCursor}를 실어 한 번 더 요청하면 더 받을 수 있는지
 * @param nextCursor 다음 페이지 요청에 그대로 실어 보낼 값. {@code hasNext}가 false면 null.
 *                   <b>클라이언트는 이 값을 해석하지 않는다</b> — 정렬마다 구성이 다르고(최신순은 id,
 *                   인기순은 좋아요+id) 서버가 언제든 형식을 바꿀 수 있는 불투명 문자열이다
 */
public record ShortsListResponse(
        List<ShortsSummaryResponse> items,
        boolean hasNext,
        String nextCursor
) {
}
