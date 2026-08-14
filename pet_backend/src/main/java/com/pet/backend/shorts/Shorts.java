package com.pet.backend.shorts;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 숏츠 영상 한 개의 메타데이터.
 *
 * <p>ddl-auto=validate이므로 JPA가 테이블을 만들지 않는다 — 스키마는 Supabase에서 직접 관리한다.
 * 이 엔티티의 컬럼을 바꾸려면 DB에 DDL을 먼저 적용해야 하고,
 * 맞지 않으면 애플리케이션이 기동하지 않는다(Schema-validation 실패).
 * DDL 원본은 저장소 밖(팀 문서)에 보관한다.
 * 영상 파일(mp4)은 Supabase Storage에 있고 이 테이블은 "어디에 있고 누가 올렸는지"만 보관한다
 * (shorts_guide_1.md 1절 — 서버·DB는 파일을 직접 다루지 않는다).
 */
@Entity
@Table(name = "shorts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Shorts {

    /**
     * 영상 위 글자 개수 상한. 프론트도 같은 값으로 막고, 최종 차단은 여기와
     * {@code ShortsCreateRequest}가 한다.
     *
     * <p>한때 1이었다. 여러 개를 허용했다가 한 화면에 다 넣으니 복잡해져 되돌렸는데,
     * 새 제작 플로우의 ③ 편집 페이지는 텍스트를 <b>바텀시트에서 따로</b> 다루고 미리보기 위에
     * 끌어 놓게 되어 있어 다시 열었다(2026-08-14). 저장 모양이 {@code jsonb} 배열이라
     * 스키마는 그대로 쓴다.
     *
     * <p>5개인 이유: 영상 위에 얹히는 글자라 더 늘리면 화면을 다 덮는다. 이 값을 바꾸면
     * {@code ShortsCreateRequest}의 {@code @Size(max=...)}와 프론트의 상한도 함께 바꿔야 한다.
     */
    static final int MAX_OVERLAY_TEXTS = 5;

    /** 볼륨 상한. DB의 check 제약(shorts_volume.sql)과 같은 값이다 */
    private static final int MAX_VOLUME = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 올린 사람 (pet_member.id). Pet과 같은 이유로 @ManyToOne 대신 값으로만 보관 — 지연 로딩 함정 회피
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /*
     * 영상의 주인공 반려동물은 여기에 없다 — 업로드할 때 고르지만 그 자체를 저장하지는 않고,
     * 고른 반려동물의 품종만 아래 tags에 자동 태그로 합쳐 넣는다 (ShortsService.toTags).
     * "어느 반려동물이 나왔는지"를 조회할 일이 생기면 그때 연결 테이블을 만들면 된다.
     */

    // Storage에 저장된 mp4 주소
    @Column(name = "video_url", nullable = false, columnDefinition = "text")
    private String videoUrl;

    /**
     * 미리보기 이미지(커버) 주소. NULL이면 커버를 굽지 못한 것이고, 그 경우 재생 쪽은
     * 영상 첫 프레임을 그대로 쓴다 — 굽기 실패가 업로드 실패가 되지는 않는다.
     */
    @Column(name = "thumbnail_url", columnDefinition = "text")
    private String thumbnailUrl;

    /**
     * 커버로 쓴 영상 시점(초). 기본은 재생 구간의 시작이다.
     *
     * <p>이미 구워 올린 이미지가 있는데 왜 또 저장하나: 구운 이미지는 되돌릴 수 없다.
     * 나중에 다른 장면으로 바꾸거나 커버 글자를 고치려면 "무엇으로 구웠는지"가 남아 있어야
     * 다시 구울 수 있다.
     */
    @Column(name = "thumbnail_time_sec", nullable = false)
    private double thumbnailTimeSec;

    /**
     * 커버에만 박히는 글자들. <b>{@link #overlayTexts}와 다른 값이다</b> —
     * 그쪽은 재생 중 화면에 뜨는 자막이고, 이쪽은 정지된 커버 사진에 이미 그려져 있다.
     * 한 배열로 합치면 "커버에만 넣고 영상에는 안 넣는다"를 표현할 수 없다.
     *
     * <p>커버 이미지에 이미 그려져 있으므로 재생 쪽은 이 값을 그리지 않는다. 다시 구울 때만 쓴다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "thumbnail_text_overlays", nullable = false, columnDefinition = "jsonb")
    private List<ShortsOverlayText> thumbnailTextOverlays;

    @Column(columnDefinition = "text")
    private String caption;

    /**
     * 분류 태그 (예: {@code {강아지,불독,미용}}). 추천 알고리즘이 "이 사람이 어떤 태그를 좋아하나"를
     * 집계하는 유일한 재료다 (숏츠_추천알고리즘_구현가이드.md 4-b절).
     *
     * <p>단일 category 컬럼이나 콤마 문자열이 아니라 PostgreSQL {@code text[]}로 확정했다 —
     * 가이드 5절의 점수 쿼리가 {@code unnest(s.tags)}로 태그를 펼쳐 한 번에 집계하고
     * {@code tag = any(s.tags)}로 매칭하기 때문이다. 콤마 문자열이면 매번 문자열을 쪼개야 한다.
     * GIN 인덱스({@code idx_shorts_tags})가 이 컬럼에 걸려 있다.
     *
     * <p>기존 영상은 전부 NULL이다(컬럼을 나중에 추가). NULL이어도 조회는 정상이고
     * 태그 부스트만 받지 못한다 — 가이드 2절이 말하는 콜드 스타트 상태다.
     */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private List<String> tags;

    @Column(name = "duration_sec", nullable = false)
    private Integer durationSec;

    // 매번 세면 느리므로 숫자만 미리 보관하는 캐시 컬럼 (shorts_guide_1.md 3절)
    @Column(name = "view_count", nullable = false)
    private Integer viewCount;

    @Column(name = "like_count", nullable = false)
    private Integer likeCount;

    @Column(name = "comment_count", nullable = false)
    private Integer commentCount;

    /**
     * 업로더가 고른 배경음악. Storage의 public {@code music} 버킷 객체 이름이며
     * 유효한 값은 {@link ShortsMusicKeys#ALL} 안에 있다. NULL = 곡을 고르지 않음.
     *
     * <p>URL이 아니라 <b>키</b>를 저장하는 이유: 66곡은 고정 목록이고 URL은 키에서 기계적으로
     * 나온다. 전체 URL을 넣으면 Supabase 프로젝트나 버킷이 바뀔 때 기존 행을 전부 갱신해야 한다.
     * 영상({@code video_url})이 전체 URL인 것과 다른 선택인데, 그쪽은 사용자가 올린 임의 파일이라
     * 카탈로그가 없기 때문이다.
     *
     * <p>제목·아티스트를 함께 저장하지 않는다 — 카탈로그에 있는 값을 복사해두면 표기를 고칠 때
     * 과거 행이 옛 표기로 남는다. 화면이 키로 조회한다 (musicCatalog.js의 findTrack).
     */
    @Column(name = "music_key", columnDefinition = "text")
    private String musicKey;

    /**
     * 영상 원본 소리를 끌지 여부. 업로더가 업로드 화면에서 정한다.
     *
     * <p>BGM과 독립이다 — 넷 다 가능하다. (곡O·음소거O = 음악만 / 곡O·음소거X = 원본+음악 /
     * 곡X·음소거X = 원본만 / 곡X·음소거O = 무음). 자동으로 묶지 않은 이유는 짖는 소리를 살리면서
     * 음악을 얹고 싶은 경우와 원본을 완전히 죽이고 싶은 경우가 모두 실제로 있기 때문이다.
     *
     * <p>피드의 음소거 버튼과는 다른 층이다. 그쪽은 <b>보는 사람</b>이 카드 전체 소리를 끄는 것이고,
     * 이 값은 <b>올린 사람</b>이 영상 트랙 자체를 죽여둔 것이라 보는 사람이 되살릴 수 없다.
     */
    @Column(name = "mute_original", nullable = false)
    private boolean muteOriginal;

    /**
     * 곡의 어느 지점부터 쓸지 (초). 인스타 릴스처럼 업로더가 구간을 골라 저장한 값이다.
     *
     * <p>구간의 <b>길이</b>를 따로 저장하지 않는다 — 영상 길이({@code duration_sec})가 곧 구간
     * 길이이기 때문이다. 시작점만 있으면 재생 쪽이 `start ~ start+duration`을 계산할 수 있고,
     * 두 값을 다 저장하면 영상 길이와 어긋나는 조합(구간 10초, 영상 20초)이 생긴다.
     *
     * <p>곡이 없으면({@code music_key} NULL) 항상 0이다. 서비스가 그렇게 정규화한다 —
     * 곡 없이 시작점만 남아 있으면 나중에 곡을 붙일 때 엉뚱한 지점부터 나간다.
     *
     * <p>상한을 DB에서 걸지 않는다. 곡 길이는 서버가 모르는 값이고(파일은 Storage에 있다),
     * 재생 쪽이 곡 끝을 넘는 시작점을 만나면 자연히 소리가 나지 않을 뿐 데이터가 깨지지는 않는다.
     * 화면이 슬라이더 최대값으로 막고, 서버는 음수만 거른다.
     */
    @Column(name = "music_start_sec", nullable = false)
    private int musicStartSec;

    /**
     * 영상 위에 얹는 글자들. 빈 배열 = 넣지 않음. 최대 {@link #MAX_OVERLAY_TEXTS}개.
     *
     * <p>영상 파일에 굽지 않고 <b>표시 시점에 얹는다</b>. 굽으려면 서버에서 ffmpeg로 재인코딩해야
     * 하는데 업로드가 몇 배 느려지고, 무엇보다 오타를 고칠 수 없다. 데이터로 두면 나중에
     * 수정·번역·검색까지 가능하다.
     *
     * <p>캡션({@code caption})과 다른 값이다 — 캡션은 영상 아래 설명이고 이것은 영상 화면 안에
     * 올라간다. 한 필드로 합치면 "화면에 띄우지 않고 설명만 쓰고 싶다"가 표현되지 않는다.
     *
     * <p>{@code text[]}가 아니라 JSONB인 이유: 원소가 문자열 하나가 아니라 (글자, 위치) 묶음이다.
     * 배열 세 개를 나란히 두면(텍스트[], top[], left[]) 길이가 어긋나는 상태가 표현 가능해진다.
     *
     * <p><b>NULL을 쓰지 않고 빈 배열로 통일한다.</b> tags는 NULL을 쓰지만 그쪽은 이미 그렇게
     * 쌓인 데이터가 있어서다. 여기는 새로 만드는 컬럼이라 "없음"의 표현을 하나로 둘 수 있고,
     * 읽는 쪽이 NULL 검사를 하지 않아도 된다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "overlay_texts", nullable = false, columnDefinition = "jsonb")
    private List<ShortsOverlayText> overlayTexts;

    /**
     * 얹은 배경음악의 볼륨 (0~100). 곡이 없으면 의미가 없어 100으로 눌러 저장한다.
     *
     * <p>{@code mute_original} 한 칸으로는 "영상 60 + 음악 40" 같은 섞기를 표현할 수 없어
     * 볼륨을 따로 뒀다(가이드 5-3절). 기존 영상은 전부 100이고 그것은 지금 동작과 같다.
     */
    @Column(name = "music_volume", nullable = false)
    private int musicVolume;

    /**
     * 영상 원본 소리의 볼륨 (0~100).
     *
     * <p>{@link #muteOriginal}과 <b>서로 맞춰서</b> 저장한다 — 0이면 muteOriginal도 true다.
     * 두 값이 어긋나면 재생 쪽이 어느 쪽을 믿어야 할지 알 수 없다. 다만 칼럼이 생기기 전에
     * 올라간 영상은 muteOriginal만 true이고 이 값은 기본 100이라, 재생 쪽은 두 값을 모두 본다.
     */
    @Column(name = "video_volume", nullable = false)
    private int videoVolume;

    /**
     * 재생 시작 지점(초). 업로더가 ② 길이/비율 화면에서 고른 값이다.
     *
     * <p><b>영상 파일은 자르지 않는다</b> — 원본을 그대로 올리고 "어디부터 어디까지 틀지"만
     * 저장한다(가이드 4절 방법 A). 브라우저에서 실제로 컷하려면 ffmpeg.wasm이 필요하고
     * 인코딩이 무거운데, 그렇게까지 할 이유가 아직 없다. {@code music_start_sec}이 곡을
     * 자르지 않고 시작점만 저장하는 것과 같은 판단이다.
     *
     * <p>0이면 원본 처음부터다. 트림 칼럼이 없던 시절에 올라간 영상도 전부 0이라
     * (DDL의 default) 재생 쪽이 예외를 둘 필요가 없다.
     */
    @Column(name = "trim_start_sec", nullable = false)
    private double trimStartSec;

    /**
     * 재생 끝 지점(초). <b>NULL이면 원본 끝까지</b>다.
     *
     * <p>길이가 아니라 끝 지점을 저장한다 — 시작점과 길이를 따로 두면 둘을 더한 값이 원본을
     * 넘는 조합이 표현 가능해진다. 실제 재생 길이는 {@code duration_sec}에 이미 있다.
     *
     * <p>not null + default를 두지 못한 이유: 기본값으로 쓸 "영상 길이"를 DDL이 알 수 없다.
     */
    @Column(name = "trim_end_sec")
    private Double trimEndSec;

    /**
     * 9:16 프레임 안에서 어느 부분을 보여줄지. <b>NULL이면 기본</b>(가운데 cover)이며
     * 지금까지의 표시와 정확히 같다 — 그래서 기존 영상이 그대로 뜬다.
     *
     * <p>기본값과 같은 값이 들어오면 NULL로 눌러 저장한다. "손대지 않음"의 표현이 두 가지가
     * 되는 것을 막는다 ({@code tags}의 빈 배열을 NULL로 통일하는 것과 같은 규칙).
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "crop", columnDefinition = "jsonb")
    private ShortsCrop crop;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // NULL = 활성. 4단계의 shorts_like/shorts_comment가 이 테이블을 참조하므로 물리 삭제 금지
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private Shorts(Long memberId, String videoUrl, String thumbnailUrl, String caption,
                   List<String> tags, Integer durationSec, String musicKey, boolean muteOriginal,
                   int musicStartSec, List<ShortsOverlayText> overlayTexts,
                   double trimStartSec, Double trimEndSec, ShortsCrop crop,
                   int musicVolume, int videoVolume,
                   double thumbnailTimeSec, List<ShortsOverlayText> thumbnailTextOverlays) {
        this.memberId = memberId;
        this.videoUrl = videoUrl;
        this.thumbnailUrl = thumbnailUrl;
        this.caption = caption;
        // 빈 문자열은 NULL로 통일 — "곡 없음"의 표현이 두 가지가 되는 것을 막는다 (tags와 같은 규칙)
        this.musicKey = (musicKey == null || musicKey.isBlank()) ? null : musicKey;
        /*
         * 원본 소리 볼륨과 muteOriginal을 서로 맞춘다. 둘이 어긋나면 재생 쪽이 어느 쪽을
         * 믿어야 할지 알 수 없다 — "볼륨 70인데 음소거"는 표현할 수 있어서는 안 되는 상태다.
         *
         * 세 모드로 고르는 기존 업로드 화면은 muteOriginal만 보내고 볼륨은 보내지 않는다.
         * 그 경우 여기서 0으로 떨어뜨려야 두 값이 같은 뜻이 된다.
         */
        int video = (muteOriginal) ? 0 : clampVolume(videoVolume);
        this.videoVolume = video;
        this.muteOriginal = video == 0;
        // 곡이 없으면 음악 볼륨은 의미가 없다. 기본값으로 눌러 "왜 30이지?" 하는 값이 남지 않게 한다
        this.musicVolume = (this.musicKey == null) ? MAX_VOLUME : clampVolume(musicVolume);
        // 곡이 없으면 시작점도 0으로 눌러둔다 (musicStartSec 주석 참고)
        this.musicStartSec = (this.musicKey == null) ? 0 : Math.max(0, musicStartSec);
        /*
         * 빈 글자를 걸러내고 좌표를 자른 뒤 개수 상한까지 적용한다.
         *
         * 요청 검증(@Size·@NotBlank)이 이미 막지만 여기서 한 번 더 하는 이유: 이 생성자는
         * 컨트롤러를 거치지 않는 경로(테스트·배치 등)에서도 불릴 수 있고, JSONB는 스키마가
         * 강제해주는 것이 없어 이상한 값이 들어가면 조용히 남는다.
         */
        this.overlayTexts = normalizeOverlays(overlayTexts);
        // 빈 배열은 NULL로 통일 — 태그를 고르지 않은 것과 빈 목록을 보낸 것을 구분할 이유가 없고,
        // 가이드 5절의 any(s.tags)는 두 경우 모두 매칭되지 않으므로 동작도 같다
        this.tags = (tags == null || tags.isEmpty()) ? null : List.copyOf(tags);
        this.durationSec = durationSec;
        /*
         * 트림 구간 정규화. 원본 길이를 서버가 모르므로(파일은 Storage에 있다) 상한은 보지 않고
         * "말이 되는 구간인지"만 본다 — 음수 시작점, 시작점보다 앞선 끝 지점을 거른다.
         * 끝이 이상하면 NULL(원본 끝까지)로 눌러 무음·빈 화면 대신 전체 재생이 되게 한다.
         */
        this.trimStartSec = Math.max(0, trimStartSec);
        this.trimEndSec = (trimEndSec == null || trimEndSec <= this.trimStartSec) ? null : trimEndSec;
        // 기본값이면 NULL로 눌러 "손대지 않음"의 표현을 하나로 둔다 (ShortsCrop.isDefault 주석)
        ShortsCrop normalizedCrop = (crop == null) ? null : crop.normalized();
        this.crop = (normalizedCrop == null || normalizedCrop.isDefault()) ? null : normalizedCrop;

        /*
         * 커버 시점은 재생 구간 안이어야 한다. 구간 밖 시점으로 구운 커버는 영상에 없는 장면을
         * 보여주게 되고, 나중에 다시 구울 때도 그 장면이 나온다.
         */
        double end = (this.trimEndSec == null) ? Double.MAX_VALUE : this.trimEndSec;
        this.thumbnailTimeSec = Math.min(Math.max(thumbnailTimeSec, this.trimStartSec), end);
        // 영상 자막과 같은 규칙으로 거른다 (빈 글자 제거·좌표 클램프·개수 상한)
        this.thumbnailTextOverlays = normalizeOverlays(thumbnailTextOverlays);
        // DB에 default 0이 있지만 JPA는 INSERT문에 이 컬럼들을 포함시키므로
        // 여기서 0을 넣지 않으면 NULL이 들어가 not-null 제약에 걸린다
        this.viewCount = 0;
        this.likeCount = 0;
        this.commentCount = 0;
    }

    // 업로드. memberId는 요청 바디가 아니라 반드시 토큰에서 꺼낸 값이어야 한다 (소유자 격리)
    public static Shorts upload(Long memberId, String videoUrl, String thumbnailUrl,
                                String caption, List<String> tags, Integer durationSec,
                                String musicKey, boolean muteOriginal, int musicStartSec,
                                List<ShortsOverlayText> overlayTexts,
                                double trimStartSec, Double trimEndSec, ShortsCrop crop,
                                int musicVolume, int videoVolume,
                                double thumbnailTimeSec,
                                List<ShortsOverlayText> thumbnailTextOverlays) {
        return new Shorts(memberId, videoUrl, thumbnailUrl, caption, tags, durationSec,
                musicKey, muteOriginal, musicStartSec, overlayTexts,
                trimStartSec, trimEndSec, crop, musicVolume, videoVolume,
                thumbnailTimeSec, thumbnailTextOverlays);
    }

    /**
     * 빈 글자를 걸러내고 좌표를 자른 뒤 개수 상한까지 적용한다. 영상 자막과 커버 글자가
     * 같은 규칙을 쓴다 — 저장 모양이 같고, 한쪽만 느슨하면 그쪽으로 이상한 값이 들어간다.
     *
     * <p>요청 검증(@Size·@NotBlank)이 이미 막지만 여기서 한 번 더 하는 이유: 이 생성자는
     * 컨트롤러를 거치지 않는 경로(테스트·배치 등)에서도 불릴 수 있고, JSONB는 스키마가
     * 강제해주는 것이 없어 이상한 값이 들어가면 조용히 남는다.
     */
    private static List<ShortsOverlayText> normalizeOverlays(List<ShortsOverlayText> items) {
        return (items == null)
                ? List.of()
                : items.stream()
                        .filter(Objects::nonNull)
                        .map(ShortsOverlayText::normalized)
                        .filter(item -> !item.isBlank())
                        .limit(MAX_OVERLAY_TEXTS)
                        .toList();
    }

    // DB의 check 제약에 걸려 500이 나기 전에 여기서 자른다 (요청 검증도 있지만 이 생성자는
    // 컨트롤러를 거치지 않는 경로에서도 불릴 수 있다 — normalizeOverlays와 같은 이유)
    private static int clampVolume(int value) {
        return Math.min(MAX_VOLUME, Math.max(0, value));
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /**
     * 소프트 삭제. {@code shorts_like}·{@code shorts_comment}·{@code shorts_event}가 이 행을
     * 참조하므로 물리 삭제하면 FK 위반이 난다 (deleted_at 컬럼을 둔 이유가 그것이다).
     *
     * <p>영상 파일은 Storage에 남긴다. 지우면 이미 캐시된 URL이 깨지는 것 말고도,
     * 잘못 삭제한 경우 되살릴 방법이 없어진다 — 행만 되돌리면 복구되는 상태로 둔다.
     * 보관 기간이 정해지면 삭제된 행의 파일을 일괄 정리하는 쪽이 맞다.
     *
     * <p>이미 삭제된 행에 다시 부르면 시각을 덮어쓰지 않는다. 처음 삭제한 시점이 기록으로서
     * 의미가 있고, 두 번 눌렀다고 그것이 바뀔 이유가 없다.
     */
    public void softDelete(Instant now) {
        if (deletedAt == null) {
            this.deletedAt = now;
        }
    }
}
