package com.pet.backend.shorts;

import java.time.Instant;
import java.util.List;

/**
 * 댓글 한 개. 2단 구조이므로 replies에는 대댓글만 들어가고, 대댓글의 replies는 항상 빈 목록이다.
 *
 * @param likedByMe 로그인하지 않은 조회에서는 항상 false
 */
public record ShortsCommentResponse(
        Long id,
        String memberName,
        String content,
        Integer likeCount,
        boolean likedByMe,
        Instant createdAt,
        List<ShortsCommentResponse> replies
) {

    public static ShortsCommentResponse of(ShortsCommentRow row, boolean likedByMe,
                                           List<ShortsCommentResponse> replies) {
        return new ShortsCommentResponse(row.id(), row.memberName(), row.content(),
                row.likeCount(), likedByMe, row.createdAt(), replies);
    }
}
