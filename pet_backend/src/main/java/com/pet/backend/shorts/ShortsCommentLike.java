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

// 댓글 좋아요. ShortsLike와 같은 구조 — 취소는 행 삭제
@Entity
@Table(name = "shorts_comment_like")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShortsCommentLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "comment_id", nullable = false)
    private Long commentId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private ShortsCommentLike(Long commentId, Long memberId) {
        this.commentId = commentId;
        this.memberId = memberId;
    }

    public static ShortsCommentLike of(Long commentId, Long memberId) {
        return new ShortsCommentLike(commentId, memberId);
    }
}
