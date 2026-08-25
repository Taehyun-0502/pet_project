package com.pet.backend.shorts;

/**
 * 커버(썸네일) 이미지 업로드 응답. 프론트는 이 URL을 그대로 POST /api/shorts의 thumbnailUrl로 보낸다.
 * 영상({@link ShortsVideoResponse})과 같은 두 단계 구조다 — 파일 먼저, 등록은 그 뒤.
 */
public record ShortsThumbnailResponse(String thumbnailUrl) {
}
