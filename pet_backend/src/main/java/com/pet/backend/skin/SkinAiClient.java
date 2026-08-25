package com.pet.backend.skin;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;

@Component
public class SkinAiClient {

    /**
     * 외부 클라이언트에는 반드시 connect/read 타임아웃을 건다 (docs/conventions.md 1절, 리뷰 백로그 86번 계열).
     * 없으면 모델 서버가 응답하지 않을 때 요청 스레드가 <b>무한 점유</b>되어, 커넥션 풀이 작은 이 환경에서는
     * 진단 몇 번으로 서버 전체가 멈춘다.
     *
     * <p><b>read가 긴 이유</b>: 이 호출은 네트워크 전송이 아니라 <b>원격 모델 추론</b>을 기다린다 —
     * 업로드만 하는 {@code common/ImageStorageClient}(10초)와 성격이 다르고,
     * 모델 서버가 슬립에서 깨어나는 첫 요청은 수십 초가 걸린다(2026-08-25 모델 서버 분리 배포 착수).
     * connect는 "서버가 살아 있는가"의 판단선이라 짧게 둔다.
     */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(60);

    private final RestClient restClient;

    // 피부병 AI 통신 클라이언트 생성자 및 RestClient 초기화 (ngrok 바이패스 헤더 추가).
    // 생성자에서 한 번만 build한다 — 호출마다 만들면 타임아웃 설정이 흩어지고 낭비다
    public SkinAiClient(@Value("${ai.server.url}") String aiServerUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
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
