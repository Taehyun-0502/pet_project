package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;

/**
 * 회원별 릴스 목록의 커서 (docs/api-spec.md 8절). 클라이언트에게는 불투명 문자열로 나가고
 * 해석은 여기서만 한다 — 형식을 바꿔도 프론트를 고치지 않기 위한 경계다.
 *
 * <p><b>정렬마다 구성이 다르다.</b> 최신순은 {@code id} 하나로 충분하지만, 인기순은 좋아요 수가
 * 같은 영상이 흔해서 {@code likeCount}만으로는 경계가 정해지지 않는다 — 동점 구간에서 항목이
 * 중복되거나 통째로 건너뛰어진다. 그래서 {@code (likeCount, id)} 두 값을 함께 싣는다.
 *
 * @param likeCount 인기순에서만 의미가 있다. 최신순 커서에서는 0이며 쿼리도 이 값을 보지 않는다
 */
record ShortsListCursor(int likeCount, long id) {

    // 두 값을 한 문자열에 담는 구분자. id·likeCount 모두 숫자라 이 문자가 값에 나타날 일이 없다
    private static final char SEPARATOR = '_';

    /**
     * 요청으로 받은 커서를 푼다. 값이 없으면(첫 페이지) null을 돌려준다.
     *
     * <p>형식이 깨졌으면 400이다. 조용히 첫 페이지로 되돌리지 않는 이유: 스크롤 도중 커서가
     * 깨지면 사용자는 같은 목록을 다시 보게 되는데, 그것이 정상 동작인지 사고인지 알 수 없다.
     */
    static ShortsListCursor parse(ShortsListSort sort, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.trim();
        try {
            if (sort == ShortsListSort.LATEST) {
                return new ShortsListCursor(0, Long.parseLong(value));
            }
            int separator = value.indexOf(SEPARATOR);
            if (separator < 0) {
                throw new NumberFormatException(value);
            }
            return new ShortsListCursor(
                    Integer.parseInt(value.substring(0, separator)),
                    Long.parseLong(value.substring(separator + 1)));
        } catch (NumberFormatException e) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "cursor 값이 올바르지 않습니다. 직전 응답의 nextCursor를 그대로 보내주세요.");
        }
    }

    /** 이번 페이지의 <b>마지막</b> 항목으로 다음 커서를 만든다 — 그 뒤부터가 다음 페이지다 */
    static String format(ShortsListSort sort, ShortsSummaryResponse last) {
        if (sort == ShortsListSort.LATEST) {
            return String.valueOf(last.id());
        }
        return last.likeCount() + String.valueOf(SEPARATOR) + last.id();
    }
}
