package com.pet.backend.place;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 카테고리 + 키워드 + 좌표 기반 장소 검색.
 * 카카오 로컬 API 약관상 검색 결과를 DB에 영구 저장할 수 없으므로,
 * 단기 인메모리 TTL 캐시(Caffeine)만 사용한다 — 서버 재시작 시 캐시는 자연 소멸한다.
 */
@Slf4j
@Service
public class PlaceService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final long CACHE_MAX_SIZE = 1_000;

    private final KakaoClient kakaoClient;
    private final Cache<String, List<Place>> cache;

    // 두 개 이상의 생성자가 있으면 Spring이 어느 것을 쓸지 스스로 판단하지 못하므로
    // (기본 생성자를 찾다가 실패) 실제 빈 생성에 쓸 생성자를 명시한다.
    @Autowired
    public PlaceService(KakaoClient kakaoClient) {
        this(kakaoClient, Caffeine.newBuilder()
                .expireAfterWrite(CACHE_TTL)
                .maximumSize(CACHE_MAX_SIZE)
                .build());
    }

    // 테스트에서 캐시를 주입해 TTL/히트 여부를 검증할 수 있도록 패키지 전용 생성자를 둔다.
    PlaceService(KakaoClient kakaoClient, Cache<String, List<Place>> cache) {
        this.kakaoClient = kakaoClient;
        this.cache = cache;
    }

    /**
     * 여러 카테고리를 각각 기본 키워드로 조회해 합친다 (지도 메뉴 GET /api/places 전용).
     * 카테고리별 캐시는 {@link #search}와 동일하게 재사용된다.
     *
     * 부분 성공 허용: 한 카테고리(예: 카카오 API 일시 오류)가 실패해도 나머지 카테고리 결과는
     * 그대로 반환한다 — 과거엔 스트림 중 하나만 실패해도 전체가 빈 결과로 죽어 지도에
     * 마커가 하나도 안 뜨는 문제가 있었다(QA M-2). 모든 카테고리가 실패했을 때만 예외를 던진다.
     */
    public List<Place> searchAll(List<PlaceCategory> categories, double lat, double lng) {
        List<Place> merged = new ArrayList<>();
        int failedCount = 0;

        for (PlaceCategory category : categories) {
            try {
                merged.addAll(search(category, null, lat, lng));
            } catch (BusinessException e) {
                failedCount++;
                log.warn("카테고리 {} 장소 검색 실패 — 나머지 카테고리로 계속 진행합니다.", category, e);
            }
        }

        if (!categories.isEmpty() && failedCount == categories.size()) {
            throw new BusinessException(ErrorCode.PLACE_SEARCH_FAILED);
        }
        return merged;
    }

    public List<Place> search(PlaceCategory category, String keyword, double lat, double lng) {
        String query = (keyword != null && !keyword.isBlank()) ? keyword.trim() : category.getDefaultKeyword();
        String cacheKey = buildCacheKey(category, query, lat, lng);

        List<Place> cached = cache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }

        KakaoSearchResponse response = kakaoClient.searchKeyword(query, lat, lng, category.getKakaoCategoryGroupCode());
        List<Place> places = toPlaces(response, category);
        cache.put(cacheKey, places);
        return places;
    }

    private List<Place> toPlaces(KakaoSearchResponse response, PlaceCategory category) {
        if (response == null || response.documents() == null) {
            return List.of();
        }
        return response.documents().stream()
                .map(doc -> toPlace(doc, category))
                .toList();
    }

    private Place toPlace(KakaoDocument doc, PlaceCategory category) {
        return new Place(
                doc.placeName(),
                category,
                parseCoordinate(doc.y()),
                parseCoordinate(doc.x()),
                doc.roadAddressName() != null && !doc.roadAddressName().isBlank()
                        ? doc.roadAddressName()
                        : doc.addressName(),
                doc.placeUrl(),
                blankToEmpty(doc.phone()),
                blankToEmpty(doc.categoryName())
        );
    }

    private double parseCoordinate(String value) {
        return value == null || value.isBlank() ? 0.0 : Double.parseDouble(value);
    }

    // phone·categoryDetail은 카카오 응답에 값이 없을 수 있어(예: 전화번호 미등록) 널 대신
    // 빈 문자열로 채운다 — 프론트에서 별도 null 분기 없이 그대로 표시/숨김 처리할 수 있게 한다.
    private String blankToEmpty(String value) {
        return value == null ? "" : value;
    }

    // 캐시 키는 카테고리+검색어+좌표(소수점 3자리=약 100m 단위로 반올림)로 구성해
    // 근접한 요청끼리 캐시를 공유하면서도 지나치게 넓은 영역이 뭉치지 않게 한다.
    private String buildCacheKey(PlaceCategory category, String query, double lat, double lng) {
        return String.format(Locale.ROOT, "%s|%s|%.3f|%.3f", category, query, lat, lng);
    }
}
