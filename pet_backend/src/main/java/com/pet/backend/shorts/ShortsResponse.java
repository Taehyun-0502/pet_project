package com.pet.backend.shorts;

import java.time.Instant;
import java.util.List;

/**
 * 피드 항목 하나 (shorts_guide_1.md 4절). DB는 snake_case지만 API 필드는 camelCase — DTO가 경계.
 * memberName은 pet_member와 조인해서 채운다 (ShortsRepository.findAllByIds).
 *
 * @param tags      분류 태그. 태그를 고르지 않은 영상(컬럼 추가 이전의 기존 영상 포함)은 null
 * @param likedByMe 내가 이미 좋아요를 눌렀는지. 로그인하지 않은 조회에서는 항상 false
 */
public record ShortsResponse(
        Long id,
        String memberName,
        String videoUrl,
        String thumbnailUrl,
        String caption,
        List<String> tags,
        Integer durationSec,
        Integer viewCount,
        Integer likeCount,
        Integer commentCount,
        Instant createdAt,
        boolean likedByMe
) {

    /**
     * JPQL 생성자 표현식이 호출하는 생성자. likedByMe는 쿼리 하나로 알 수 없어
     * (비로그인 조회도 있고, 좋아요 여부는 별도 테이블이다) 서비스가 나중에 채운다.
     */
    public ShortsResponse(Long id, String memberName, String videoUrl, String thumbnailUrl,
                          String caption, List<String> tags, Integer durationSec, Integer viewCount,
                          Integer likeCount, Integer commentCount, Instant createdAt) {
        this(id, memberName, videoUrl, thumbnailUrl, caption, tags, durationSec,
                viewCount, likeCount, commentCount, createdAt, false);
    }

    public ShortsResponse withLikedByMe(boolean liked) {
        return new ShortsResponse(id, memberName, videoUrl, thumbnailUrl, caption, tags,
                durationSec, viewCount, likeCount, commentCount, createdAt, liked);
    }

    // 업로드 직후 응답용. 방금 올린 영상이므로 좋아요는 눌리지 않은 상태다
    public static ShortsResponse of(Shorts shorts, String memberName) {
        return new ShortsResponse(shorts.getId(), memberName, shorts.getVideoUrl(),
                shorts.getThumbnailUrl(), shorts.getCaption(), shorts.getTags(),
                shorts.getDurationSec(), shorts.getViewCount(), shorts.getLikeCount(),
                shorts.getCommentCount(), shorts.getCreatedAt());
    }
}
