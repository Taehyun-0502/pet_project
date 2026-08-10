package com.pet.backend.hybrid;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

// 하이브리드 AI 스마트 문진 요청 및 응답 DTO 클래스
public class HybridDiagnosisDto {

    // 프론트엔드 요청 데이터 DTO
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Request {
        private Double age;
        private Double weight;
        private Double crp;
        private Double igg;
        private Double il6;

        @JsonProperty("text_prompt")
        @JsonAlias({"text_prompt", "textPrompt"})
        private String textPrompt;
    }

    // 파이썬 AI 서버 응답 데이터 DTO
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Response {
        private boolean success;
        private String status;
        private String diagnosis;

        @JsonProperty("is_normal")
        @JsonAlias({"is_normal", "isNormal"})
        private boolean isNormal;

        private Double confidence;
        private Map<String, Double> probabilities;
        private String details;
    }
}
