package com.pet.backend.skin;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/skin/diagnosis")
@RequiredArgsConstructor
public class SkinDiagnosisController {

    private final SkinDiagnosisService skinDiagnosisService;

    // 강아지 피부병 12종 AI 진단 요청 API 핸들러
    @PostMapping
    public ResponseEntity<SkinDiagnosisResultDto> diagnoseSkin(@RequestParam("file") MultipartFile file) throws IOException {
        SkinDiagnosisResultDto result = skinDiagnosisService.analyzeSkinImage(file);
        return ResponseEntity.ok(result);
    }
}
