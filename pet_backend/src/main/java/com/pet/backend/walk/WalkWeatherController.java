package com.pet.backend.walk;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 산책 페이지 상단 아스팔트 온도 배너용 날씨 조회. 좌표는 한반도 범위(대략 lat 33~43,
 * lng 124~132)로 제한한다 — 그 밖은 기상청 격자 자체가 의미 없는 값이 나온다.
 */
@RestController
@Validated
@RequiredArgsConstructor
public class WalkWeatherController {

    private final WalkWeatherService walkWeatherService;

    @GetMapping("/api/walk/weather")
    public ApiResponse<WalkWeatherResponse> weather(
            @RequestParam
            @NotNull(message = "lat는 필수입니다.")
            @DecimalMin(value = "33.0", message = "lat는 한반도 범위(33~43)를 벗어났습니다.")
            @DecimalMax(value = "43.0", message = "lat는 한반도 범위(33~43)를 벗어났습니다.")
            Double lat,

            @RequestParam
            @NotNull(message = "lng는 필수입니다.")
            @DecimalMin(value = "124.0", message = "lng는 한반도 범위(124~132)를 벗어났습니다.")
            @DecimalMax(value = "132.0", message = "lng는 한반도 범위(124~132)를 벗어났습니다.")
            Double lng
    ) {
        return ApiResponse.ok(walkWeatherService.getWeather(lat, lng));
    }
}
