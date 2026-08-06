package com.pet.backend.shorts;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.URL;

/**
 * 업로드 등록 요청 (shorts_guide_1.md 4절).
 * 영상 파일 자체는 이 요청에 담기지 않는다 — 파일은 Storage에 올린 뒤 그 URL만 보낸다.
 *
 * <p>memberId는 요청 바디에 없다. 반드시 토큰에서 꺼낸 값을 쓴다 (Pet과 같은 소유자 격리 원칙).
 */
public record ShortsCreateRequest(

        @NotBlank(message = "영상 주소는 필수입니다.")
        @URL(message = "영상 주소 형식이 올바르지 않습니다.")
        String videoUrl,

        // 썸네일 생성은 5단계 — 그때까지는 비어 있어도 된다
        @URL(message = "썸네일 주소 형식이 올바르지 않습니다.")
        String thumbnailUrl,

        @Size(max = 500, message = "설명은 500자까지 쓸 수 있습니다.")
        String caption,

        // 5~30초 규칙. 가이드(shorts_guide_1.md 5절)의 15초 하한을 5초로 완화한 값이다.
        // 프론트에서도 같은 규칙으로 검사하지만 최종 차단은 서버
        @NotNull(message = "영상 길이는 필수입니다.")
        @Min(value = 5, message = "5초 이상 영상만 올릴 수 있습니다.")
        @Max(value = 30, message = "30초 이하 영상만 올릴 수 있습니다.")
        Integer durationSec
) {
}
