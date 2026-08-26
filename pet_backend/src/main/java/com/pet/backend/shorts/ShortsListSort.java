package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import java.util.Locale;

/**
 * 회원별 릴스 목록의 정렬 (docs/api-spec.md 8절).
 *
 * <p><b>피드의 품질점수를 쓰지 않는다.</b> 그 점수에는 시간 감쇠가 들어 있어(가이드 4-a절)
 * 오래된 인기 영상이 아래로 밀리는데, "내 게시물 인기순"에서는 그것이 오답이다 —
 * 사용자는 자기 영상 중 반응이 좋았던 것을 위에서 보고 싶어 한다.
 *
 * <p>인기순에 댓글 수를 섞지 않은 것도 같은 맥락이다. 화면에 보이는 숫자(좋아요)와 순서가
 * 어긋나면 사용자가 왜 그 순서인지 알 수 없다.
 *
 * <p>enum을 {@code @RequestParam}으로 직접 받지 않고 문자열을 여기서 해석하는 이유:
 * 스프링의 기본 enum 변환은 대소문자를 가려서 명세의 소문자 계약({@code sort=latest})이 깨진다.
 */
public enum ShortsListSort {

    /** 최신순 — {@code id desc}. 기본값이다 */
    LATEST,

    /** 인기순 — {@code like_count desc, id desc} */
    POPULAR;

    /** 값이 없으면 최신순. 목록 밖 값은 400이다 (조용히 최신순으로 떨어뜨리지 않는다 — 오타를 삼키면 화면이 왜 그 순서인지 알 수 없다) */
    static ShortsListSort from(String raw) {
        if (raw == null || raw.isBlank()) {
            return LATEST;
        }
        return switch (raw.trim().toLowerCase(Locale.ROOT)) {
            case "latest" -> LATEST;
            case "popular" -> POPULAR;
            default -> throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "sort는 latest 또는 popular여야 합니다.");
        };
    }
}
