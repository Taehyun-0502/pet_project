package com.pet.backend.shorts;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Optional;

/**
 * 행동 이벤트 종류 (숏츠_추천알고리즘_구현가이드.md 1절).
 *
 * <p><b>DB에는 반드시 소문자로 저장한다.</b> {@code @Enumerated(EnumType.STRING)}을 쓰면
 * enum 상수 이름 그대로 {@code 'VIEW'}가 들어가는데, 그러면 두 곳이 조용히 깨진다 —
 * <ul>
 *   <li>부분 인덱스 {@code idx_event_seen ... where type='view'} 가 타지 않아
 *       '이미 본 영상 제외'가 풀 스캔이 된다</li>
 *   <li>가이드 5절 점수 쿼리의 {@code case e.type when 'like' then ... } 이 전부
 *       else 0으로 떨어져 개인화 점수가 항상 0이 된다</li>
 * </ul>
 * 둘 다 예외 없이 "결과만 이상해지는" 종류의 버그라서, 소문자 매핑을 컨버터로 고정했다.
 *
 * <p>가중치는 숏츠_추천알고리즘_구현가이드.md 3-2절에 있고 <b>여기에 상수로 두지 않는다</b> —
 * 점수 계산이 전부 SQL에서 일어나므로, 자바 상수와 SQL 리터럴로 갈라지면 한쪽만 고치는 사고가 난다.
 * 가중치는 관찰하며 조정하는 값이라(같은 문서 3-6절) 한 곳에만 있어야 한다.
 */
public enum ShortsEventType {

    /** 카드가 화면에 떴다. 가중치는 없고 '이미 본 영상' 판별에만 쓴다 (가이드 9절 페이지네이션) */
    VIEW("view"),
    /** 화면에서 벗어났다. watchMs로 완료율을 계산한다 — 알고리즘의 1등 신호 (가이드 3절) */
    WATCH("watch"),
    /** 완료율 20% 미만으로 빨리 넘겼다. 음의 신호 */
    SKIP("skip"),
    /** 좋아요를 눌렀다. ShortsService.toggleLike가 기록한다 */
    LIKE("like"),
    /** 댓글을 썼다. ShortsCommentService.write가 기록한다 */
    COMMENT("comment"),
    /** 공유했다. 공유 버튼 구현 시 연결 예정 */
    SHARE("share");

    private final String dbValue;

    ShortsEventType(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    /** 클라이언트가 보낸 문자열을 매핑한다. 알 수 없는 값이면 비어 있는 Optional */
    public static Optional<ShortsEventType> from(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String normalized = value.trim().toLowerCase();
        return Arrays.stream(values())
                .filter(type -> type.dbValue.equals(normalized))
                .findFirst();
    }

    /**
     * enum ↔ text 변환. 엔티티 필드에 {@code @Convert}로 직접 붙이므로 autoApply를 켜지 않는다
     * (다른 파트가 이 enum을 쓰게 되어도 매핑 방식을 각자 고를 수 있게).
     */
    @Converter
    public static class DbConverter implements AttributeConverter<ShortsEventType, String> {

        @Override
        public String convertToDatabaseColumn(ShortsEventType type) {
            return (type == null) ? null : type.dbValue;
        }

        @Override
        public ShortsEventType convertToEntityAttribute(String value) {
            // DB에 손으로 넣은 알 수 없는 값은 조회 자체를 막지 않고 null로 흘린다 —
            // 통계 테이블이라 한 줄 때문에 피드 조회가 실패하는 것이 더 나쁘다
            return from(value).orElse(null);
        }
    }
}
