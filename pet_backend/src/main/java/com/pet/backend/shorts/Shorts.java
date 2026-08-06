package com.pet.backend.shorts;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
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

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 올린 사람 (pet_member.id). Pet과 같은 이유로 @ManyToOne 대신 값으로만 보관 — 지연 로딩 함정 회피
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    // Storage에 저장된 mp4 주소
    @Column(name = "video_url", nullable = false, columnDefinition = "text")
    private String videoUrl;

    // 미리보기 이미지. 생성은 5단계 — 그때까지 NULL
    @Column(name = "thumbnail_url", columnDefinition = "text")
    private String thumbnailUrl;

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

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // NULL = 활성. 4단계의 shorts_like/shorts_comment가 이 테이블을 참조하므로 물리 삭제 금지
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private Shorts(Long memberId, String videoUrl, String thumbnailUrl,
                   String caption, List<String> tags, Integer durationSec) {
        this.memberId = memberId;
        this.videoUrl = videoUrl;
        this.thumbnailUrl = thumbnailUrl;
        this.caption = caption;
        // 빈 배열은 NULL로 통일 — 태그를 고르지 않은 것과 빈 목록을 보낸 것을 구분할 이유가 없고,
        // 가이드 5절의 any(s.tags)는 두 경우 모두 매칭되지 않으므로 동작도 같다
        this.tags = (tags == null || tags.isEmpty()) ? null : List.copyOf(tags);
        this.durationSec = durationSec;
        // DB에 default 0이 있지만 JPA는 INSERT문에 이 컬럼들을 포함시키므로
        // 여기서 0을 넣지 않으면 NULL이 들어가 not-null 제약에 걸린다
        this.viewCount = 0;
        this.likeCount = 0;
        this.commentCount = 0;
    }

    // 업로드. memberId는 요청 바디가 아니라 반드시 토큰에서 꺼낸 값이어야 한다 (소유자 격리)
    public static Shorts upload(Long memberId, String videoUrl, String thumbnailUrl,
                                String caption, List<String> tags, Integer durationSec) {
        return new Shorts(memberId, videoUrl, thumbnailUrl, caption, tags, durationSec);
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
