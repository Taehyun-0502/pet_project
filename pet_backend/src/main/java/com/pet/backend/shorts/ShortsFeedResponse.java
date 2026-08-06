package com.pet.backend.shorts;

import java.util.List;

/**
 * 피드 응답.
 *
 * <p>B단계에서 정렬이 최신순(id desc)에서 <b>품질점수</b>로 바뀌면서 페이지네이션 방식도 함께 바뀌었다
 * (숏츠_추천알고리즘_구현가이드.md 9절). 그래서 예전의 {@code nextCursor}가 없다 —
 * 점수 순서는 id 순서와 무관해서 "이 id보다 작은 것"이라는 커서가 성립하지 않는다.
 *
 * <p>대신 다음 페이지는 <b>"방금 받은 id들을 빼고 다시 상위 N개"</b>로 요청한다.
 * 클라이언트가 지금까지 받은 id를 모아 {@code GET /api/shorts?excludeIds=...}로 보내면 된다.
 *
 * @param items   점수 높은 순. 이 순서가 곧 화면에 보일 순서다
 * @param hasNext 제외 목록을 늘려 한 번 더 요청하면 더 받을 수 있는지
 */
public record ShortsFeedResponse(
        List<ShortsResponse> items,
        boolean hasNext
) {
}
