package com.pet.backend.shorts;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * 시청 이벤트 기록 요청 (가이드 7절).
 *
 * <p>memberId는 바디에 없다 — JWT에서만 꺼낸다. 남의 취향을 오염시킬 수 있기 때문이다
 * (Shorts 업로드와 같은 소유자 격리 원칙).
 *
 * @param type    view / watch / skip. 대소문자는 서버가 맞춰준다.
 *                like·comment·share는 받지 않는다 (서버가 직접 기록한다 — ShortsEventService 참고)
 * @param watchMs 카드에 머문 <b>누적</b> 시간(ms). watch·skip은 필수, view는 무시된다.
 *                영상이 loop이라 영상 길이를 넘는 값이 정상이다 — 그 초과분이 재시청 신호다
 *                (숏츠_추천알고리즘_구현가이드.md 3-3절)
 */
public record ShortsEventCreateRequest(

        @NotBlank(message = "이벤트 종류는 필수입니다.")
        String type,

        /*
         * 상한 6시간. 이 값이 "점수를 만드는 상한"이 아니라는 점이 중요하다 —
         * 남용(10초 영상에 10분 = 완료율 60)을 막는 것은 점수 쿼리의 백스톱
         * least(watch_ms, duration_sec*1000*3)이고(가이드 3-5절 · 5절), 여기 상한은
         * 애초에 데이터가 아닌 쓰레기값(음수·오버플로·계산 실수)만 거르는 역할이다.
         *
         * 그래서 넉넉히 잡았다. 좁게 잡으면 loop로 오래 본 정상 시청이 400으로 거절돼
         * 가장 값진 신호가 통째로 사라진다. 백그라운드 구간은 프론트가 이미 제외하므로
         * 한 카드에서 6시간이 실제로 쌓이는 경우는 없다. int 컬럼 범위(약 24일)에도 안전하다.
         */
        @Min(value = 0, message = "시청 시간은 0 이상이어야 합니다.")
        @Max(value = 21_600_000, message = "시청 시간이 너무 깁니다.")
        Integer watchMs
) {
}
