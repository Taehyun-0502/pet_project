package com.pet.backend.walk;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 좌표 → 격자 변환 → (캐시 우선) 기상청 조회 → 일사량 추정 → 아스팔트 온도 → 위험 단계까지 조합한다.
 *
 * <p>캐시는 <b>격자 셀(nx,ny) 단위 원시 관측/예보값</b>에만 건다 — place 패키지의 Caffeine
 * 캐시 구성(10분 TTL)과 동일 패턴. 일사량은 태양고도(시각에 따라 계속 변함)에 좌우되므로
 * 캐시된 원시값 위에서 매 요청마다 "지금" 기준으로 다시 계산한다 — 순수 계산이라 비용이
 * 거의 없고, 그래야 격자 캐시가 살아있는 10분 동안에도 일사량이 시간 경과를 반영한다.
 */
@Service
public class WalkWeatherService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final long CACHE_MAX_SIZE = 500;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final KmaClient kmaClient;
    private final Cache<String, KmaWeatherSnapshot> cache;

    @Autowired
    public WalkWeatherService(KmaClient kmaClient) {
        this(kmaClient, Caffeine.newBuilder()
                .expireAfterWrite(CACHE_TTL)
                .maximumSize(CACHE_MAX_SIZE)
                .build());
    }

    // 테스트에서 캐시를 주입해 격자 캐시 히트 여부를 검증할 수 있도록 패키지 전용 생성자를 둔다.
    WalkWeatherService(KmaClient kmaClient, Cache<String, KmaWeatherSnapshot> cache) {
        this.kmaClient = kmaClient;
        this.cache = cache;
    }

    public WalkWeatherResponse getWeather(double lat, double lng) {
        KmaGridConverter.Grid grid = KmaGridConverter.toGrid(lat, lng);
        String cacheKey = grid.nx() + "|" + grid.ny();

        KmaWeatherSnapshot snapshot = cache.getIfPresent(cacheKey);
        if (snapshot == null) {
            snapshot = kmaClient.fetch(grid.nx(), grid.ny());
            // mock 폴백 스냅샷(키 미설정)은 캐시하지 않는다 — 캐시하면 운영 중 키를 뒤늦게
            // 등록해도 이미 채워진 캐시 탓에 최대 10분 동안 mock 값이 유지된다(QA L-2).
            if (kmaClient.isServiceKeyConfigured()) {
                cache.put(cacheKey, snapshot);
            }
        }

        double solar = SolarEstimator.estimate(lat, lng, ZonedDateTime.now(KST), snapshot.sky(), snapshot.pty());
        double asphaltTemp = AsphaltTempCalculator.calculate(snapshot.airTemp(), snapshot.windSpeed(), solar);
        RiskLevel riskLevel = RiskLevel.from(asphaltTemp);

        return new WalkWeatherResponse(
                snapshot.airTemp(),
                snapshot.humidity(),
                snapshot.windSpeed(),
                round1(solar),
                round1(asphaltTemp),
                riskLevel,
                snapshot.baseTime());
    }

    private double round1(double value) {
        return Math.round(value * 10) / 10.0;
    }
}
