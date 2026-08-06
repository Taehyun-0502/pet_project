package com.pet.backend.shorts;

/**
 * 영상 파일 업로드 응답. 프론트는 이 URL을 그대로 POST /api/shorts의 videoUrl로 보낸다.
 * (파일 업로드와 DB 등록을 두 단계로 나눈 이유는 shorts_guide_1.md 8-7절 참고)
 */
public record ShortsVideoResponse(String videoUrl) {
}
