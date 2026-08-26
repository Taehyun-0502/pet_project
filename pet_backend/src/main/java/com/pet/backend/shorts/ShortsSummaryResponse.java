package com.pet.backend.shorts;

import java.time.Instant;

/**
 * 회원별 릴스 목록의 항목 하나 (docs/api-spec.md 8절, F8·F9).
 *
 * <p><b>{@link ShortsResponse}와 일부러 나눈 목록 전용 DTO다.</b> 이 화면은 썸네일 그리드라
 * 재생 메타데이터(트림·크롭·오버레이 글자·볼륨·배경음악)가 하나도 필요 없다. 피드 DTO를
 * 재사용하면 그리드 한 페이지에 쓰지 않을 값이 20건씩 실려 나간다 —
 * 영상을 실제로 재생할 때는 {@code GET /api/shorts/{shortId}}가 전부 내려준다.
 *
 * @param memberId  올린 사람의 id. 화면이 <b>내 영상인지</b> 판단하는 값이다(삭제 버튼 노출).
 *                  같은 API를 마이페이지와 유저 페이지가 함께 쓰므로 목록에도 필요하다
 * @param thumbnailUrl 커버 이미지. <b>NULL일 수 있다</b> — 굽지 못한 영상이며 그 경우 화면이
 *                     {@code videoUrl}의 첫 프레임을 대신 그린다
 * @param videoUrl  위 이유로 목록에도 담는다. 이 필드가 없으면 커버 없는 영상이 빈 칸이 된다
 * @param caption   영상 아래 설명. 그리드에서는 대체 텍스트(alt)로도 쓴다. 없으면 null
 */
public record ShortsSummaryResponse(
        Long id,
        Long memberId,
        String thumbnailUrl,
        String videoUrl,
        String caption,
        Integer durationSec,
        Integer viewCount,
        Integer likeCount,
        Integer commentCount,
        Instant createdAt
) {
}
