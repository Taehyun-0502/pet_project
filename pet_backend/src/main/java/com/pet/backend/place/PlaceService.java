package com.pet.backend.place;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 카테고리 + 키워드 + 좌표 기반 장소 검색.
 * 카카오 로컬 API 약관상 검색 결과를 DB에 영구 저장할 수 없으므로,
 * 단기 인메모리 TTL 캐시(Caffeine)만 사용한다 — 서버 재시작 시 캐시는 자연 소멸한다.
 */
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
                doc.placeUrl()
        );
    }

    private double parseCoordinate(String value) {
        return value == null || value.isBlank() ? 0.0 : Double.parseDouble(value);
    }

    // 캐시 키는 카테고리+검색어+좌표(소수점 3자리=약 100m 단위로 반올림)로 구성해
    // 근접한 요청끼리 캐시를 공유하면서도 지나치게 넓은 영역이 뭉치지 않게 한다.
    private String buildCacheKey(PlaceCategory category, String query, double lat, double lng) {
        return String.format(Locale.ROOT, "%s|%s|%.3f|%.3f", category, query, lat, lng);
    }
}
