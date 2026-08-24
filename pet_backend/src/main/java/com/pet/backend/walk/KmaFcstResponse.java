package com.pet.backend.walk;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * 기상청 초단기예보(getUltraSrtFcst) 응답. SKY(하늘상태)만 사용하며,
 * 여러 시각의 예보가 함께 오므로(fcstDate+fcstTime) 호출 시각에 가장 가까운 값을 골라 쓴다
 * (KmaClient.nearestSky).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record KmaFcstResponse(Response response) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Response(Header header, Body body) {
    }

    // resultCode "00"이 정상. 그 외(NODATA_ERROR 등)는 KmaClient가 WEATHER_FETCH_FAILED로 변환한다(QA M-1).
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Header(String resultCode, String resultMsg) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Body(Items items) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Items(List<Item> item) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Item(String category, String fcstDate, String fcstTime, String fcstValue) {
    }
}
