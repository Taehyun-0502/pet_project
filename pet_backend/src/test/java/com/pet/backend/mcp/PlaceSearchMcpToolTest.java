package com.pet.backend.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pet.backend.common.BusinessException;
import com.pet.backend.place.Place;
import com.pet.backend.place.PlaceCategory;
import com.pet.backend.place.PlaceErrorCode;
import com.pet.backend.place.PlaceService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * MCP 도구 ②가 카카오 검색 로직을 복제하지 않고 {@link PlaceService}에 위임하는지,
 * 카테고리 추정·지도 링크·검색 실패 시 사용자용 메시지 처리가 맞는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class PlaceSearchMcpToolTest {

    @Mock
    private PlaceService placeService;

    private final WebLinks webLinks = new WebLinks("http://localhost:5173");

    @Test
    void 카페_키워드는_CAFE_카테고리로_검색을_위임한다() {
        when(placeService.search(eq(PlaceCategory.CAFE), eq("애견동반 카페"), anyDouble(), anyDouble()))
                .thenReturn(List.of(new Place("멍멍카페", PlaceCategory.CAFE, 37.5, 127.0,
                        "서울 중구", "https://place.map.kakao.com/1", "02-1234-5678", "카페 > 애견동반")));
        PlaceSearchMcpTool tool = new PlaceSearchMcpTool(placeService, webLinks);

        String result = tool.searchPlaces("애견동반 카페", 37.5, 127.0);

        verify(placeService).search(PlaceCategory.CAFE, "애견동반 카페", 37.5, 127.0);
        assertThat(result).contains("멍멍카페").contains("02-1234-5678");
        assertThat(result).contains("http://localhost:5173/map");
    }

    @Test
    void 카테고리_단서가_없으면_기본값으로_병원을_검색한다() {
        when(placeService.search(eq(PlaceCategory.HOSPITAL), any(), anyDouble(), anyDouble()))
                .thenReturn(List.of());
        PlaceSearchMcpTool tool = new PlaceSearchMcpTool(placeService, webLinks);

        tool.searchPlaces("24시 동물병원", 37.5, 127.0);

        verify(placeService).search(PlaceCategory.HOSPITAL, "24시 동물병원", 37.5, 127.0);
    }

    @Test
    void 검색_실패시_원본_예외_대신_도메인_안내_메시지를_반환한다() {
        when(placeService.search(any(), any(), anyDouble(), anyDouble()))
                .thenThrow(new BusinessException(PlaceErrorCode.SEARCH_FAILED));
        PlaceSearchMcpTool tool = new PlaceSearchMcpTool(placeService, webLinks);

        String result = tool.searchPlaces("동물병원", 37.5, 127.0);

        assertThat(result).isEqualTo(PlaceErrorCode.SEARCH_FAILED.getDefaultMessage());
    }
}
