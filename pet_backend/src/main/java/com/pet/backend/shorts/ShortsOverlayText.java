package com.pet.backend.shorts;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * 영상 위에 얹는 글자 하나. {@code shorts.overlay_texts} JSONB 배열의 원소다.
 *
 * <p><b>엔티티 매핑과 요청·응답 DTO에 같은 레코드를 쓴다.</b> 모양이 완전히 같은데 세 벌로 두면
 * 필드를 하나 추가할 때 세 곳을 고쳐야 하고 한쪽만 고치는 사고가 난다. 이 값은 JSON 그대로
 * 저장·전달되는 순수 데이터라 경계를 나눌 이유가 없다 (도메인 규칙이 붙으면 그때 나눈다).
 *
 * <p>별도 테이블로 빼지 않은 이유: 이 값은 영상과 함께만 읽히고 따로 조회·집계할 일이 없다.
 * 테이블로 만들면 피드 쿼리에 조인이 늘고 N+1 위험만 생긴다 ({@code tags}를 {@code text[]}로
 * 둔 것과 같은 판단이다).
 *
 * @param text 화면에 뜨는 글자. 줄바꿈하지 않고 프레임을 넘으면 잘린다(표시 쪽 규칙).
 *             100자로 제한하는 이유는 화면 안에 얹히는 글자라 길면 영상을 다 덮기 때문이다 —
 *             설명(caption 500자)과 역할이 달라 상한도 다르다
 * @param top  세로 위치 (0~100, 프레임 높이 기준 %)
 * @param left 가로 위치 (0~100, %). top과 함께 <b>글자 블록의 중심</b> 좌표다 —
 *             표시 쪽이 {@code translate(-50%, -50%)}로 중심을 맞추므로 업로더가 누른 지점에
 *             글자 가운데가 온다. 픽셀이 아니라 %인 이유는 보는 기기마다 프레임 크기가 달라
 *             픽셀로 저장하면 폰에서 맞춘 위치가 데스크톱에서 엉뚱한 곳에 뜨기 때문이다
 * @param color 글자 색 ({@code #rrggbb}). 안 보내면 흰색이다 —
 *              이 필드가 생기기 전에 저장된 글자가 전부 그 경우이고, 그때의 표시가 흰색이었다.
 *              <b>JSONB라 칼럼 변경 없이 필드만 늘렸다</b>(이 저장 모양을 고른 이유가 그것이다).
 *              팔레트를 서버가 강제하지 않는 이유: 색은 취향이라 목록을 닫아 둘 이유가 없고,
 *              닫아 두면 화면에 색을 하나 더할 때마다 서버 배포가 필요해진다. 형식만 본다
 * @param size  글자 크기 배율. 안 보내면 1배 — 이 필드가 생기기 전 글자가 그 경우다.
 *              프레임 폭의 6%가 1배이며, 표시 쪽 네 곳(편집기·커버 시트·커버 굽기·피드)이
 *              모두 그 기준을 쓴다 — 한 곳만 달라지면 맞춰 놓은 글자가 다른 화면에서 어긋난다
 */
public record ShortsOverlayText(

        @NotBlank(message = "빈 텍스트는 넣을 수 없습니다.")
        @Size(max = 100, message = "영상 위 텍스트는 100자까지 넣을 수 있습니다.")
        String text,

        @Min(value = 0, message = "텍스트 세로 위치는 0 이상이어야 합니다.")
        @Max(value = 100, message = "텍스트 세로 위치는 100 이하여야 합니다.")
        int top,

        @Min(value = 0, message = "텍스트 가로 위치는 0 이상이어야 합니다.")
        @Max(value = 100, message = "텍스트 가로 위치는 100 이하여야 합니다.")
        int left,

        @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "글자 색 형식이 올바르지 않습니다. (예: #ffffff)")
        String color,

        /*
         * 글자 크기 **배율**이다. 픽셀이 아닌 이유는 좌표와 같다 — 보는 기기마다 프레임 크기가
         * 달라 픽셀로 저장하면 폰에서 맞춘 글자가 데스크톱에서 깨알같이 나온다.
         * 표시 쪽은 프레임 폭의 6%를 기본(1배)으로 삼고 여기에 이 값을 곱한다.
         *
         * 안 보내면 1배다 — 이 필드가 생기기 전에 저장된 글자가 전부 그 경우이고, 그때의
         * 표시가 곧 1배였다. 원시형이 아니라 Double인 것도 그래서다(원시형이면 안 보낸 값이 0이 된다).
         */
        @DecimalMin(value = "0.5", message = "글자 크기가 너무 작습니다.")
        @DecimalMax(value = "2.5", message = "글자 크기가 너무 큽니다.")
        Double size,

        /*
         * 기울기(도). 글자 블록 **중심**을 축으로 돈다 — 좌표(top/left)가 중심이라 회전축도
         * 같아야 위치를 건드리지 않고 기울일 수 있다.
         *
         * 안 보내면 0도다(이 필드가 생기기 전 글자가 그 경우). -180~180으로 받고, 그 밖의
         * 값은 같은 각도의 다른 표현일 뿐이라 서버가 범위 안으로 감아 넣는다.
         */
        @DecimalMin(value = "-180.0", message = "기울기가 범위를 벗어났습니다.")
        @DecimalMax(value = "180.0", message = "기울기가 범위를 벗어났습니다.")
        Double rotate
) {

    /** 색을 안 보낸 경우(이 필드가 생기기 전 데이터 포함) 쓰는 값 */
    static final String DEFAULT_COLOR = "#ffffff";

    /** 크기를 안 보낸 경우 쓰는 배율. 이 필드가 생기기 전의 표시가 곧 1배였다 */
    static final double DEFAULT_SIZE = 1.0;
    private static final double MIN_SIZE = 0.5;
    private static final double MAX_SIZE = 2.5;

    /** 기울이지 않은 상태 */
    static final double DEFAULT_ROTATE = 0.0;

    /** 저장 전 정규화 — 공백·좌표·색·크기를 모두 저장 가능한 범위로 맞춘다 */
    ShortsOverlayText normalized() {
        return new ShortsOverlayText(
                text == null ? null : text.trim(),
                Math.min(100, Math.max(0, top)),
                Math.min(100, Math.max(0, left)),
                // 같은 색이 #FFFFFF와 #ffffff 두 모양으로 쌓이지 않게 한다
                (color == null || color.isBlank()) ? DEFAULT_COLOR : color.toLowerCase(Locale.ROOT),
                normalizedSize(),
                normalizedRotate());
    }

    private double normalizedSize() {
        if (size == null || Double.isNaN(size)) {
            return DEFAULT_SIZE;
        }
        return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
    }

    /**
     * 각도를 -180~180으로 감아 넣는다. 자르지 않고 감는 이유: 190도와 -170도는 <b>같은 방향</b>이라
     * 잘라 버리면 사용자가 만든 기울기가 엉뚱한 쪽으로 바뀐다.
     */
    private double normalizedRotate() {
        if (rotate == null || Double.isNaN(rotate)) {
            return DEFAULT_ROTATE;
        }
        double wrapped = (rotate + 180) % 360;
        if (wrapped < 0) {
            wrapped += 360;
        }
        return wrapped - 180;
    }

    boolean isBlank() {
        return text == null || text.isBlank();
    }
}
