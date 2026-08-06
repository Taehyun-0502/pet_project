package com.pet.backend.shorts;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShortsLikeRepository extends JpaRepository<ShortsLike, Long> {

    boolean existsByShortIdAndMemberId(Long shortId, Long memberId);

    // 좋아요 취소. 삭제된 행 수(0 또는 1)로 실제로 취소됐는지 판단한다
    long deleteByShortIdAndMemberId(Long shortId, Long memberId);

    /**
     * 이 영상들 중 내가 좋아요한 것의 id만 모아 온다.
     * 영상마다 한 번씩 물어보면(N+1) 피드가 느려지므로 한 번에 조회한다.
     */
    @Query("select l.shortId from ShortsLike l where l.memberId = :memberId and l.shortId in :shortIds")
    List<Long> findLikedShortIds(@Param("memberId") Long memberId,
                                 @Param("shortIds") Collection<Long> shortIds);
}
