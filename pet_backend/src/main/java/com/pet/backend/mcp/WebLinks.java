package com.pet.backend.mcp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * MCP 도구 응답에 붙일 프론트 웹 링크를 조립한다 (루트 CLAUDE.md "Phase: MCP 대화형 입구" —
 * 링크는 도구가 답변에 직접 포함시키는 것이 원천이고, 서버 instructions는 보강일 뿐).
 *
 * base URL만 설정값(app.web-base-url, 규칙 1 — 하드코딩 금지)으로 주입받고, 실제 라우트
 * 경로는 이 클래스 하나에 모아 둔다. 프론트 라우트가 바뀌면 여기만 고치면 된다.
 */
@Component
public class WebLinks {

    private final String baseUrl;

    public WebLinks(@Value("${app.web-base-url}") String baseUrl) {
        // 끝에 슬래시가 붙어 있으면 "{base}//map"처럼 이중 슬래시가 생기므로 정리한다.
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    /** 지도 메뉴 — 도구 ②(장소 검색) 응답용. */
    public String mapUrl() {
        return baseUrl + "/map";
    }

    /** 산책 페이지 — 도구 ③(산책 날씨)·④(오늘 산책 브리핑) 응답용. */
    public String walkUrl() {
        return baseUrl + "/walk";
    }

    /**
     * 질병예측 결과에 대응하는 진단 페이지 — 도구 ① 응답용.
     * 현재 프론트에는 "질병예측" 전용 화면이 없어 성격이 가장 가까운 기존 진단 페이지
     * (피부 진단, /skin/diagnosis)로 연결한다. 전용 화면이 생기면 이 경로만 바꾸면 된다.
     */
    public String diagnosisUrl() {
        return baseUrl + "/skin/diagnosis";
    }
}
