package com.pet.backend.common;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
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
public class ImageStorageClient {

    // 프로필 사진 공통 제약 (docs/api-spec.md 2절) — 회원·반려동물이 같은 규칙을 쓴다.
    // 도메인마다 복사하면 규칙이 조용히 갈라진다 (프론트 accept 속성·1차 검증도 이 값 기준)
    private static final long MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    private static final Set<String> ALLOWED_IMAGE_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp");

    // 타임아웃이 없으면 Supabase가 응답하지 않을 때 요청 스레드가 무한 점유된다 (리뷰 백로그 86번).
    // read를 10초로 둔 것은 업로드 본문이 리사이징 후 수십 KB 수준이기 때문 (common/imageResize.js가 512px로 축소)
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

    private final ImageStorageProperties properties;
    private final RestClient restClient;

    // 클라이언트는 기동 시 한 번만 만든다 — 호출마다 build()하면 타임아웃 설정이 흩어지고 낭비다
    ImageStorageClient(ImageStorageProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = restClientBuilder.requestFactory(requestFactory).build();
    }

    /** 형식·용량 검증 — 위반은 400. 업로드 호출 전에 반드시 거친다 */
    public void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "이미지 파일은 필수입니다.");
        }
        if (file.getContentType() == null || !ALLOWED_IMAGE_TYPES.contains(file.getContentType())) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "jpeg·png·webp 이미지만 업로드할 수 있습니다.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "이미지는 5MB 이하여야 합니다.");
        }
    }

    /**
     * 프로필 이미지의 **열거 불가능한** 고정 경로를 만든다 (리뷰 백로그 87번).
     *
     * <p>종전에는 `member-{id}`·`pet-{id}`처럼 <b>순차 id가 곧 경로</b>였다. 버킷이 public read라
     * `.../object/public/profiles/member-1`, `member-2` …를 훑으면 인증 없이 전 회원의 얼굴 사진과
     * 반려동물 사진을 수집할 수 있었다 — 다른 API는 타인 리소스에 404까지 주며 존재 여부를 숨기는데
     * 사진만 완전 공개여서 격리 수준이 도메인 간에 어긋났다. `?v=`는 캐시버스터일 뿐 접근 제어가 아니다.
     *
     * <p><b>id + 서버 비밀(service-role 키)의 HMAC-SHA256 앞 12자</b>를 접미사로 붙인다
     * (예: {@code member-3-9f2a17c4b0d1}). 성질 세 가지가 이 방식을 고른 이유다:
     * <ul>
     *   <li><b>결정적</b> — 같은 개체는 항상 같은 경로. "고정 경로 + upsert = 고아 파일 없음"이라는
     *       기존 설계 전제(위 upload 주석)를 그대로 유지한다</li>
     *   <li><b>DB 변경 0</b> — 토큰을 행에 저장하는 백로그 원안과 결과는 같은데 공유 Supabase에
     *       ALTER 2건이 필요 없다. 배포를 최우선으로 되돌린 상황(plan-2026-08-24)에서 팀 조율 비용을
     *       없애는 것이 결정 이유였다</li>
     *   <li><b>키를 노출하지 않는다</b> — HMAC 12자로는 키를 되돌릴 수 없다</li>
     * </ul>
     *
     * <p><b>알려진 한계</b>: service-role 키를 교체하면 경로가 바뀌어 개체당 파일 1개가 고아로 남는다.
     * 화면은 DB에 저장된 URL을 쓰므로 계속 정상이고, 다음 업로드가 새 경로로 이동한다.
     * 또 <b>이미 올라간 옛 경로(member-1 등) 파일은 이 변경만으로 사라지지 않는다</b> —
     * 그 객체들은 Supabase Storage에서 직접 지워야 완전히 닫힌다(배포 전 사용자 작업, plan 참조).
     */
    public String profilePath(String prefix, Long id) {
        return "%s-%d-%s".formatted(prefix, id, pathToken(prefix + "-" + id));
    }

    private String pathToken(String seed) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    properties.serviceRoleKey().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(seed.getBytes(StandardCharsets.UTF_8)))
                    .substring(0, 12);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            // HmacSHA256은 JDK 표준이고 키는 isConfigured()가 이미 확인했다 — 도달 불가 경로
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }
    }

    /**
     * @param path     버킷 안에서의 파일 경로. **프로필 이미지는 {@link #profilePath}로 만들 것** —
     *                 순차 id를 그대로 쓰면 공개 버킷에서 열거된다 (백로그 87번).
     *                 확장자는 붙이지 않는다 — 형식이 바뀌어도(jpg→png) 같은 객체를 덮어써 고아가 남지 않는다
     * @param bytes    파일 내용
     * @param mimeType image/jpeg 등 (Storage가 이 값을 Content-Type으로 서빙한다)
     * @return 공개 URL (버킷이 public read). 캐시 무효화용 ?v=는 호출자가 붙인다
     */
    public String upload(String path, byte[] bytes, String mimeType) {
        return uploadTo(properties.profilesBucket(), path, bytes, mimeType);
    }

    /**
     * 채팅 이미지 업로드 (F10b). 프로필과 <b>버킷이 다르다</b> — 프로필은 개체당 1장을 덮어쓰지만
     * 채팅 이미지는 대화 기록이라 누적되고, 정리 정책도 달라질 것이기 때문이다.
     *
     * <p>경로는 호출자가 <b>추측 불가능한 값</b>으로 준다. 공개 버킷이라 경로를 아는 사람은
     * 방 밖에서도 열람할 수 있으므로, 순차 id 같은 열거 가능한 경로를 쓰면 안 된다
     * (프로필의 {@code member-{id}}가 백로그 87번으로 지적된 그 문제다).
     */
    public String uploadChatImage(String path, byte[] bytes, String mimeType) {
        return uploadTo(properties.chatBucket(), path, bytes, mimeType);
    }

    private String uploadTo(String bucket, String path, byte[] bytes, String mimeType) {
        if (!properties.isConfigured()) {
            // 설정 이름은 **로그로만** 남긴다 (리뷰 백로그 88번) — 종전에는 BusinessException의
            // 커스텀 메시지로 실려 `.env`의 변수명이 그대로 클라이언트에 내려갔다.
            // 같은 클래스의 업로드 실패 경로가 이미 "상세는 로그로만"이었으므로 규칙을 일치시킨다
            log.error("Storage 설정 누락 — .env의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /"
                    + " supabase.profiles-bucket / supabase.chat-bucket 확인 필요");
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }

        String baseUrl = trimTrailingSlash(properties.url());
        String objectUrl = "%s/storage/v1/object/%s/%s".formatted(baseUrl, bucket, path);

        try {
            restClient.post()
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
            log.error("이미지 업로드 실패 bucket={} path={}", bucket, path, e);
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }

        return "%s/storage/v1/object/public/%s/%s".formatted(baseUrl, bucket, path);
    }

    // .env에 https://xxx.supabase.co/ 처럼 끝에 슬래시를 넣어도 URL이 깨지지 않게 한다
    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
