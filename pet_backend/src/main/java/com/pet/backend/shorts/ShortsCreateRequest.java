package com.pet.backend.shorts;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.hibernate.validator.constraints.URL;

/**
 * 업로드 등록 요청 (shorts_guide_1.md 4절).
 * 영상 파일 자체는 이 요청에 담기지 않는다 — 파일은 Storage에 올린 뒤 그 URL만 보낸다.
 *
 * <p>memberId는 요청 바디에 없다. 반드시 토큰에서 꺼낸 값을 쓴다 (Pet과 같은 소유자 격리 원칙).
 */
public record ShortsCreateRequest(

        /*
         * 영상의 주인공 반려동물들. 한 영상에 여러 마리가 나올 수 있어 목록으로 받는다.
         * 선택 사항이라 null이나 빈 목록이면 그냥 고르지 않은 것이다 — 반려동물을 등록하지 않은
         * 회원도 올릴 수 있어야 하므로 필수로 만들지 않는다.
         *
         * 이 id들 자체는 저장되지 않는다 — 고른 반려동물의 품종만 shorts.tags에 자동 태그로
         * 합쳐진다 (숏츠_태그_설계.md 5절). 즉 "어느 반려동물이 나왔는지"는 남지 않는다.
         * 전부 내 반려동물이 맞는지는 ShortsService.upload가 확인한다 — 하나라도 남의 것이면 404다.
         *
         * 개수 상한을 두지 않는 이유: 소유자 검증을 통과한 id만 태그가 되므로 자기 반려동물 수를
         * 넘어설 수 없고(중복은 걸러진다), 그 수 자체가 현실적인 상한이다.
         */
        List<Long> petIds,

        @NotBlank(message = "영상 주소는 필수입니다.")
        @URL(message = "영상 주소 형식이 올바르지 않습니다.")
        String videoUrl,

        // 썸네일 생성은 5단계 — 그때까지는 비어 있어도 된다
        @URL(message = "썸네일 주소 형식이 올바르지 않습니다.")
        String thumbnailUrl,

        @Size(max = 500, message = "설명은 500자까지 쓸 수 있습니다.")
        String caption,

        /*
         * 영상 주제. 추천 알고리즘이 개인 취향을 집계하는 재료다 (숏츠_태그_설계.md 1절).
         * 없어도 등록은 되지만 태그 부스트를 받지 못한다.
         *
         * 값은 ShortsTopic의 고정 목록 13종 안에 있어야 한다 — 검증은 ShortsService.toTags에서
         * 하고, 여기서는 개수 상한과 빈 문자열만 본다. enum 매핑 실패 메시지에 허용 목록을
         * 함께 실어주려면 서비스 쪽이 편하기 때문이다.
         *
         * 개수 상한을 두는 이유: 주제를 많이 달면 모든 취향에 걸려 부스트를 독식한다.
         * 개별 원소 제약은 컨테이너 요소 제약으로 검사한다 — List에 @Size만 붙이면
         * 개수만 보고 원소는 보지 않아 공백 문자열이 그대로 들어간다.
         *
         * 이름이 tags가 아니라 topics인 이유: 최종 shorts.tags는 "주제 + (나중에) 자동 태그"의
         * 합집합이고, 클라이언트가 보내는 것은 그중 주제뿐이다 (설계 5절).
         */
        @Size(max = 5, message = "주제는 5개까지 선택할 수 있습니다.")
        List<
                @NotBlank(message = "빈 주제는 넣을 수 없습니다.")
                @Size(max = 30, message = "주제 이름이 너무 깁니다.")
                String> topics,

        // 5~30초 규칙. 가이드(shorts_guide_1.md 5절)의 15초 하한을 5초로 완화한 값이다.
        // 프론트에서도 같은 규칙으로 검사하지만 최종 차단은 서버
        @NotNull(message = "영상 길이는 필수입니다.")
        @Min(value = 5, message = "5초 이상 영상만 올릴 수 있습니다.")
        @Max(value = 30, message = "30초 이하 영상만 올릴 수 있습니다.")
        Integer durationSec,

        /*
         * 배경음악 키. 선택 사항이라 null이면 곡 없이 올린 것이다.
         *
         * 값은 ShortsMusicKeys.ALL(로열티 프리 66곡) 안에 있어야 하고 검증은 ShortsService가 한다 —
         * topics를 서비스에서 검증하는 것과 같은 이유로, 목록 밖 값이면 "알 수 없는 음원"이라는
         * 메시지를 담아 400을 준다. 목록을 닫아두지 않으면 존재하지 않는 음원을 가리키는 영상이
         * 생기고 피드에서 조용히 무음이 된다.
         *
         * URL이 아니라 키를 받는 이유는 Shorts.musicKey 주석 참고. URL을 받으면 클라이언트가
         * 임의 외부 주소를 넣을 수 있어 저작권 통제가 무너진다 — 애초에 이 기능의 목적이
         * "저작권 없는 음원만 쓰게 한다"는 것이다.
         */
        @Size(max = 200, message = "음원 키가 너무 깁니다.")
        String musicKey,

        /*
         * 영상 원본 소리를 끌지. null이면 false(원본 소리 유지)로 본다 — 기본값을 "끄지 않음"으로
         * 두는 이유는 이 필드를 보내지 않던 기존 클라이언트의 동작이 바뀌지 않게 하기 위함이다.
         *
         * boolean(원시형)이 아니라 Boolean인 것도 그래서다. 원시형이면 잭슨이 null을 false로
         * 바꿔주지만, 그러면 "안 보냄"과 "false를 보냄"을 서버가 구분할 수 없다.
         */
        Boolean muteOriginal,

        /*
         * 곡의 어느 지점부터 쓸지 (초). 인스타 릴스처럼 화면에서 슬라이더로 고른 값이다.
         * 곡을 고르지 않았으면 무의미하므로 서비스가 0으로 눌러 저장한다.
         *
         * 상한을 검증하지 않는 이유: 곡 길이는 서버가 모른다(파일은 Storage에 있고 길이를
         * 읽으려면 다운로드해 디코딩해야 한다). 화면이 슬라이더 최대값으로 막고, 서버는
         * 음수만 거른다 — 곡 끝을 넘는 값이 들어와도 소리가 안 날 뿐 데이터가 깨지지는 않는다.
         *
         * 구간 길이를 함께 받지 않는 것은 영상 길이가 곧 구간 길이이기 때문이다
         * (Shorts.musicStartSec 주석 참고).
         */
        @Min(value = 0, message = "음악 시작 지점은 0초 이상이어야 합니다.")
        Integer musicStartSec,

        /*
         * 영상 위에 얹을 글자. 선택 사항이라 null이나 빈 목록이면 넣지 않은 것이다.
         *
         * **현재 1개까지다** (Shorts.MAX_OVERLAY_TEXTS 주석 참고 — 여러 개를 허용했다가 화면이
         * 복잡해져 되돌렸다). 목록 형태를 유지하는 이유는 저장 모양이 jsonb 배열이고, 다시
         * 여러 개로 열 때 스키마와 API를 그대로 쓸 수 있게 하려는 것이다.
         *
         * 원소별 제약(빈 문자열·길이·좌표 범위)은 컨테이너 요소 제약 @Valid로 검사한다 —
         * List에 @Size만 붙이면 개수만 보고 원소는 보지 않아 빈 글자가 그대로 들어간다
         * (topics의 원소 제약과 같은 방식이다).
         */
        @Size(max = 5, message = "영상 위 텍스트는 5개까지 넣을 수 있습니다.")
        List<@Valid ShortsOverlayText> overlayTexts,

        /*
         * 재생 구간(초). ② 길이/비율 화면에서 고른 값이며 **영상 파일 자체는 자르지 않는다**
         * (가이드 4절 방법 A — Shorts.trimStartSec 주석 참고).
         *
         * 상한을 검증하지 않는 이유는 musicStartSec과 같다: 원본 길이는 서버가 모른다.
         * 화면이 손잡이로 막고, 서버는 음수와 뒤집힌 구간만 거른다.
         *
         * 안 보내면 처음부터 끝까지다 — 이 필드를 모르던 클라이언트의 동작이 바뀌지 않게
         * 원시형이 아니라 Double로 받는다(muteOriginal이 Boolean인 것과 같은 이유).
         */
        @DecimalMin(value = "0.0", message = "구간 시작은 0초 이상이어야 합니다.")
        Double trimStartSec,

        @DecimalMin(value = "0.0", message = "구간 끝은 0초 이상이어야 합니다.")
        Double trimEndSec,

        // 9:16 프레임 안 위치. null이면 기본(가운데 cover)이고 지금까지의 표시와 같다
        @Valid ShortsCrop crop,

        /*
         * 볼륨 0~100 (가이드 5-3절). 안 보내면 100 — 이 필드를 모르던 클라이언트(기존 업로드
         * 화면)의 동작이 바뀌지 않게 하기 위해서다. 그쪽은 muteOriginal만 보내고, 엔티티가
         * 그 값으로 videoVolume을 0으로 맞춘다(Shorts 생성자 주석 참고).
         *
         * "음악만 / 영상만 / 섞기"가 모두 가능하다. 다만 둘 다 0이면 무음 영상이 되는데,
         * 그것을 막는 것은 화면의 몫이다 — 서버가 막으면 "일부러 무음으로 올린다"는 선택까지
         * 함께 사라진다(음소거 모드가 실제로 있었다).
         */
        @Min(value = 0, message = "음악 볼륨은 0 이상이어야 합니다.")
        @Max(value = 100, message = "음악 볼륨은 100 이하여야 합니다.")
        Integer musicVolume,

        @Min(value = 0, message = "영상 소리 볼륨은 0 이상이어야 합니다.")
        @Max(value = 100, message = "영상 소리 볼륨은 100 이하여야 합니다.")
        Integer videoVolume,

        /*
         * 커버로 쓴 영상 시점(초). 안 보내면 재생 구간의 시작이다(엔티티가 구간 안으로 맞춘다).
         * thumbnailUrl에 이미 구운 이미지가 있는데도 이 값을 받는 이유는 나중에 **다시 굽기**
         * 위해서다 — 구운 이미지만으로는 어느 장면이었는지 알 수 없다.
         */
        @DecimalMin(value = "0.0", message = "커버 시점은 0초 이상이어야 합니다.")
        Double thumbnailTimeSec,

        // 커버에만 박히는 글자. 영상 자막(overlayTexts)과 **다른 값**이다 (Shorts 주석 참고)
        @Size(max = 5, message = "커버 텍스트는 5개까지 넣을 수 있습니다.")
        List<@Valid ShortsOverlayText> thumbnailTextOverlays
) {

    /** 볼륨 기본값. 안 보낸 클라이언트는 "원본 그대로"로 본다 */
    private static final int DEFAULT_VOLUME = 100;

    /** 안 보낸 경우를 기본값(원본 소리 유지)으로 접는다. 서비스·엔티티는 원시형만 다루면 된다 */
    public boolean muteOriginalOrDefault() {
        return Boolean.TRUE.equals(muteOriginal);
    }

    /** 안 보낸 경우를 곡 시작점(0초)으로 접는다 */
    public int musicStartSecOrDefault() {
        return musicStartSec == null ? 0 : musicStartSec;
    }

    /** 안 보낸 경우를 빈 목록으로 접는다 — 엔티티는 NULL을 쓰지 않는다 */
    public List<ShortsOverlayText> overlayTextsOrEmpty() {
        return overlayTexts == null ? List.of() : overlayTexts;
    }

    /** 안 보낸 경우를 원본 처음(0초)으로 접는다 */
    public double trimStartSecOrDefault() {
        return trimStartSec == null ? 0 : trimStartSec;
    }

    public int musicVolumeOrDefault() {
        return musicVolume == null ? DEFAULT_VOLUME : musicVolume;
    }

    public int videoVolumeOrDefault() {
        return videoVolume == null ? DEFAULT_VOLUME : videoVolume;
    }

    /** 안 보낸 경우를 구간 시작으로 접는다 — 엔티티가 다시 구간 안으로 자른다 */
    public double thumbnailTimeSecOrDefault() {
        return thumbnailTimeSec == null ? trimStartSecOrDefault() : thumbnailTimeSec;
    }

    public List<ShortsOverlayText> thumbnailTextOverlaysOrEmpty() {
        return thumbnailTextOverlays == null ? List.of() : thumbnailTextOverlays;
    }
}
