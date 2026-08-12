package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 댓글과 댓글 좋아요. 댓글은 <b>대댓글까지 2단</b>만 허용한다.
 * 영상 자체의 좋아요는 {@link ShortsService#toggleLike}에 있다.
 */
@Service
@RequiredArgsConstructor
public class ShortsCommentService {

    private final ShortsCommentRepository commentRepository;
    private final ShortsCommentLikeRepository commentLikeRepository;
    private final ShortsRepository shortsRepository;
    private final MemberRepository memberRepository;
    private final ShortsEventService eventService;

    /**
     * 한 영상의 댓글 목록. 로그인 없이도 볼 수 있다.
     *
     * <p>댓글 전체를 한 번에 받아 서비스에서 부모/자식으로 묶는다. 2단 구조라 깊이가 정해져 있어
     * 최상위를 조회한 뒤 각자의 대댓글을 다시 조회하는 방식(N+1)보다 낫다.
     *
     * @param viewerId 보는 사람. 비로그인이면 null이고, 이때 likedByMe는 모두 false다
     */
    @Transactional(readOnly = true)
    public ShortsCommentListResponse list(Long shortId, Long viewerId) {
        if (!shortsRepository.existsByIdAndDeletedAtIsNull(shortId)) {
            throw new BusinessException(ErrorCode.SHORTS_NOT_FOUND);
        }

        List<ShortsCommentRow> rows = commentRepository.findRowsByShortId(shortId);
        Set<Long> likedIds = findLikedIds(rows, viewerId);

        // 오래된 순으로 정렬돼 있어 부모가 항상 자식보다 먼저 나온다 → 한 번 훑으면서 묶을 수 있다
        Map<Long, List<ShortsCommentResponse>> repliesByParent = new LinkedHashMap<>();
        List<ShortsCommentRow> topLevels = new ArrayList<>();
        for (ShortsCommentRow row : rows) {
            if (row.parentId() == null) {
                topLevels.add(row);
            } else {
                repliesByParent
                        .computeIfAbsent(row.parentId(), key -> new ArrayList<>())
                        .add(ShortsCommentResponse.of(row, likedIds.contains(row.id()), List.of()));
            }
        }

        List<ShortsCommentResponse> items = topLevels.stream()
                .map(row -> ShortsCommentResponse.of(row, likedIds.contains(row.id()),
                        repliesByParent.getOrDefault(row.id(), List.of())))
                .toList();

        // totalCount는 대댓글까지 포함한 수 — 화면의 "댓글 N" 표시에 쓴다
        return new ShortsCommentListResponse(items, rows.size());
    }

    /**
     * 댓글 작성. parentId가 있으면 대댓글이 된다.
     *
     * <p>검증 3가지: 영상이 살아있는지, 부모 댓글이 같은 영상의 것인지,
     * 그리고 <b>부모가 이미 대댓글이 아닌지</b>(2단 초과 금지).
     * 마지막 규칙은 부모의 부모를 봐야 하므로 DB CHECK로 표현할 수 없어 여기서 막는다.
     */
    @Transactional
    public ShortsCommentResponse write(Long memberId, Long shortId, ShortsCommentCreateRequest request) {
        if (!shortsRepository.existsByIdAndDeletedAtIsNull(shortId)) {
            throw new BusinessException(ErrorCode.SHORTS_NOT_FOUND);
        }

        // 응답에 작성자 이름·프로필 사진이 필요하고, 탈퇴 회원의 작성을 막는 검사도 겸한다
        Member member = memberRepository.findById(memberId)
                .filter(found -> !found.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Long parentId = request.parentId();
        if (parentId != null) {
            ShortsComment parent = commentRepository.findByIdAndDeletedAtIsNull(parentId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.SHORTS_COMMENT_NOT_FOUND));
            if (!parent.getShortId().equals(shortId)) {
                throw new BusinessException(ErrorCode.SHORTS_COMMENT_NOT_FOUND,
                        "다른 영상의 댓글에는 답글을 달 수 없습니다.");
            }
            if (parent.isReply()) {
                throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                        "답글에는 다시 답글을 달 수 없습니다.");
            }
        }

        ShortsComment comment = ShortsComment.write(shortId, memberId, parentId, request.content().trim());
        commentRepository.save(comment);
        // 피드에 보여줄 댓글 수 캐시 갱신 (대댓글도 하나로 센다)
        shortsRepository.increaseCommentCount(shortId);
        // 추천 알고리즘용 행동 이력 (가이드 2절 ③). 댓글은 가중치 4.0으로 좋아요보다 강한 신호다.
        // 대댓글도 같은 영상에 대한 관심이므로 구분하지 않고 기록한다
        eventService.recordInteraction(memberId, shortId, ShortsEventType.COMMENT);

        // 방금 쓴 댓글이므로 좋아요는 없고 답글도 없다
        return new ShortsCommentResponse(comment.getId(), member.getName(), member.getProfileImageUrl(),
                comment.getContent(), comment.getLikeCount(), false, comment.getCreatedAt(), List.of());
    }

    /** 댓글 좋아요 토글. 영상 좋아요와 같은 방식이다 (ShortsService.toggleLike 참고). */
    @Transactional
    public LikeToggleResponse toggleLike(Long memberId, Long commentId) {
        if (commentRepository.findByIdAndDeletedAtIsNull(commentId).isEmpty()) {
            throw new BusinessException(ErrorCode.SHORTS_COMMENT_NOT_FOUND);
        }

        boolean liked;
        if (commentLikeRepository.deleteByCommentIdAndMemberId(commentId, memberId) > 0) {
            commentRepository.decreaseLikeCount(commentId);
            liked = false;
        } else {
            commentLikeRepository.save(ShortsCommentLike.of(commentId, memberId));
            commentRepository.increaseLikeCount(commentId);
            liked = true;
        }

        return new LikeToggleResponse(liked, commentRepository.findLikeCount(commentId));
    }

    // 댓글마다 "내가 좋아요했나"를 물으면 N+1이므로 id 목록으로 한 번에 조회한다
    private Set<Long> findLikedIds(List<ShortsCommentRow> rows, Long viewerId) {
        if (viewerId == null || rows.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(commentLikeRepository.findLikedCommentIds(
                viewerId, rows.stream().map(ShortsCommentRow::id).toList()));
    }
}
