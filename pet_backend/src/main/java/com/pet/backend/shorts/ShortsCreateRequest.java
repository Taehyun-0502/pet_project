package com.pet.backend.shorts;

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
        Integer durationSec
) {
}
