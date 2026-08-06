package com.pet.backend.place;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * 카카오 로컬 키워드 검색 API(v2/local/search/keyword.json) 응답 매핑.
 * meta 등 사용하지 않는 필드는 무시한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record KakaoSearchResponse(List<KakaoDocument> documents) {}
