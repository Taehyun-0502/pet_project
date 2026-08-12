package com.pet.backend.walk;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * 기상청 초단기실황(getUltraSrtNcst) 응답 — 공공데이터포털 표준 래퍼
 * (response.body.items.item[])를 그대로 매핑한다. T1H(기온)·WSD(풍속)·REH(습도)·PTY(강수형태)만 쓴다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record KmaNcstResponse(Response response) {

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
    record Item(String category, String obsrValue) {
    }
}
