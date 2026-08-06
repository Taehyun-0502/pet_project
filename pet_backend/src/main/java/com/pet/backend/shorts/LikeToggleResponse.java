package com.pet.backend.shorts;

/**
 * 좋아요 토글 결과. 영상 좋아요와 댓글 좋아요가 같은 형태를 쓴다.
 *
 * @param liked     이번 요청 후의 상태 (true = 좋아요 눌린 상태)
 * @param likeCount 갱신된 총 좋아요 수. 화면이 직접 계산하지 않도록 서버가 알려준다
 */
public record LikeToggleResponse(boolean liked, Integer likeCount) {
}
