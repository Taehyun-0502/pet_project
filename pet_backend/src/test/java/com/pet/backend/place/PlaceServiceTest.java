package com.pet.backend.place;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.pet.backend.common.BusinessException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PlaceService 단위 테스트 — 외부 API(KakaoClient)는 mock 처리하고,
 * 응답 파싱과 TTL 캐시 동작(같은 조건 재검색 시 카카오 API 재호출 없음)을 검증한다.
 * DB/Spring 컨텍스트 없이 순수 JUnit + Mockito로 동작한다.
 */
@ExtendWith(MockitoExtension.class)
class PlaceServiceTest {

    @Mock
    private KakaoClient kakaoClient;

    private PlaceService placeService;

    @BeforeEach
    void setUp() {
        placeService = new PlaceService(kakaoClient, Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(10))
                .maximumSize(1_000)
                .build());
    }

    @Test
    void 카카오_응답을_Place_DTO로_변환한다() {
        KakaoDocument document = new KakaoDocument(
                "행복 동물병원", "반려동물 > 동물병원", "서울 강남구 역삼동 123", "서울 강남구 테헤란로 1",
                "127.0276", "37.4979", "http://place.map.kakao.com/1", "02-1234-5678");
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenReturn(new KakaoSearchResponse(List.of(document)));

        List<Place> places = placeService.search(PlaceCategory.HOSPITAL, "동물병원", 37.4979, 127.0276);

        assertThat(places).hasSize(1);
        Place place = places.get(0);
        assertThat(place.name()).isEqualTo("행복 동물병원");
        assertThat(place.category()).isEqualTo(PlaceCategory.HOSPITAL);
        assertThat(place.lat()).isEqualTo(37.4979);
        assertThat(place.lng()).isEqualTo(127.0276);
        // 도로명 주소가 있으면 우선 사용
        assertThat(place.address()).isEqualTo("서울 강남구 테헤란로 1");
        assertThat(place.placeUrl()).isEqualTo("http://place.map.kakao.com/1");
        assertThat(place.phone()).isEqualTo("02-1234-5678");
        assertThat(place.categoryDetail()).isEqualTo("반려동물 > 동물병원");
    }

    @Test
    void 전화번호가_없으면_빈_문자열로_채운다() {
        KakaoDocument document = new KakaoDocument(
                "이름없는 카페", "반려동물 > 애견카페", "서울 서초구", null,
                "127.0", "37.5", "http://place.map.kakao.com/2", null);
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenReturn(new KakaoSearchResponse(List.of(document)));

        List<Place> places = placeService.search(PlaceCategory.CAFE, "애견카페", 37.5, 127.0);

        assertThat(places.get(0).phone()).isEmpty();
        assertThat(places.get(0).categoryDetail()).isEqualTo("반려동물 > 애견카페");
    }

    @Test
    void 동일한_조건으로_재검색하면_캐시를_사용하고_카카오_API를_다시_호출하지_않는다() {
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenReturn(new KakaoSearchResponse(List.of()));

        placeService.search(PlaceCategory.HOSPITAL, "동물병원", 37.5, 127.0);
        placeService.search(PlaceCategory.HOSPITAL, "동물병원", 37.5, 127.0);

        verify(kakaoClient, times(1)).searchKeyword(anyString(), anyDouble(), anyDouble(), any());
    }

    @Test
    void 키워드가_없으면_카테고리_기본_키워드로_검색한다() {
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenReturn(new KakaoSearchResponse(List.of()));

        placeService.search(PlaceCategory.CAFE, null, 37.5, 127.0);

        verify(kakaoClient).searchKeyword("애견카페", 37.5, 127.0, "CE7");
    }

    @Test
    void 응답에_documents가_없으면_빈_리스트를_반환한다() {
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenReturn(new KakaoSearchResponse(null));

        List<Place> places = placeService.search(PlaceCategory.HOTEL, "애견호텔", 37.5, 127.0);

        assertThat(places).isEmpty();
    }

    // --- searchAll (QA M-4) ---

    @Test
    void searchAll은_카테고리별로_기본_키워드로_조회해_결과를_병합한다() {
        when(kakaoClient.searchKeyword(eq("동물병원"), anyDouble(), anyDouble(), eq("HP8")))
                .thenReturn(new KakaoSearchResponse(List.of(document("행복 동물병원"))));
        when(kakaoClient.searchKeyword(eq("애견카페"), anyDouble(), anyDouble(), eq("CE7")))
                .thenReturn(new KakaoSearchResponse(List.of(document("멍멍 카페"))));
        when(kakaoClient.searchKeyword(eq("애견호텔"), anyDouble(), anyDouble(), eq("AD5")))
                .thenReturn(new KakaoSearchResponse(List.of(document("우리 호텔"))));

        List<Place> places = placeService.searchAll(
                List.of(PlaceCategory.HOSPITAL, PlaceCategory.CAFE, PlaceCategory.HOTEL), 37.5, 127.0);

        assertThat(places).hasSize(3);
        assertThat(places).extracting(Place::name)
                .containsExactlyInAnyOrder("행복 동물병원", "멍멍 카페", "우리 호텔");
        verify(kakaoClient).searchKeyword("동물병원", 37.5, 127.0, "HP8");
        verify(kakaoClient).searchKeyword("애견카페", 37.5, 127.0, "CE7");
        verify(kakaoClient).searchKeyword("애견호텔", 37.5, 127.0, "AD5");
    }

    @Test
    void 한_카테고리가_실패해도_나머지_카테고리_결과는_반환한다() {
        when(kakaoClient.searchKeyword(eq("동물병원"), anyDouble(), anyDouble(), eq("HP8")))
                .thenThrow(new BusinessException(PlaceErrorCode.SEARCH_FAILED));
        when(kakaoClient.searchKeyword(eq("애견카페"), anyDouble(), anyDouble(), eq("CE7")))
                .thenReturn(new KakaoSearchResponse(List.of(document("멍멍 카페"))));
        when(kakaoClient.searchKeyword(eq("애견호텔"), anyDouble(), anyDouble(), eq("AD5")))
                .thenReturn(new KakaoSearchResponse(List.of(document("우리 호텔"))));

        List<Place> places = placeService.searchAll(
                List.of(PlaceCategory.HOSPITAL, PlaceCategory.CAFE, PlaceCategory.HOTEL), 37.5, 127.0);

        assertThat(places).extracting(Place::name)
                .containsExactlyInAnyOrder("멍멍 카페", "우리 호텔");
    }

    @Test
    void 모든_카테고리가_실패하면_예외를_던진다() {
        when(kakaoClient.searchKeyword(anyString(), anyDouble(), anyDouble(), any()))
                .thenThrow(new BusinessException(PlaceErrorCode.SEARCH_FAILED));

        assertThatThrownBy(() -> placeService.searchAll(
                List.of(PlaceCategory.HOSPITAL, PlaceCategory.CAFE, PlaceCategory.HOTEL), 37.5, 127.0))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(PlaceErrorCode.SEARCH_FAILED);
    }

    private KakaoDocument document(String name) {
        return new KakaoDocument(name, "카테고리", "주소", "도로명주소", "127.0", "37.5",
                "http://place.map.kakao.com/x", "02-0000-0000");
    }
}
