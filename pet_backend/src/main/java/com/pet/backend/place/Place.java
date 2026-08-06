package com.pet.backend.place;

/**
 * 카카오 로컬 검색 결과를 앱 내부 표현으로 옮긴 응답 DTO.
 * 카카오 원본 응답을 그대로 노출하지 않고 필요한 필드만 담는다.
 */
public record Place(
        String name,
        PlaceCategory category,
        double lat,
        double lng,
        String address,
        String placeUrl
) {}
