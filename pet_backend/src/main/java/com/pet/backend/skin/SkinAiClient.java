package com.pet.backend.skin;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Component
public class SkinAiClient {

    private final RestClient restClient;

    // 피부병 AI 통신 클라이언트 생성자 및 RestClient 초기화
    public SkinAiClient(@Value("${ai.server.url}") String aiServerUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(aiServerUrl)
                .build();
    }

    // 피부병 12종 분류 AI 서버로 사진 전송 및 결과 수신 메서드
    public SkinDiagnosisResultDto requestSkinDiagnosis(MultipartFile file) throws IOException {
        MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
        ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename() != null ? file.getOriginalFilename() : "skin_image.jpg";
            }
        };
        bodyBuilder.part("file", fileResource, MediaType.parseMediaType(
                file.getContentType() != null ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE));

        return restClient.post()
                .uri("/api/v1/predict")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(bodyBuilder.build())
                .retrieve()
                .body(SkinDiagnosisResultDto.class);
    }
}
