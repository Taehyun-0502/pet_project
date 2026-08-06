package com.pet.backend.shorts;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShortsCommentRepository extends JpaRepository<ShortsComment, Long> {

    /**
     * 한 영상의 댓글 전체(최상위 + 대댓글)를 오래된 순으로 가져온다.
     * 2단 구조라 깊이가 정해져 있어 한 번에 다 받아 서비스에서 부모/자식으로 묶는 편이
     * 최상위를 먼저 조회하고 각자의 대댓글을 다시 조회하는 것(N+1)보다 낫다.
     */
    @Query("""
            select new com.pet.backend.shorts.ShortsCommentRow(
                c.id, c.parentId, m.name, c.content, c.likeCount, c.createdAt)
            from ShortsComment c
            join com.pet.backend.member.Member m on m.id = c.memberId
            where c.shortId = :shortId
              and c.deletedAt is null
            order by c.id asc
            """)
    List<ShortsCommentRow> findRowsByShortId(@Param("shortId") Long shortId);

    Optional<ShortsComment> findByIdAndDeletedAtIsNull(Long id);

    /**
     * 좋아요 수 증감. 엔티티를 읽어 +1 해서 저장하면 두 사람이 동시에 누를 때 하나가 사라진다
     * (읽기-수정-쓰기 경합). DB에서 직접 더하면 원자적으로 처리된다.
     */
    @Modifying
    @Query("update ShortsComment c set c.likeCount = c.likeCount + 1 where c.id = :id")
    void increaseLikeCount(@Param("id") Long id);

    // 0 미만으로 내려가지 않게 조건을 함께 건다 (데이터가 어긋나도 음수가 되지 않도록)
    @Modifying
    @Query("update ShortsComment c set c.likeCount = c.likeCount - 1 where c.id = :id and c.likeCount > 0")
    void decreaseLikeCount(@Param("id") Long id);

    @Query("select c.likeCount from ShortsComment c where c.id = :id")
    Integer findLikeCount(@Param("id") Long id);
}
