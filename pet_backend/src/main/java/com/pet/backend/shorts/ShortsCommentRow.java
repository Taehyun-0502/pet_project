package com.pet.backend.shorts;

import java.time.Instant;

/**
 * 댓글 조회 쿼리가 뽑아내는 납작한 한 줄. 회원 이름과 프로필 사진까지 조인해서 한 번에 가져온다.
 *
 * <p>API 응답({@link ShortsCommentResponse})과 분리한 이유: 응답은 대댓글 중첩과
 * "내가 좋아요했는지"를 담아야 하는데, 그건 쿼리 하나로 만들 수 없어 서비스가 조립한다.
 *
 * @param memberProfileImageUrl 사진 없으면 null — 프론트가 placeholder 표시
 */
public record ShortsCommentRow(
        Long id,
        Long parentId,
        String memberName,
        String memberProfileImageUrl,
        String content,
        Integer likeCount,
        Instant createdAt
) {
}
