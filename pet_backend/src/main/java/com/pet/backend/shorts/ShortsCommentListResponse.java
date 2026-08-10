package com.pet.backend.shorts;

import java.util.List;

/**
 * 댓글 목록 응답.
 *
 * @param items      최상위 댓글 목록 (각 항목의 replies에 대댓글이 들어있다)
 * @param totalCount 대댓글까지 포함한 전체 댓글 수 — 화면의 "댓글 N" 표시에 쓴다
 */
public record ShortsCommentListResponse(
        List<ShortsCommentResponse> items,
        int totalCount
) {
}
