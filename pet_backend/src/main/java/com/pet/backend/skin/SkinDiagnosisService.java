package com.pet.backend.skin;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Service
@RequiredArgsConstructor
public class SkinDiagnosisService {

    private final SkinAiClient skinAiClient;

    // 강아지 12종 피부 질환 AI 세부 진단 서비스 처리 메서드
    public SkinDiagnosisResultDto diagnoseSkinDisease(MultipartFile file) throws IOException {
        return skinAiClient.requestSkinDiagnosis(file);
    }

    // 강아지 피부 질환 유무 AI 1차 이진 진단 서비스 처리 메서드
    public SkinDiagnosisResultDto diagnoseBinarySkinDisease(MultipartFile file) throws IOException {
        return skinAiClient.requestBinarySkinDiagnosis(file);
    }
}
