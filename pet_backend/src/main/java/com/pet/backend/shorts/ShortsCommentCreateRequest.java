package com.pet.backend.shorts;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 댓글 작성 요청.
 *
 * @param parentId 대댓글을 달 대상 댓글의 id. null이면 최상위 댓글.
 *                 대댓글에 또 대댓글은 달 수 없다(2단까지) — 서비스에서 막는다.
 */
public record ShortsCommentCreateRequest(

        @NotBlank(message = "댓글 내용은 필수입니다.")
        @Size(max = 500, message = "댓글은 500자까지 쓸 수 있습니다.")
        String content,

        Long parentId
) {
}
