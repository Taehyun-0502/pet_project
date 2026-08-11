package com.pet.backend.member;

/**
 * User-Agent를 "브라우저 · OS" 수준으로만 요약한다 (api-spec.md 1절 5차 — 간단 파싱 확정, 2026-08-11).
 * 기기 목록 화면의 표시용일 뿐 판정에 쓰이지 않으므로 정확도보다 단순함을 택했다 — 라이브러리 없이
 * 대표 토큰 몇 개만 검사하고, 못 알아보면 null을 돌려 프론트가 "알 수 없는 기기"로 표시한다.
 */
final class DeviceInfoParser {

    private DeviceInfoParser() {
    }

    static String parse(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String browser = browserOf(userAgent);
        String os = osOf(userAgent);
        if (browser == null) {
            return os;
        }
        if (os == null) {
            return browser;
        }
        return browser + " · " + os;
    }

    // 검사 순서가 정확도를 좌우한다 — Edge·Opera·삼성 인터넷 UA는 "Chrome"을,
    // Chrome UA는 "Safari"를 포함하므로 구체적인 것부터 본다
    private static String browserOf(String ua) {
        if (ua.contains("Edg/")) {
            return "Edge";
        }
        if (ua.contains("OPR/")) {
            return "Opera";
        }
        if (ua.contains("SamsungBrowser/")) {
            return "삼성 인터넷";
        }
        if (ua.contains("Firefox/")) {
            return "Firefox";
        }
        if (ua.contains("Chrome/")) {
            return "Chrome";
        }
        if (ua.contains("Safari/")) {
            return "Safari";
        }
        return null;
    }

    // iPhone·iPad UA가 "like Mac OS X"를 포함하므로 macOS보다 먼저, Android UA가 "Linux"를 포함하므로 Linux보다 먼저
    private static String osOf(String ua) {
        if (ua.contains("Windows")) {
            return "Windows";
        }
        if (ua.contains("iPhone") || ua.contains("iPad")) {
            return "iOS";
        }
        if (ua.contains("Android")) {
            return "Android";
        }
        if (ua.contains("Mac OS X")) {
            return "macOS";
        }
        if (ua.contains("Linux")) {
            return "Linux";
        }
        return null;
    }
}
