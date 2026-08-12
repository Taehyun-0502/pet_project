package com.pet.backend.ad;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 광고 저장소. "지금 노출 가능한 광고 <b>전부</b>"를 내려주는 것이 전부다 —
 * 랜덤 1개 선택은 프론트가 한다(가이드 2절). 서버가 1개만 골라 주면 페이지를 옮길 때마다
 * 서버를 다시 불러야 하는데, 목록을 통째로 주면 프론트가 재호출 없이 다시 고를 수 있다.
 *
 * <p><b>가이드의 단일 쿼리를 둘로 나눴다.</b> 가이드는
 * {@code (:placement is null or a.placement = :placement)} 한 줄로 처리하지만,
 * 그러면 placement가 null일 때 PostgreSQL이 바인딩 파라미터의 타입을 추론하지 못해
 * 실패할 수 있다. 호출하는 쪽이 이미 두 경우를 구분해 알고 있으므로 메서드를 나누는 편이
 * 안전하고 각 쿼리도 읽기 쉽다.
 */
public interface AdvertisementRepository extends JpaRepository<Advertisement, Long> {

    /**
     * 위치를 가리지 않고 지금 노출 가능한 광고 전부.
     *
     * <p>{@code placement}가 있는 광고까지 <b>모두</b> 포함한다 — 노출 위치가 정해지지 않은
     * 동안 배너가 위치 태그와 무관하게 뜨게 하려는 것이다. 위치가 확정되면 화면에서
     * {@link #findActiveByPlacement}를 쓰면 된다.
     */
    @Query("""
            select a from Advertisement a
            where a.isActive = true
              and a.startDate <= :now
              and a.endDate   >= :now
            order by a.priority desc, a.id desc
            """)
    List<Advertisement> findActive(@Param("now") Instant now);

    /**
     * 특정 위치의 광고 + 위치를 지정하지 않은 전역 광고(placement is null).
     *
     * <p>전역 광고를 함께 주는 이유: {@code placement}는 "여기에만 노출"이라는 제한이지
     * "여기 것만 본다"는 뜻이 아니다. 위치를 비워 둔 광고는 어느 배너에나 나가야 한다.
     */
    @Query("""
            select a from Advertisement a
            where a.isActive = true
              and a.startDate <= :now
              and a.endDate   >= :now
              and (a.placement = :placement or a.placement is null)
            order by a.priority desc, a.id desc
            """)
    List<Advertisement> findActiveByPlacement(@Param("now") Instant now,
                                              @Param("placement") String placement);
}
