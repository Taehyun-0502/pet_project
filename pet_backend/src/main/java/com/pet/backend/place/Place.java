package com.pet.backend.place;

/**
 * 카카오 로컬 검색 결과를 앱 내부 표현으로 옮긴 응답 DTO.
 * 카카오 원본 응답을 그대로 노출하지 않고 필요한 필드만 담는다.
 *
 * phone·categoryDetail은 장소 상세 팝업 강화(2026-08-06 확정)를 위해 추가 —
 * 카카오 응답에 값이 없으면 빈 문자열로 채운다(널 대신 — 프론트에서 별도 null 처리 불필요).
 * 챗봇 응답(ChatResponse.places)과 지도 API(GET /api/places) 양쪽이 이 record를 공유하므로
 * 두 경로 모두 자동으로 반영된다.
 */
public record Place(
        String name,
        PlaceCategory category,
        double lat,
        double lng,
        String address,
        String placeUrl,
        String phone,
        String categoryDetail
) {}
