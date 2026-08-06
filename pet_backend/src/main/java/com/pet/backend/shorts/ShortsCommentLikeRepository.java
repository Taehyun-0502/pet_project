package com.pet.backend.shorts;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShortsCommentLikeRepository extends JpaRepository<ShortsCommentLike, Long> {

    boolean existsByCommentIdAndMemberId(Long commentId, Long memberId);

    long deleteByCommentIdAndMemberId(Long commentId, Long memberId);

    // 댓글 목록에서 "내가 좋아요한 댓글"을 한 번에 판별한다 (댓글마다 조회하면 N+1)
    @Query("select cl.commentId from ShortsCommentLike cl "
            + "where cl.memberId = :memberId and cl.commentId in :commentIds")
    List<Long> findLikedCommentIds(@Param("memberId") Long memberId,
                                   @Param("commentIds") Collection<Long> commentIds);
}
