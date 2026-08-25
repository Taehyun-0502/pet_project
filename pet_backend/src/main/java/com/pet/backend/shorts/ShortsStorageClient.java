package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Supabase Storage에 숏츠 영상·커버 파일을 올리는 클라이언트.
 *
 * <p>프론트가 anon 키로 직접 올리지 않고 이 서버를 거치는 이유:
 * anon 키는 프론트 빌드 결과에 그대로 박혀 누구나 볼 수 있어, 키를 본 사람이
 * 우리 앱을 우회해 버킷에 아무 파일이나 넣을 수 있다. 쓰기 권한은 서버만 갖는다.
 *
 * <p><b>영상과 커버는 버킷이 다르다.</b> 버킷의 {@code allowed_mime_types}는 RLS가 아니라
 * 버킷 자체의 제약이라 service_role 키에도 적용된다(가이드 8-7절). 한 버킷에 영상과 이미지를
 * 같이 넣으려면 허용 목록에 둘 다 열어야 하는데, 그러면 영상 버킷에 이미지를 밀어 넣는 것도
 * 함께 열린다. 버킷을 나누면 각 버킷의 제약을 좁게 유지할 수 있다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ShortsStorageClient {

    private final SupabaseStorageProperties properties;
    private final RestClient.Builder restClientBuilder;

    /**
     * 영상 업로드.
     *
     * @param path     버킷 안에서의 파일 경로 (예: 1785920000000-a1b2c3d4.mp4)
     * @param bytes    파일 내용
     * @param mimeType Content-Type. 허용 형식은 ShortsService가 정한다 (video/mp4 · video/webm).
     *                 ⚠️ 버킷에 allowed_mime_types 제한이 있으면 그 목록에도 함께 있어야 한다
     * @return 공개 URL. 버킷이 public read이므로 별도 서명 없이 재생할 수 있다
     */
    public String upload(String path, byte[] bytes, String mimeType) {
        return uploadTo(properties.shortsBucket(), path, bytes, mimeType);
    }

    /**
     * 커버(썸네일) 업로드. <b>영상과 버킷이 다르다</b> — 이유는 클래스 주석 참고.
     *
     * <p>커버 버킷은 {@code image/jpeg}만 허용하면 된다. 영상 버킷에 이미지 타입을 추가하는
     * 대신 이쪽을 쓰는 것이 각 버킷의 제약을 좁게 유지하는 길이다.
     *
     * @param mimeType 항상 image/jpeg — ShortsService가 매직바이트까지 확인한 뒤 넘긴다
     */
    public String uploadThumbnail(String path, byte[] bytes, String mimeType) {
        return uploadTo(properties.shortsThumbnailsBucket(), path, bytes, mimeType);
    }

    private String uploadTo(String bucket, String path, byte[] bytes, String mimeType) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ShortsErrorCode.UPLOAD_FAILED,
                    "서버에 Storage 설정이 없습니다. .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.");
        }
        // 버킷 이름이 비면 `.../object/null/...`로 요청이 나가 "원인 불명 업로드 실패"가 된다.
        // 요청을 보내기 전에 걸러야 원인이 로그에 남는다 (ImageStorageProperties의 백로그 88번과 같은 문제)
        if (bucket == null || bucket.isBlank()) {
            log.error("Storage 버킷 이름이 비어 있다 — application.properties의 supabase.*-bucket 확인 필요");
            throw new BusinessException(ShortsErrorCode.UPLOAD_FAILED);
        }

        String baseUrl = trimTrailingSlash(properties.url());
        String objectUrl = "%s/storage/v1/object/%s/%s".formatted(baseUrl, bucket, path);

        try {
            restClientBuilder.build()
                    .post()
                    .uri(objectUrl)
                    // service-role 키는 apikey 헤더와 Bearer 토큰 양쪽에 모두 필요하다
                    .header("apikey", properties.serviceRoleKey())
                    .header("Authorization", "Bearer " + properties.serviceRoleKey())
                    // x-upsert 없음(기본 false) — 같은 경로가 이미 있으면 덮어쓰지 않고 실패한다
                    .contentType(MediaType.parseMediaType(mimeType))
                    .body(bytes)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            // 키·정책·네트워크 문제는 사용자가 손쓸 수 없으므로 상세는 로그로만 남긴다.
            // 415가 찍히면 버킷의 allowed_mime_types에 이 mimeType이 없다는 뜻이다
            log.error("Supabase Storage 업로드 실패 bucket={} path={} mimeType={}", bucket, path, mimeType, e);
            throw new BusinessException(ShortsErrorCode.UPLOAD_FAILED);
        }

        return "%s/storage/v1/object/public/%s/%s".formatted(baseUrl, bucket, path);
    }

    // .env에 https://xxx.supabase.co/ 처럼 끝에 슬래시를 넣어도 URL이 깨지지 않게 한다
    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
