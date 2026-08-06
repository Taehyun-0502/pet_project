package com.pet.backend.shorts;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 시청 이벤트 수집 (가이드 7절).
 *
 * <p><b>인증 필요.</b> SecurityConfig의 {@code anyRequest().authenticated()}에 그대로 걸리므로
 * 공개 경로를 추가하지 않았다 — 팀 정책을 "로그인 사용자만 기록"으로 정했기 때문이다(가이드 7절 미정 항목).
 * 개인화는 member_id가 있어야 의미가 있고, 익명 POST를 열면 인증 없이 DB에 행을 넣는 통로가 된다.
 * 비로그인 시청 통계까지 모으기로 정책이 바뀌면 SecurityConfig에
 * {@code .requestMatchers(HttpMethod.POST, "/api/shorts/*&#47;events").permitAll()} 한 줄만 열면 되고,
 * shorts_event.member_id는 이미 nullable이라 DDL 변경도 필요 없다.
 */
@RestController
@RequiredArgsConstructor
public class ShortsEventController {

    private final ShortsEventService eventService;

    /**
     * 이벤트 한 건 기록. 프론트는 여러 건을 모아 뒀다가 이 엔드포인트를 건수만큼 호출한다
     * (가이드 8절 배치 — 스크롤 중에 요청이 재생을 방해하지 않게 미뤘다가 함께 보낸다).
     *
     * <p>응답에 데이터가 없다. 기록 성공 여부만 알면 되고, 프론트는 실패해도 화면을 바꾸지 않는다
     * (통계 수집이 사용자 경험을 막아서는 안 된다).
     */
    @PostMapping("/api/shorts/{shortId}/events")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Void> record(@AuthenticationPrincipal Long memberId,
                                    @PathVariable Long shortId,
                                    @Valid @RequestBody ShortsEventCreateRequest request) {
        eventService.record(memberId, shortId, request);
        return ApiResponse.ok();
    }
}
