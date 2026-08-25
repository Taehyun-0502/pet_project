package com.pet.backend.mcp;

import com.pet.backend.common.BusinessException;
import com.pet.backend.place.Place;
import com.pet.backend.place.PlaceCategory;
import com.pet.backend.place.PlaceService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 도구 ② — 장소 검색. 카카오 로컬 API 호출·캐시 등 실제 검색 로직은 전혀 새로
 * 만들지 않고 {@link PlaceService}(지도 메뉴·AI 검색과 공용)에 그대로 위임한다.
 */
@Component
@RequiredArgsConstructor
public class PlaceSearchMcpTool {

    private final PlaceService placeService;
    private final WebLinks webLinks;

    @Tool(description = "키워드와 좌표로 동물병원·애견동반 카페·애견동반 호텔 등 주변 장소를 검색한다.")
    public String searchPlaces(
            @ToolParam(description = "검색 키워드 (예: '24시 동물병원', '애견동반 카페')") String keyword,
            @ToolParam(description = "위도") double lat,
            @ToolParam(description = "경도") double lng) {

        List<Place> places;
        try {
            places = placeService.search(guessCategory(keyword), keyword, lat, lng);
        } catch (BusinessException e) {
            // 원본 예외 메시지가 아니라 도메인이 이미 다듬어 둔 사용자용 메시지를 그대로 노출한다
            // (common.ErrorCode.getDefaultMessage() — 개발 용어·스택트레이스 노출 없음).
            return e.getMessage();
        }
        if (places.isEmpty()) {
            return "검색 결과가 없어요. 지도에서 직접 찾아보시겠어요? " + webLinks.mapUrl();
        }

        StringBuilder sb = new StringBuilder();
        for (Place place : places) {
            sb.append("- ").append(place.name())
                    .append(" (").append(place.category().getDefaultKeyword()).append(") — ")
                    .append(place.address());
            if (!place.phone().isBlank()) {
                sb.append(", ").append(place.phone());
            }
            sb.append('\n');
        }
        sb.append("지도에서 보기: ").append(webLinks.mapUrl());
        return sb.toString();
    }

    // PlaceService.search()는 카테고리 하나가 필요하지만 이 도구는 자유 키워드를 받는다 —
    // 키워드에 카테고리 단서가 있으면 그 카테고리로 좁히고, 없으면 HOSPITAL을 기본값으로 둔다
    // (챗봇이 이 도구를 부르는 전형적 시나리오가 "질병 의심 → 병원 검색"이라 기획서 예시와 일치).
    // 카테고리는 카카오 category_group_code 필터·결과 태깅에만 쓰이고 실제 검색어는 keyword 그대로 쓰인다.
    private PlaceCategory guessCategory(String keyword) {
        String k = keyword == null ? "" : keyword;
        if (k.contains("카페")) {
            return PlaceCategory.CAFE;
        }
        if (k.contains("호텔")) {
            return PlaceCategory.HOTEL;
        }
        return PlaceCategory.HOSPITAL;
    }
}
