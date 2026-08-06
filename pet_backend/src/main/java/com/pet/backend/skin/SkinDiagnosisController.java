package com.pet.backend.skin;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/skin/diagnosis")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SkinDiagnosisController {

    private final SkinDiagnosisService skinDiagnosisService;

    // 강아지 12종 세부 피부 질환 AI 진단 요청 API 핸들러
    @PostMapping
    public ResponseEntity<SkinDiagnosisResultDto> diagnoseSkin(@RequestParam("file") MultipartFile file) throws IOException {
        SkinDiagnosisResultDto result = skinDiagnosisService.diagnoseSkinDisease(file);
        return ResponseEntity.ok(result);
    }

    // 강아지 피부 질환 유무 AI 1차 스크리닝(정상 vs 피부 질환 유증상) 이진 진단 요청 API 핸들러
    @PostMapping("/binary")
    public ResponseEntity<SkinDiagnosisResultDto> diagnoseBinarySkin(@RequestParam("file") MultipartFile file) throws IOException {
        SkinDiagnosisResultDto result = skinDiagnosisService.diagnoseBinarySkinDisease(file);
        return ResponseEntity.ok(result);
    }
}
