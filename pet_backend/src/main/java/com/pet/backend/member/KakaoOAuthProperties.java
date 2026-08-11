package com.pet.backend.member;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 카카오 OAuth 설정 (docs/api-spec.md 1절 4차). 지도(place)의 kakao.rest-api-key와는 **별개 앱**이다.
 * 빈 기본값을 허용한다 — 키가 없어도 부팅은 되고, 카카오 로그인 호출 시점에만 실패한다 (백로그 7번 교훈).
 * clientSecret은 카카오 콘솔에서 Client Secret을 활성화한 경우에만 채운다.
 */
@ConfigurationProperties(prefix = "kakao.oauth")
public record KakaoOAuthProperties(String clientId, String clientSecret) {}
