package com.pet.backend.place;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 장소 추천 카테고리. 카카오 로컬 API의 category_group_code와 매핑하되,
 * 동물병원/애견카페/애견호텔처럼 카카오 표준 카테고리에 없는 경우를 위해
 * 기본 검색 키워드를 함께 들고 있는다 (category_group_code는 결과를 넓게 걸러내는 보조 필터로만 사용).
 */
@Getter
@RequiredArgsConstructor
public enum PlaceCategory {

    HOSPITAL("동물병원", "HP8"),
    CAFE("애견카페", "CE7"),
    HOTEL("애견호텔", "AD5");

    private final String defaultKeyword;
    private final String kakaoCategoryGroupCode;
}
