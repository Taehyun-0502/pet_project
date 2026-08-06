package com.pet.backend.shorts;

import jakarta.persistence.Column;
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
 * 댓글. parentId가 NULL이면 최상위 댓글, 값이 있으면 대댓글이다.
 *
 * <p><b>2단(댓글 → 대댓글)까지만 허용한다.</b> 대댓글에 또 대댓글을 다는 것은 막는데,
 * 이 규칙은 DB CHECK로 표현할 수 없어(부모의 부모를 조회해야 한다)
 * {@code ShortsCommentService.write}에서 검증한다.
 */
@Entity
@Table(name = "shorts_comment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShortsComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "short_id", nullable = false)
    private Long shortId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    // NULL = 최상위 댓글
    @Column(name = "parent_id")
    private Long parentId;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    // 매번 세지 않기 위한 캐시. 좋아요 토글 시 +1/-1 한다
    @Column(name = "like_count", nullable = false)
    private Integer likeCount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // NULL = 활성. 대댓글이 부모를 참조하므로 물리 삭제 금지
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private ShortsComment(Long shortId, Long memberId, Long parentId, String content) {
        this.shortId = shortId;
        this.memberId = memberId;
        this.parentId = parentId;
        this.content = content;
        // DB에 default 0이 있어도 JPA는 INSERT문에 이 컬럼을 포함시키므로 여기서 채워야 한다
        this.likeCount = 0;
    }

    // memberId는 요청 바디가 아니라 반드시 토큰에서 꺼낸 값이어야 한다 (작성자 위조 방지)
    public static ShortsComment write(Long shortId, Long memberId, Long parentId, String content) {
        return new ShortsComment(shortId, memberId, parentId, content);
    }

    public boolean isReply() {
        return parentId != null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
