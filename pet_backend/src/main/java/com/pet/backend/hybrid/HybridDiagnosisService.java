package com.pet.backend.hybrid;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// 하이브리드 AI 진단 비즈니스 로직 처리 서비스 클래스
@Service
@RequiredArgsConstructor
public class HybridDiagnosisService {

    private final HybridAiClient hybridAiClient;

    // 하이브리드 수치 및 문진 AI 분석 호출 메서드
    public HybridDiagnosisDto.Response diagnoseHybridHealth(HybridDiagnosisDto.Request requestDto) {
        return hybridAiClient.requestHybridDiagnosis(requestDto);
    }
}
