package com.pet.backend.ad;

import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdvertisementService {

    private final AdvertisementRepository adRepository;

    /**
     * 지금 노출 가능한 광고 목록.
     *
     * <p>기준 시각을 여기서 한 번만 구해 쿼리에 넘긴다 — 계약 기간 판정이 곧 노출 규칙이라
     * 시작·종료 비교가 같은 시각을 봐야 경계에서 어긋나지 않는다.
     *
     * @param placement 노출 위치. null이면 위치를 가리지 않고 전부
     */
    public List<AdResponse> findActiveAds(String placement) {
        Instant now = Instant.now();
        List<Advertisement> ads = (placement == null || placement.isBlank())
                ? adRepository.findActive(now)
                : adRepository.findActiveByPlacement(now, placement);
        return ads.stream().map(AdResponse::from).toList();
    }
}
