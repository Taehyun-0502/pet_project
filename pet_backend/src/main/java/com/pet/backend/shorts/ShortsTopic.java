package com.pet.backend.shorts;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * 영상 주제 — <b>고정 목록 14종</b> (숏츠_태그_설계.md 2절).
 *
 * <p>개인 취향을 가르는 것은 "무엇을(주제)"이다. 같은 강아지가 서울에서 찍은 영상이라도
 * 산책 / 미용 / 훈련이면 완전히 다른 콘텐츠다.
 *
 * <p><b>왜 자유 입력이 아니라 고정 목록인가</b> — 개인화 선호도는 태그 <b>문자열이 정확히
 * 같을 때만</b> 합산된다(구현가이드 5절 {@code tag = any(s.tags)}). 자유 입력을 허용하면
 * '귀여움'/'귀여워'/'큐트'가 서로 다른 태그가 되어 선호도가 흩어지고, 영상이 늘어날수록
 * 태그당 데이터가 희박해져 개인화가 작동하지 않는다. 나중에 LLM이 주제를 제안하게 될 때도
 * (설계 6절) 목록 밖 값을 걸러내야 하므로, 그 목록의 단일 출처가 여기다.
 *
 * <p><b>프론트에도 같은 14개가 있다</b>({@code ShortsUploadPage.jsx}의 {@code TOPICS}).
 * 목록을 고칠 때 양쪽을 함께 고쳐야 하며, 최종 차단은 서버인 이 enum이다.
 *
 * <p>10~13개 큰 덩어리로 시작한다. 잘게 쪼개면 태그가 흩어져 개인화 데이터가 희박해지고
 * 선택도 번거롭다. 실제 업로드를 보고 특정 주제가 몰리면 그때 추가·분할한다(설계 2절).
 */
public enum ShortsTopic {

    // ───── 핵심 활동/일상 ─────
    DAILY("일상/브이로그"),
    OUTDOOR("산책/야외/여행"),
    PLAY("놀이"),
    FOOD("먹방/간식"),
    GROOMING("미용"),

    // ───── 케어/정보 ─────
    TRAINING("훈련/교육"),
    /** 질병예측 기능과 직결되는 주제 — 이 선호가 높은 사용자는 나중에 교차 활용 가능 (설계 7절) */
    HEALTH("건강/의료"),
    REVIEW("정보/리뷰"),

    // ───── 감성/포맷 ─────
    CUTE("귀여움"),
    FUNNY("개그/밈"),
    CHALLENGE("챌린지/트렌드"),
    TOUCHING("감동/성장"),
    MUSIC("노래/음악"),

    // ───── 커뮤니티 ─────
    ADOPTION("입양/구조");

    /** DB의 {@code shorts.tags}에 그대로 들어가는 문자열. 개인화 쿼리가 이 값으로 매칭한다 */
    private final String label;

    ShortsTopic(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 클라이언트가 보낸 문자열을 매핑한다. 목록 밖이면 비어 있는 Optional */
    public static Optional<ShortsTopic> from(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String normalized = value.trim();
        return Arrays.stream(values())
                .filter(topic -> topic.label.equals(normalized))
                .findFirst();
    }

    /** 에러 메시지에 실을 전체 목록 */
    public static List<String> labels() {
        return Arrays.stream(values()).map(ShortsTopic::label).toList();
    }
}
