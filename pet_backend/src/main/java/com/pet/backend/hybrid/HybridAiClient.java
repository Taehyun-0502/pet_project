package com.pet.backend.hybrid;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

// 파이썬 FastAPI 하이브리드 AI 추론 서버 통신 클라이언트
@Component
public class HybridAiClient {

    private final RestClient restClient;

    // 생성자를 통한 AI 서버 Base URL 및 3초 타임아웃 설정 주입
    public HybridAiClient(@Value("${ai.server.url:http://localhost:8000}") String aiServerUrl) {
        org.springframework.http.client.SimpleClientHttpRequestFactory requestFactory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(3000);
        requestFactory.setReadTimeout(3000);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl(aiServerUrl)
                .build();
    }

    // 하이브리드 수치+자연어 AI 진단 요청 메서드
    public HybridDiagnosisDto.Response requestHybridDiagnosis(HybridDiagnosisDto.Request requestDto) {
        return restClient.post()
                .uri("/api/v1/predict/hybrid")
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestDto)
                .retrieve()
                .body(HybridDiagnosisDto.Response.class);
    }
}
