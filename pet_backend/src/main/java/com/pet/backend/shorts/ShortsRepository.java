package com.pet.backend.shorts;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 숏츠 저장소. 피드는 커서 페이지네이션 — "마지막으로 본 id보다 작은 것 N개"를 가져온다
 * (shorts_guide_1.md 4절). 페이지 번호 방식과 달리 스크롤 중 새 글이 올라와도 목록이 밀리지 않는다.
 */
public interface ShortsRepository extends JpaRepository<Shorts, Long> {

    /**
     * 피드 한 페이지. 회원 이름이 필요해 pet_member와 조인하고, 결과를 바로 DTO로 뽑는다
     * (엔티티를 받아 나중에 이름을 채우면 N+1 쿼리가 된다).
     *
     * <p>cursor가 primitive long인 이유: 첫 페이지를 null로 넘기면 PostgreSQL이
     * 파라미터 타입을 추론하지 못해 실패한다. 서비스가 첫 페이지에 Long.MAX_VALUE를 넣어
     * "가장 큰 id부터"를 표현한다.
     */
    @Query("""
            select new com.pet.backend.shorts.ShortsResponse(
                s.id, m.name, s.videoUrl, s.thumbnailUrl, s.caption,
                s.durationSec, s.viewCount, s.likeCount, s.commentCount, s.createdAt)
            from Shorts s
            join com.pet.backend.member.Member m on m.id = s.memberId
            where s.deletedAt is null
              and m.deletedAt is null
              and s.id < :cursor
            order by s.id desc
            """)
    List<ShortsResponse> findFeed(@Param("cursor") long cursor, Pageable pageable);

    Optional<Shorts> findByIdAndDeletedAtIsNull(Long id);

    boolean existsByIdAndDeletedAtIsNull(Long id);

    /**
     * 좋아요/댓글 수 증감. 엔티티를 읽어 +1 해서 저장하면 두 사람이 동시에 누를 때
     * 하나가 사라진다(읽기-수정-쓰기 경합). DB에서 직접 더하면 원자적으로 처리된다.
     */
    @Modifying
    @Query("update Shorts s set s.likeCount = s.likeCount + 1 where s.id = :id")
    void increaseLikeCount(@Param("id") Long id);

    // 0 미만으로 내려가지 않게 조건을 함께 건다
    @Modifying
    @Query("update Shorts s set s.likeCount = s.likeCount - 1 where s.id = :id and s.likeCount > 0")
    void decreaseLikeCount(@Param("id") Long id);

    @Modifying
    @Query("update Shorts s set s.commentCount = s.commentCount + 1 where s.id = :id")
    void increaseCommentCount(@Param("id") Long id);

    @Query("select s.likeCount from Shorts s where s.id = :id")
    Integer findLikeCount(@Param("id") Long id);
}
