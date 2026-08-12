package com.pet.backend.ad;

import com.pet.backend.common.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 광고 배너 조회 (광고배너_구현가이드.md 2절).
 *
 * <p><b>비로그인 공개.</b> 광고는 보는 사람이 누구인지와 무관하고, 배너가 붙을 화면 중에는
 * 숏츠 피드처럼 공개 화면도 있다. SecurityConfig에서 이 GET만 permitAll이다.
 */
@RestController
@RequestMapping("/api/ads")
@RequiredArgsConstructor
public class AdvertisementController {

    private final AdvertisementService adService;

    /**
     * 지금 노출 가능한 광고 <b>목록</b>. 한 개가 아니라 목록인 이유는
     * {@link AdvertisementRepository} 주석 참고 (랜덤 선택은 프론트가 한다).
     *
     * <p>광고가 없으면 빈 배열이다 — 오류가 아니다. 계약이 없거나 전부 기간이 끝난
     * 정상 상태이고, 프론트는 이때 배너를 아예 그리지 않는다.
     */
    @GetMapping
    public ApiResponse<List<AdResponse>> getAds(@RequestParam(required = false) String placement) {
        return ApiResponse.ok(adService.findActiveAds(placement));
    }
}
