package com.pet.backend.common;

import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

/**
 * 프로필 이미지(회원·반려동물)를 Supabase Storage에 올리는 클라이언트.
 *
 * <p>프론트가 직접 올리지 않고 서버를 거치는 이유는 shorts.ShortsStorageClient와 같다 —
 * 쓰기 권한(service-role 키)은 서버만 갖는다.
 *
 * <p>숏츠와 달리 **같은 경로에 덮어쓴다(x-upsert)** — 프로필 사진은 개체당 1장이라
 * 교체 때마다 새 파일을 만들면 고아 파일이 쌓인다. 덮어쓰기의 브라우저 캐시 문제는
 * 호출자가 URL에 ?v=타임스탬프를 붙여 해결한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImageStorageClient {

    // 프로필 사진 공통 제약 (docs/api-spec.md 2절) — 회원·반려동물이 같은 규칙을 쓴다.
    // 도메인마다 복사하면 규칙이 조용히 갈라진다 (프론트 accept 속성·1차 검증도 이 값 기준)
    private static final long MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    private static final Set<String> ALLOWED_IMAGE_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp");

    private final ImageStorageProperties properties;
    private final RestClient.Builder restClientBuilder;

    /** 형식·용량 검증 — 위반은 400. 업로드 호출 전에 반드시 거친다 */
    public void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "이미지 파일은 필수입니다.");
        }
        if (file.getContentType() == null || !ALLOWED_IMAGE_TYPES.contains(file.getContentType())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "jpeg·png·webp 이미지만 업로드할 수 있습니다.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "이미지는 5MB 이하여야 합니다.");
        }
    }

    /**
     * @param path     버킷 안에서의 파일 경로 (예: pet-3). 확장자 없이 고정 경로를 쓴다 —
     *                 형식이 바뀌어도(jpg→png) 같은 객체를 덮어써 고아가 남지 않는다
     * @param bytes    파일 내용
     * @param mimeType image/jpeg 등 (Storage가 이 값을 Content-Type으로 서빙한다)
     * @return 공개 URL (버킷이 public read). 캐시 무효화용 ?v=는 호출자가 붙인다
     */
    public String upload(String path, byte[] bytes, String mimeType) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED,
                    "서버에 Storage 설정이 없습니다. .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.");
        }

        String baseUrl = trimTrailingSlash(properties.url());
        String objectUrl = "%s/storage/v1/object/%s/%s".formatted(baseUrl, properties.profilesBucket(), path);

        try {
            restClientBuilder.build()
                    .post()
                    .uri(objectUrl)
                    // service-role 키는 apikey 헤더와 Bearer 토큰 양쪽에 모두 필요하다
                    .header("apikey", properties.serviceRoleKey())
                    .header("Authorization", "Bearer " + properties.serviceRoleKey())
                    // 같은 경로면 덮어쓴다 — 교체 시 고아 파일 방지 (숏츠와 다른 점)
                    .header("x-upsert", "true")
                    .contentType(MediaType.parseMediaType(mimeType))
                    .body(bytes)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            // 키·정책·네트워크 문제는 사용자가 손쓸 수 없으므로 상세는 로그로만 남긴다
            log.error("프로필 이미지 업로드 실패 path={}", path, e);
            throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }

        return "%s/storage/v1/object/public/%s/%s".formatted(baseUrl, properties.profilesBucket(), path);
    }

    // .env에 https://xxx.supabase.co/ 처럼 끝에 슬래시를 넣어도 URL이 깨지지 않게 한다
    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
