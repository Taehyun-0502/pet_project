package com.pet.backend.skin;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Service
@RequiredArgsConstructor
public class SkinDiagnosisService {

    private final SkinAiClient skinAiClient;

    // 강아지 피부병 12종 이미지 진단 분석 처리 서비스 메서드
    public SkinDiagnosisResultDto analyzeSkinImage(MultipartFile file) throws IOException {
        return skinAiClient.requestSkinDiagnosis(file);
    }
}
