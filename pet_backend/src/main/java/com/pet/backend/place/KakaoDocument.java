package com.pet.backend.place;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 카카오 로컬 검색 결과 한 건. 카카오 응답은 snake_case이므로 필드마다 매핑을 명시한다.
 * x = 경도(lng), y = 위도(lat) — 카카오 API 표기 순서에 주의.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record KakaoDocument(
        @JsonProperty("place_name") String placeName,
        @JsonProperty("category_name") String categoryName,
        @JsonProperty("address_name") String addressName,
        @JsonProperty("road_address_name") String roadAddressName,
        String x,
        String y,
        @JsonProperty("place_url") String placeUrl,
        String phone
) {}
