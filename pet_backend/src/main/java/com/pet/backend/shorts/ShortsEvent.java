package com.pet.backend.shorts;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 행동 이력 한 줄 = 추천 알고리즘의 연료 (숏츠_추천알고리즘_구현가이드.md 1절).
 *
 * <p><b>shorts_like / shorts_comment와 역할이 다르다.</b> 그쪽은 "현재 상태"(지금 눌려 있나)를
 * 담고 이 테이블은 "행동 이력"(언제 무엇을 했나)을 담는다. 좋아요를 눌렀다 취소하면
 * shorts_like의 행은 사라지지만 여기 남은 like 이벤트는 지우지 않는다 — 취향은 그때 드러났고,
 * 알고리즘이 보는 것은 그 순간의 행동이다.
 *
 * <p>ddl-auto=validate이므로 스키마는 Supabase에서 직접 관리한다. 이 엔티티는 매핑만 담당하고,
 * 컬럼을 바꾸려면 DB에 DDL을 먼저 적용해야 한다 (가이드 12절).
 *
 * <p>소프트 삭제 컬럼이 없다. 이력은 정정 대상이 아니고 참조하는 테이블도 없어서,
 * 보관 기간이 정해지면 created_at 기준으로 일괄 삭제하는 쪽이 맞다 (가이드 12절 개인정보 항목).
 */
@Entity
@Table(name = "shorts_event")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShortsEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 누가. DDL이 nullable인 이유는 비로그인 조회 통계를 담을 여지를 남긴 것이고,
     * 현재 정책은 <b>로그인 사용자만 기록</b>이라 실제로 NULL은 들어오지 않는다.
     * 정책이 바뀌면 SecurityConfig에 POST /api/shorts/*&#47;events permitAll 한 줄만 열면 된다.
     */
    @Column(name = "member_id")
    private Long memberId;

    // 어떤 영상. Shorts와 같은 이유로 @ManyToOne 대신 값으로만 보관 — 지연 로딩 함정 회피
    @Column(name = "short_id", nullable = false)
    private Long shortId;

    // 소문자로 저장된다. 이유는 ShortsEventType 주석 참고 (인덱스·점수 쿼리가 소문자 전제)
    @Convert(converter = ShortsEventType.DbConverter.class)
    @Column(nullable = false, columnDefinition = "text")
    private ShortsEventType type;

    /**
     * 카드에 머문 <b>누적</b> 시청 시간(ms). watch/skip에만 값이 있고 나머지 종류는 NULL이다.
     *
     * <p>완료율 = watchMs / (durationSec*1000) 이 알고리즘의 1등 신호다.
     * 피드가 loop이라 <b>영상 길이를 넘는 값이 정상</b>이고, 1을 넘은 만큼이 재시청을 뜻한다
     * (가이드 3-3절 — 그래서 재시청을 별도 이벤트로 만들지 않는다).
     * 백그라운드 구간은 프론트가 시계를 멈춰 제외한다(가이드 3-4절 ③).
     *
     * <p>여기 값을 자르지 않는 이유: 자르면 재시청 신호가 함께 죽는다. 남용 차단은
     * 점수 쿼리의 {@code least(watch_ms, duration_sec*1000*3)} 백스톱이 담당한다(가이드 3-5절).
     */
    @Column(name = "watch_ms")
    private Integer watchMs;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private ShortsEvent(Long memberId, Long shortId, ShortsEventType type, Integer watchMs) {
        this.memberId = memberId;
        this.shortId = shortId;
        this.type = type;
        this.watchMs = watchMs;
    }

    /**
     * 시청 관련 이벤트. 프론트가 IntersectionObserver로 감지해 보낸다 (가이드 2절 ②).
     *
     * @param type    VIEW / WATCH / SKIP
     * @param watchMs VIEW면 null. WATCH/SKIP이면 화면에 머문 시간
     */
    static ShortsEvent watching(Long memberId, Long shortId, ShortsEventType type, Integer watchMs) {
        return new ShortsEvent(memberId, shortId, type, watchMs);
    }

    /**
     * 상호작용 이벤트. 좋아요·댓글 서비스가 자기 일을 하면서 함께 남긴다 (가이드 2절 ③).
     * 시청 시간과 무관하므로 watchMs는 NULL이다.
     */
    static ShortsEvent interaction(Long memberId, Long shortId, ShortsEventType type) {
        return new ShortsEvent(memberId, shortId, type, null);
    }
}
