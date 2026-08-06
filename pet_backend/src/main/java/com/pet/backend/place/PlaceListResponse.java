package com.pet.backend.place;

import java.util.List;

/**
 * 지도 메뉴용 장소 조회(GET /api/places) 응답 바디.
 * 챗봇 응답(ChatResponse)과 동일한 Place 스키마를 그대로 재사용한다.
 */
public record PlaceListResponse(List<Place> places) {}
