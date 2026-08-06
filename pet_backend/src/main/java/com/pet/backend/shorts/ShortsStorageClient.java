package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Supabase Storage에 영상 파일을 올리는 클라이언트.
 *
 * <p>프론트가 anon 키로 직접 올리지 않고 이 서버를 거치는 이유:
 * anon 키는 프론트 빌드 결과에 그대로 박혀 누구나 볼 수 있어, 키를 본 사람이
 * 우리 앱을 우회해 버킷에 아무 파일이나 넣을 수 있다. 쓰기 권한은 서버만 갖는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ShortsStorageClient {

    private final SupabaseStorageProperties properties;
    private final RestClient.Builder restClientBuilder;

    /**
     * @param path     버킷 안에서의 파일 경로 (예: 1785920000000-a1b2c3d4.mp4)
     * @param bytes    파일 내용
     * @param mimeType Content-Type (mp4만 허용하므로 실제로는 video/mp4)
     * @return 공개 URL. 버킷이 public read이므로 별도 서명 없이 재생할 수 있다
     */
    public String upload(String path, byte[] bytes, String mimeType) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.SHORTS_UPLOAD_FAILED,
                    "서버에 Storage 설정이 없습니다. .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.");
        }

        String baseUrl = trimTrailingSlash(properties.url());
        String objectUrl = "%s/storage/v1/object/%s/%s".formatted(baseUrl, properties.shortsBucket(), path);

        try {
            restClientBuilder.build()
                    .post()
                    .uri(objectUrl)
                    // service-role 키는 apikey 헤더와 Bearer 토큰 양쪽에 모두 필요하다
                    .header("apikey", properties.serviceRoleKey())
                    .header("Authorization", "Bearer " + properties.serviceRoleKey())
                    .contentType(MediaType.parseMediaType(mimeType))
                    // x-upsert 없음(기본 false) — 같은 경로가 이미 있으면 덮어쓰지 않고 실패한다
                    .body(bytes)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            // 키·정책·네트워크 문제는 사용자가 손쓸 수 없으므로 상세는 로그로만 남긴다
            log.error("Supabase Storage 업로드 실패 path={}", path, e);
            throw new BusinessException(ErrorCode.SHORTS_UPLOAD_FAILED);
        }

        return "%s/storage/v1/object/public/%s/%s".formatted(baseUrl, properties.shortsBucket(), path);
    }

    // .env에 https://xxx.supabase.co/ 처럼 끝에 슬래시를 넣어도 URL이 깨지지 않게 한다
    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
