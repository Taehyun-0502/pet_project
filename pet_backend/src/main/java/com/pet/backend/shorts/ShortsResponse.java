package com.pet.backend.shorts;

import java.time.Instant;
import java.util.List;

/**
 * 피드 항목 하나 (shorts_guide_1.md 4절). DB는 snake_case지만 API 필드는 camelCase — DTO가 경계.
 * memberName은 pet_member와 조인해서 채운다 (ShortsRepository.findAllByIds).
 *
 * @param memberId     올린 사람의 id. 화면이 <b>내 영상인지</b> 판단하는 값이다(삭제 버튼 노출).
 *                     memberName으로 비교하지 않는 이유는 동명이인이면 남의 영상에 삭제
 *                     버튼이 뜨기 때문이다 — 실제 삭제는 서버가 소유자를 다시 확인하므로
 *                     지워지지는 않지만, 눌러도 403이 나는 버튼을 보여줄 이유가 없다
 * @param tags         분류 태그. 태그를 고르지 않은 영상(컬럼 추가 이전의 기존 영상 포함)은 null
 * @param musicKey     업로더가 고른 배경음악 키. null = 곡 없음.
 *                     <b>제목·아티스트·URL은 서버가 내려보내지 않는다</b> — 프론트의
 *                     musicCatalog.js가 이 키로 찾는다. 서버는 그 표기를 쓰지 않으므로
 *                     양쪽에 두면 한쪽만 고치는 사고가 난다 (ShortsMusicKeys 주석 참고)
 * @param muteOriginal 업로더가 영상 원본 소리를 끄기로 했는지. 보는 사람은 되살릴 수 없다
 * @param musicStartSec 곡의 어느 지점부터 재생할지(초). 재생 쪽이 이 값 + 영상 길이를
 *                      구간으로 삼는다. 곡이 없으면 0
 * @param overlayTexts 영상 위에 얹는 글자들(각각 글자 + 위치). 빈 배열 = 없음.
 *                     캡션과 다른 값이다 — 캡션은 영상 아래 설명이고 이것은 화면 안에 올라간다.
 *                     좌표 규칙은 {@link ShortsOverlayText} 주석 참고
 * @param trimStartSec 재생 시작 지점(초). 0이면 원본 처음부터.
 *                     <b>영상 파일은 잘려 있지 않다</b> — 재생 쪽이 이 구간만 반복해야 한다
 *                     (가이드 4절 방법 A, {@link Shorts#getTrimStartSec()} 주석 참고)
 * @param trimEndSec   재생 끝 지점(초). null이면 원본 끝까지
 * @param crop         9:16 프레임 안 위치. null이면 기본(가운데 cover) — 지금까지의 표시와 같다
 * @param musicVolume  배경음악 볼륨 0~100. 곡이 없으면 100(의미 없음)
 * @param videoVolume  영상 원본 소리 볼륨 0~100. muteOriginal과 서로 맞춰 저장된다 —
 *                     다만 칼럼이 생기기 전 영상은 muteOriginal만 true이고 이 값은 100이라
 *                     재생 쪽은 <b>두 값을 모두</b> 봐야 한다
 * @param thumbnailTimeSec 커버로 쓴 영상 시점(초). 커버는 이미 구워져 thumbnailUrl에 있으므로
 *                         재생 쪽은 이 값을 쓰지 않는다 — <b>다시 구울 때</b>를 위한 기록이다
 * @param thumbnailTextOverlays 커버에만 박힌 글자. 이미 이미지에 그려져 있으므로 재생 쪽은
 *                              그리지 않는다. overlayTexts(영상 자막)와 다른 값이다
 * @param likedByMe    내가 이미 좋아요를 눌렀는지. 로그인하지 않은 조회에서는 항상 false
 */
public record ShortsResponse(
        Long id,
        Long memberId,
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
        String musicKey,
        boolean muteOriginal,
        int musicStartSec,
        List<ShortsOverlayText> overlayTexts,
        double trimStartSec,
        Double trimEndSec,
        ShortsCrop crop,
        int musicVolume,
        int videoVolume,
        double thumbnailTimeSec,
        List<ShortsOverlayText> thumbnailTextOverlays,
        boolean likedByMe
) {

    /**
     * JPQL 생성자 표현식이 호출하는 생성자. likedByMe는 쿼리 하나로 알 수 없어
     * (비로그인 조회도 있고, 좋아요 여부는 별도 테이블이다) 서비스가 나중에 채운다.
     */
    public ShortsResponse(Long id, Long memberId, String memberName, String videoUrl,
                          String thumbnailUrl, String caption, List<String> tags,
                          Integer durationSec, Integer viewCount, Integer likeCount,
                          Integer commentCount, Instant createdAt,
                          String musicKey, boolean muteOriginal, int musicStartSec,
                          List<ShortsOverlayText> overlayTexts,
                          double trimStartSec, Double trimEndSec, ShortsCrop crop,
                          int musicVolume, int videoVolume,
                          double thumbnailTimeSec,
                          List<ShortsOverlayText> thumbnailTextOverlays) {
        this(id, memberId, memberName, videoUrl, thumbnailUrl, caption, tags, durationSec,
                viewCount, likeCount, commentCount, createdAt, musicKey, muteOriginal,
                musicStartSec, overlayTexts, trimStartSec, trimEndSec, crop,
                musicVolume, videoVolume, thumbnailTimeSec, thumbnailTextOverlays, false);
    }

    public ShortsResponse withLikedByMe(boolean liked) {
        return new ShortsResponse(id, memberId, memberName, videoUrl, thumbnailUrl, caption, tags,
                durationSec, viewCount, likeCount, commentCount, createdAt,
                musicKey, muteOriginal, musicStartSec, overlayTexts,
                trimStartSec, trimEndSec, crop, musicVolume, videoVolume,
                thumbnailTimeSec, thumbnailTextOverlays, liked);
    }

    // 업로드 직후 응답용. 방금 올린 영상이므로 좋아요는 눌리지 않은 상태다
    public static ShortsResponse of(Shorts shorts, String memberName) {
        return new ShortsResponse(shorts.getId(), shorts.getMemberId(), memberName,
                shorts.getVideoUrl(), shorts.getThumbnailUrl(), shorts.getCaption(),
                shorts.getTags(), shorts.getDurationSec(), shorts.getViewCount(),
                shorts.getLikeCount(), shorts.getCommentCount(), shorts.getCreatedAt(),
                shorts.getMusicKey(), shorts.isMuteOriginal(), shorts.getMusicStartSec(),
                shorts.getOverlayTexts(),
                shorts.getTrimStartSec(), shorts.getTrimEndSec(), shorts.getCrop(),
                shorts.getMusicVolume(), shorts.getVideoVolume(),
                shorts.getThumbnailTimeSec(), shorts.getThumbnailTextOverlays());
    }
}
