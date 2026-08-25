package com.pet.backend.shorts;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Supabase Storage 설정값 통. application.properties의 supabase.* 값(원본은 .env)이 주입된다.
 *
 * <p>serviceRoleKey는 RLS를 전부 무시하는 관리자 키다. 서버(.env)에만 두고
 * 절대 프론트로 내보내지 않는다 — 프론트 환경변수는 빌드 결과에 그대로 박힌다.
 *
 * <p>값이 없어도 애플리케이션은 기동한다(다른 기능이 멈추면 안 되므로).
 * 대신 업로드 시점에 {@link #isConfigured()}로 확인해 명확한 메시지를 돌려준다.
 */
@ConfigurationProperties(prefix = "supabase")
public record SupabaseStorageProperties(
        String url,             // 예: https://<project-ref>.supabase.co
        String serviceRoleKey,
        String shortsBucket,            // 영상 — video/mp4 · video/webm만 허용하도록 좁혀둔 버킷
        String shortsThumbnailsBucket   // 커버(썸네일) — image/jpeg만. 영상과 나눈 이유는 아래 참고
) {

    public boolean isConfigured() {
        return url != null && !url.isBlank()
                && serviceRoleKey != null && !serviceRoleKey.isBlank();
    }
}
