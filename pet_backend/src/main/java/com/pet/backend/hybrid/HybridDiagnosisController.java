package com.pet.backend.hybrid;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// 하이브리드 수치+자연어 AI 진단 REST 컨트롤러 클래스
@RestController
@RequestMapping("/api/v1/hybrid")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class HybridDiagnosisController {

    private final HybridDiagnosisService hybridDiagnosisService;

    // 하이브리드 AI 종합 건강 검진 분석 요청 API 핸들러
    @PostMapping("/diagnosis")
    public ResponseEntity<HybridDiagnosisDto.Response> diagnoseHybridHealth(
            @RequestBody HybridDiagnosisDto.Request requestDto) {
        HybridDiagnosisDto.Response response = hybridDiagnosisService.diagnoseHybridHealth(requestDto);
        return ResponseEntity.ok(response);
    }
}
