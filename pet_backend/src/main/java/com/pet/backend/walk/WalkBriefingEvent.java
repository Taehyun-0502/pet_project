package com.pet.backend.walk;

/**
 * 산책 브리핑 판정 결과. 클로드 발송 브리지가 {@code walk_briefing.event} 컬럼을
 * 소문자 코드 그대로 읽으므로({@code 'hot' | 'gap_good' | 'none' | 'skip_no_record'}),
 * Java enum 이름(HOT 등)이 아니라 {@link #code()}가 실제 DB 값이다
 * ({@link WalkBriefingEventConverter}가 변환을 담당 — 루트 CLAUDE.md AI 강아지 관리
 * 비서 Phase v2 계약).
 */
enum WalkBriefingEvent {

    HOT("hot"),
    GAP_GOOD("gap_good"),
    NONE("none"),
    SKIP_NO_RECORD("skip_no_record");

    private final String code;

    WalkBriefingEvent(String code) {
        this.code = code;
    }

    String code() {
        return code;
    }

    static WalkBriefingEvent fromCode(String code) {
        for (WalkBriefingEvent value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("알 수 없는 walk_briefing.event 값: " + code);
    }
}
