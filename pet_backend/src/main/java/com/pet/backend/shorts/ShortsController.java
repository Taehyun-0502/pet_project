package com.pet.backend.shorts;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

// 조회(GET)는 공개, 쓰기(POST)는 인증 필요 — SecurityConfig에서 GET만 permitAll 했다
@RestController
@RequiredArgsConstructor
public class ShortsController {

    private final ShortsService shortsService;
    private final ShortsCommentService commentService;

    /**
     * 피드 조회. 공개 경로이므로 로그인하지 않은 요청도 들어온다 —
     * 그 경우 memberId는 null이고 응답의 likedByMe는 모두 false가 된다.
     *
     * <p>정렬은 품질점수순이다(B단계). 다음 페이지는 커서가 아니라
     * <b>지금까지 받은 id를 제외</b>하는 방식으로 요청한다 — 점수 순서는 id 순서와 무관해서
     * 커서가 성립하지 않는다(숏츠_추천알고리즘_구현가이드.md 9절).
     *
     * @param excludeIds 제외할 id. {@code ?excludeIds=3,4,5} 또는 {@code ?excludeIds=3&excludeIds=4}
     *                   둘 다 받는다. 생략하면 첫 페이지
     */
    @GetMapping("/api/shorts")
    public ApiResponse<ShortsFeedResponse> getFeed(
            @AuthenticationPrincipal Long memberId,
            @RequestParam(required = false) List<Long> excludeIds,
            @RequestParam(required = false) Integer limit) {
        return ApiResponse.ok(shortsService.getFeed(memberId, excludeIds, limit));
    }

    /**
     * 영상 한 건 조회. 공유 링크로 들어온 사람이 그 영상을 보게 하는 용도다.
     * 피드와 같이 <b>공개 조회</b>다 — 링크를 받은 사람이 로그인해야 열린다면 공유가 의미를 잃는다.
     */
    @GetMapping("/api/shorts/{shortId}")
    public ApiResponse<ShortsResponse> getOne(@AuthenticationPrincipal Long memberId,
                                              @PathVariable Long shortId) {
        return ApiResponse.ok(shortsService.getOne(memberId, shortId));
    }

    /**
     * 영상 삭제. 올린 사람만 지울 수 있고, 남의 영상이면 404다(403이 아닌 이유는
     * {@link ShortsService#delete} 주석 참고). 소프트 삭제라 좋아요·댓글은 그대로 남는다.
     */
    @DeleteMapping("/api/shorts/{shortId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Long memberId,
                                    @PathVariable Long shortId) {
        shortsService.delete(memberId, shortId);
        return ApiResponse.ok();
    }

    // 영상 좋아요 토글 (이미 눌렀으면 취소)
    @PostMapping("/api/shorts/{shortId}/like")
    public ApiResponse<LikeToggleResponse> toggleLike(@AuthenticationPrincipal Long memberId,
                                                      @PathVariable Long shortId) {
        return ApiResponse.ok(shortsService.toggleLike(memberId, shortId));
    }

    // 댓글 목록. 피드와 같이 공개 조회다
    @GetMapping("/api/shorts/{shortId}/comments")
    public ApiResponse<ShortsCommentListResponse> getComments(@AuthenticationPrincipal Long memberId,
                                                              @PathVariable Long shortId) {
        return ApiResponse.ok(commentService.list(shortId, memberId));
    }

    // 댓글/대댓글 작성. parentId를 주면 대댓글이 된다 (대댓글에 또 답글은 불가)
    @PostMapping("/api/shorts/{shortId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ShortsCommentResponse> writeComment(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long shortId,
            @Valid @RequestBody ShortsCommentCreateRequest request) {
        return ApiResponse.ok(commentService.write(memberId, shortId, request));
    }

    // 댓글 좋아요 토글. 경로에 shortId가 없는 이유: commentId만으로 대상이 정해진다
    @PostMapping("/api/shorts/comments/{commentId}/like")
    public ApiResponse<LikeToggleResponse> toggleCommentLike(@AuthenticationPrincipal Long memberId,
                                                             @PathVariable Long commentId) {
        return ApiResponse.ok(commentService.toggleLike(memberId, commentId));
    }

    /**
     * 영상 파일 업로드. 프론트가 Storage에 직접 올리지 않고 이 서버를 거친다 —
     * 쓰기 권한(service-role 키)을 서버만 갖기 위한 구조다 (shorts_guide_1.md 8-7절).
     * 응답의 videoUrl을 아래 POST /api/shorts에 실어 보내면 등록이 끝난다.
     */
    @PostMapping(value = "/api/shorts/video", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ShortsVideoResponse> uploadVideo(@AuthenticationPrincipal Long memberId,
                                                        @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(shortsService.uploadVideo(memberId, file));
    }

    /**
     * 커버(썸네일) 이미지 업로드. 영상과 같은 이유로 이 서버를 거친다.
     *
     * <p>영상과 엔드포인트를 나눈 이유: 허용 형식·크기 상한이 전혀 다르다(jpeg 2MB vs 영상 50MB).
     * 한 곳에서 둘 다 받으면 "무엇을 올리는지"에 따라 갈라지는 검사가 한 덩어리로 뭉친다.
     *
     * <p>실패해도 발행을 막지 말아야 한다 — 커버가 없으면 재생 쪽이 첫 프레임을 쓰면 된다.
     * 그 판단은 화면이 한다(여기서는 그냥 오류를 돌려준다).
     */
    @PostMapping(value = "/api/shorts/thumbnail", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ShortsThumbnailResponse> uploadThumbnail(
            @AuthenticationPrincipal Long memberId,
            @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(shortsService.uploadThumbnail(memberId, file));
    }

    // memberId는 JwtAuthenticationFilter가 토큰에서 꺼내 실어준 값
    @PostMapping("/api/shorts")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ShortsResponse> upload(@AuthenticationPrincipal Long memberId,
                                              @Valid @RequestBody ShortsCreateRequest request) {
        return ApiResponse.ok(shortsService.upload(memberId, request));
    }
}
