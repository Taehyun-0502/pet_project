package com.pet.backend.member;

import com.fasterxml.jackson.databind.JsonNode;
import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 카카오 OAuth REST 호출 (docs/api-spec.md 1절 4차) — 인가 코드 → 토큰 교환 → 사용자 정보 조회.
 *
 * Spring OAuth2 Client를 쓰지 않는 이유: 세션 기반 리다이렉트 플로우라 STATELESS 구조와 맞지 않고,
 * 필요한 것은 REST 호출 2회뿐이다. 실패는 종류를 불문하고 AUTH_SOCIAL_LOGIN_FAILED(401)로 감싼다 —
 * 카카오 응답 원문(내부 오류·키 정보 포함 가능)을 클라이언트에 노출하지 않고 상세는 서버 로그로만 남긴다.
 */
@Slf4j
@Component
class KakaoOAuthClient {

    // email·nickname은 동의 항목이라 null일 수 있다 — 처리 방침은 MemberService가 정한다
    record KakaoUserInfo(String providerId, String email, String nickname) {}

    // place/KakaoClient와 같은 값. 타임아웃이 없으면 카카오가 응답하지 않을 때 요청 스레드가
    // 무한 대기한다 (리뷰 백로그 86번). 초과 시 던져지는 것도 RestClientException이라
    // 아래 catch가 그대로 흡수해 AUTH_SOCIAL_LOGIN_FAILED가 된다
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final KakaoOAuthProperties properties;
    private final RestClient authClient;
    private final RestClient apiClient;

    KakaoOAuthClient(KakaoOAuthProperties properties) {
        this.properties = properties;
        this.authClient = clientFor("https://kauth.kakao.com");
        this.apiClient = clientFor("https://kapi.kakao.com");
    }

    private static RestClient clientFor(String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(requestFactory).build();
    }

    KakaoUserInfo fetchUser(String code, String redirectUri) {
        return fetchUserInfo(exchangeCode(code, redirectUri));
    }

    private String exchangeCode(String code, String redirectUri) {
        if (properties.clientId() == null || properties.clientId().isBlank()) {
            // 부팅은 되게 두고 사용 시점에만 알린다 (백로그 7번 교훈). 설정 문제라 WARN이 아닌 ERROR
            log.error("KAKAO_OAUTH_CLIENT_ID가 비어 있어 카카오 로그인을 수행할 수 없습니다 — .env 확인");
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_LOGIN_FAILED);
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", properties.clientId());
        form.add("redirect_uri", redirectUri);
        form.add("code", code);
        if (properties.clientSecret() != null && !properties.clientSecret().isBlank()) {
            form.add("client_secret", properties.clientSecret());
        }
        try {
            JsonNode body = authClient.post().uri("/oauth/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
            String accessToken = body == null ? null : body.path("access_token").asText(null);
            if (accessToken == null) {
                log.warn("카카오 토큰 응답에 access_token이 없습니다");
                throw new BusinessException(ErrorCode.AUTH_SOCIAL_LOGIN_FAILED);
            }
            return accessToken;
        } catch (RestClientException e) {
            // 만료·재사용된 인가 코드, redirect_uri 불일치 등 — 카카오가 400으로 응답하는 정상 실패 경로
            log.warn("카카오 토큰 교환 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_LOGIN_FAILED);
        }
    }

    private KakaoUserInfo fetchUserInfo(String kakaoAccessToken) {
        try {
            JsonNode body = apiClient.get().uri("/v2/user/me")
                    .header("Authorization", "Bearer " + kakaoAccessToken)
                    .retrieve()
                    .body(JsonNode.class);
            String providerId = body == null ? null : body.path("id").asText(null);
            if (providerId == null) {
                log.warn("카카오 사용자 정보 응답에 id가 없습니다");
                throw new BusinessException(ErrorCode.AUTH_SOCIAL_LOGIN_FAILED);
            }
            JsonNode account = body.path("kakao_account");
            return new KakaoUserInfo(
                    providerId,
                    account.path("email").asText(null),
                    account.path("profile").path("nickname").asText(null));
        } catch (RestClientException e) {
            log.warn("카카오 사용자 정보 조회 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_LOGIN_FAILED);
        }
    }
}
