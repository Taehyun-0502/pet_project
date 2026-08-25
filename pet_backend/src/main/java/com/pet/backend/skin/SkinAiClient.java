package com.pet.backend.skin;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Component
public class SkinAiClient {

    private final RestClient restClient;

    // 피부병 AI 통신 클라이언트 생성자 및 RestClient 초기화 (ngrok 바이패스 헤더 추가)
    public SkinAiClient(@Value("${ai.server.url}") String aiServerUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(aiServerUrl)
                .defaultHeader("ngrok-skip-browser-warning", "true")
                .defaultHeader("User-Agent", "SpringBoot-PetBackend")
                .build();
    }

    // 피부병 12종 세부 분류 AI 서버로 사진 전송 및 결과 수신 메서드
    public SkinDiagnosisResultDto requestSkinDiagnosis(MultipartFile file) throws IOException {
        return sendPredictRequest(file, "/api/v1/predict");
    }

    // 정상/피부질환 유증상 1차 이진 진단 AI 서버로 사진 전송 및 결과 수신 메서드
    public SkinDiagnosisResultDto requestBinarySkinDiagnosis(MultipartFile file) throws IOException {
        return sendPredictRequest(file, "/api/v1/predict/binary");
    }

    // RestClient 멀티파트 공통 요청 전송 헬퍼 메서드
    private SkinDiagnosisResultDto sendPredictRequest(MultipartFile file, String uriPath) throws IOException {
        ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename() != null ? file.getOriginalFilename() : "skin_image.jpg";
            }
        };

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                file.getContentType() != null ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE));

        HttpEntity<ByteArrayResource> fileEntity = new HttpEntity<>(fileResource, headers);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileEntity);

        return restClient.post()
                .uri(uriPath)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(SkinDiagnosisResultDto.class);
    }
}
