package com.pet.backend.ad;

/**
 * 배너가 그리는 데 필요한 것만 (가이드 2절).
 *
 * <p>계약 기간·활성 여부·우선순위는 내려주지 않는다 — 노출 여부는 서버가 이미 판정했고,
 * 계약 조건은 광고주와의 계약 정보라 클라이언트에 나갈 이유가 없다.
 */
public record AdResponse(Long id, String title, String imageUrl, String linkUrl) {

    public static AdResponse from(Advertisement ad) {
        return new AdResponse(ad.getId(), ad.getTitle(), ad.getImageUrl(), ad.getLinkUrl());
    }
}
