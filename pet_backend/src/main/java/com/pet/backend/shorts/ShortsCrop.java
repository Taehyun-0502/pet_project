package com.pet.backend.shorts;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

/**
 * 9:16 프레임 안에서 영상의 어느 부분을 보여줄지. {@code shorts.crop} JSONB의 내용이다.
 *
 * <p>{@link ShortsOverlayText}와 같이 엔티티 매핑·요청·응답에 같은 레코드를 쓴다 —
 * 모양이 같은 순수 데이터를 세 벌로 두면 필드를 늘릴 때 한쪽만 고치는 사고가 난다.
 *
 * <p><b>기본값(scale 1, offset 0)은 지금까지의 표시와 정확히 같다</b> — 프레임 가운데에
 * {@code object-fit: cover}로 넣은 모습이다. 그래서 이 값이 NULL인 기존 영상도 그대로 뜬다.
 *
 * <p>서버는 값의 <b>범위만</b> 본다. 실제 한계(얼마나 밀 수 있는지)는 영상의 가로세로 비율에
 * 달려 있는데 서버는 그것을 모른다 — 파일은 Storage에 있고 크기를 알려면 내려받아 디코딩해야
 * 한다. {@code music_start_sec}에서 곡 길이를 서버가 모르는 것과 같은 상황이라 같은 방식으로
 * 다룬다: 정확한 제한은 화면이 걸고, 서버는 말이 안 되는 값만 막는다.
 *
 * @param scale   확대 배율. 1이면 프레임을 꽉 채우는 기본 크기다(그보다 작을 수 없다 —
 *                줄이면 프레임에 빈 자리가 생긴다)
 * @param offsetX 프레임 <b>폭</b>의 몇 배만큼 좌우로 밀지. 음수면 왼쪽, 0이면 가운데.
 *                픽셀이 아닌 이유는 {@link ShortsOverlayText}의 좌표와 같다
 * @param offsetY 프레임 <b>높이</b> 기준으로 위아래. offsetX와 같은 규칙이다
 */
public record ShortsCrop(

        @DecimalMin(value = "1.0", message = "확대 배율은 1 이상이어야 합니다.")
        @DecimalMax(value = "4.0", message = "확대 배율이 너무 큽니다.")
        double scale,

        /*
         * 상한을 넉넉히 잡는다. 실제로 가능한 최대 이동량은 (cover 배율 × scale - 1) / 2 이고,
         * 가로로 아주 긴 영상에 최대 확대를 걸면 4를 넘길 수 있다. 화면이 정확히 자르므로
         * 여기서는 "누가 손으로 만든 요청"만 걸러내면 된다.
         */
        @DecimalMin(value = "-8.0", message = "가로 위치 값이 범위를 벗어났습니다.")
        @DecimalMax(value = "8.0", message = "가로 위치 값이 범위를 벗어났습니다.")
        double offsetX,

        @DecimalMin(value = "-8.0", message = "세로 위치 값이 범위를 벗어났습니다.")
        @DecimalMax(value = "8.0", message = "세로 위치 값이 범위를 벗어났습니다.")
        double offsetY
) {

    private static final double MIN_SCALE = 1.0;
    private static final double MAX_SCALE = 4.0;
    private static final double MAX_OFFSET = 8.0;

    /** 저장 전 정규화 — 범위를 벗어난 값을 자른다 (@DecimalMin/@DecimalMax를 못 거치는 경로 대비) */
    ShortsCrop normalized() {
        return new ShortsCrop(
                clamp(scale, MIN_SCALE, MAX_SCALE),
                clamp(offsetX, -MAX_OFFSET, MAX_OFFSET),
                clamp(offsetY, -MAX_OFFSET, MAX_OFFSET));
    }

    /** 기본값과 같은지. 같으면 NULL로 저장한다 — "손대지 않음"의 표현을 하나로 두기 위해서다 */
    boolean isDefault() {
        return scale == 1.0 && offsetX == 0.0 && offsetY == 0.0;
    }

    private static double clamp(double value, double lo, double hi) {
        if (Double.isNaN(value)) {
            return lo;
        }
        return Math.min(hi, Math.max(lo, value));
    }
}
