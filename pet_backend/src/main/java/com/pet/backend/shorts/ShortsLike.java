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
 * 영상 좋아요. 취소는 행을 지우는 것이므로 소프트 삭제 컬럼이 없다 —
 * 참조하는 다른 테이블이 없고, "누른 적 있음"의 이력을 남길 필요도 없다.
 *
 * <p>(short_id, member_id) UNIQUE 제약이 DB에 있어 중복 좋아요는 최종적으로 DB가 막는다.
 */
@Entity
@Table(name = "shorts_like")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShortsLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "short_id", nullable = false)
    private Long shortId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private ShortsLike(Long shortId, Long memberId) {
        this.shortId = shortId;
        this.memberId = memberId;
    }

    public static ShortsLike of(Long shortId, Long memberId) {
        return new ShortsLike(shortId, memberId);
    }
}
