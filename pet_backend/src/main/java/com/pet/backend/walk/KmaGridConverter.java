package com.pet.backend.walk;

/**
 * 위경도 → 기상청 격자좌표(nx, ny) 변환. 기상청이 공식 배포하는 LCC(Lambert Conformal Conic,
 * DFS) 변환식을 그대로 옮긴 것으로, 아래 상수는 좌표계 정의 자체이므로 실측 보정과 무관하게
 * 고정값이다(WalkWeatherConstants의 "추후 교체 가능" 계수와는 성격이 다르다 — 건드리지 않는다).
 *
 * 검증값: 서울시청(37.5665, 126.9780) → nx=60, ny=127.
 */
final class KmaGridConverter {

    private static final double RE = 6371.00877; // 지구 반경(km)
    private static final double GRID = 5.0;      // 격자 간격(km)
    private static final double SLAT1 = 30.0;    // 투영 위도1(도)
    private static final double SLAT2 = 60.0;    // 투영 위도2(도)
    private static final double OLON = 126.0;    // 기준점 경도(도)
    private static final double OLAT = 38.0;     // 기준점 위도(도)
    private static final double XO = 43;         // 기준점 X좌표(GRID)
    private static final double YO = 136;        // 기준점 Y좌표(GRID)
    private static final double DEGRAD = Math.PI / 180.0;

    private KmaGridConverter() {
    }

    record Grid(int nx, int ny) {
    }

    static Grid toGrid(double lat, double lng) {
        double re = RE / GRID;
        double slat1 = SLAT1 * DEGRAD;
        double slat2 = SLAT2 * DEGRAD;
        double olon = OLON * DEGRAD;
        double olat = OLAT * DEGRAD;

        double sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
        sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
        double sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
        sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
        double ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
        ro = re * sf / Math.pow(ro, sn);

        double ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
        ra = re * sf / Math.pow(ra, sn);
        double theta = lng * DEGRAD - olon;
        if (theta > Math.PI) {
            theta -= 2.0 * Math.PI;
        }
        if (theta < -Math.PI) {
            theta += 2.0 * Math.PI;
        }
        theta *= sn;

        int nx = (int) Math.floor(ra * Math.sin(theta) + XO + 0.5);
        int ny = (int) Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
        return new Grid(nx, ny);
    }
}
