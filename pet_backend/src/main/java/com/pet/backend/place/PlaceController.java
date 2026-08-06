package com.pet.backend.place;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 지도 단독 메뉴용 장소 조회. 챗봇(ChatController)과 달리 사용자가 직접 좌표를 지정해
 * 카테고리별(병원/카페/호텔) 장소를 한 번에 조회한다 — 검색/캐시 로직은 PlaceService를 그대로 재사용.
 */
@RestController
@Validated
@RequiredArgsConstructor
public class PlaceController {

    private final PlaceService placeService;

    @GetMapping("/api/places")
    public ApiResponse<PlaceListResponse> search(
            @RequestParam
            @NotNull(message = "lat는 필수입니다.")
            @DecimalMin(value = "-90.0", message = "lat는 -90 이상이어야 합니다.")
            @DecimalMax(value = "90.0", message = "lat는 90 이하이어야 합니다.")
            Double lat,

            @RequestParam
            @NotNull(message = "lng는 필수입니다.")
            @DecimalMin(value = "-180.0", message = "lng는 -180 이상이어야 합니다.")
            @DecimalMax(value = "180.0", message = "lng는 180 이하이어야 합니다.")
            Double lng,

            @RequestParam(required = false) List<PlaceCategory> categories
    ) {
        List<PlaceCategory> targets = (categories == null || categories.isEmpty())
                ? List.of(PlaceCategory.values())
                : categories;

        return ApiResponse.ok(new PlaceListResponse(placeService.searchAll(targets, lat, lng)));
    }
}
