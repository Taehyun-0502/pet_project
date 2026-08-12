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
    record Response(Body body) {
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
