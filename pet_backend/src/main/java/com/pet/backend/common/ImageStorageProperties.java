package com.pet.backend.common;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 프로필 이미지용 Supabase Storage 설정 (docs/api-spec.md 2절 프로필 사진).
 * url·service-role 키는 숏츠(shorts.SupabaseStorageProperties)와 같은 supabase.* 값을 바인딩한다 —
 * 같은 prefix를 두 record가 각자 바인딩하는 것은 무해하며, shorts 패키지를 import하면
 * 도메인 간 의존이 생기므로 common에 별도로 둔다 (통합은 추후 팀 협의).
 */
@ConfigurationProperties(prefix = "supabase")
public record ImageStorageProperties(
        String url,             // 예: https://<project-ref>.supabase.co
        String serviceRoleKey,  // RLS를 무시하는 관리자 키 — 서버 밖으로 내보내지 않는다
        String profilesBucket,  // 프로필 이미지 버킷 (회원·반려동물 공용)
        String chatBucket       // 채팅 이미지 버킷 (F10b) — 누적되는 대화 기록이라 프로필과 분리
) {

    public boolean isConfigured() {
        return url != null && !url.isBlank()
                && serviceRoleKey != null && !serviceRoleKey.isBlank();
    }
}
