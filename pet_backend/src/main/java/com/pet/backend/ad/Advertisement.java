package com.pet.backend.ad;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 광고 배너 한 개 (광고배너_구현가이드.md 1절).
 *
 * <p><b>읽기 전용 엔티티다.</b> 다른 슬라이스와 달리 생성 팩터리가 없다 — 기간 계약을 맺고
 * 사람이 Supabase에 직접 insert하는 데이터라서 애플리케이션에는 쓰기 경로 자체가 없다.
 * 광고 등록 화면이 생기면 그때 팩터리를 추가한다.
 *
 * <p>스키마는 다른 테이블과 같이 Supabase에서 직접 관리한다(ddl-auto=none).
 * 컬럼을 바꾸려면 DB에 DDL을 먼저 적용해야 한다.
 */
@Entity
@Table(name = "advertisements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Advertisement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 광고 이름 겸 이미지 대체텍스트(alt)
    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(name = "image_url", nullable = false, columnDefinition = "text")
    private String imageUrl;

    @Column(name = "link_url", nullable = false, columnDefinition = "text")
    private String linkUrl;

    /**
     * 노출 위치 태그('home', 'shorts_feed' 등). <b>NULL이면 위치를 가리지 않는 전역 광고</b>다.
     * 위치가 확정되지 않은 지금은 전부 NULL로 넣어도 모든 배너에 노출된다
     * (조회 규칙은 {@link AdvertisementRepository} 참고).
     */
    @Column(columnDefinition = "text")
    private String placement;

    // 정렬 우선순위. 지금은 노출을 프론트에서 랜덤으로 고르므로 동점 정렬을 고정하는 용도에 가깝다
    @Column(nullable = false)
    private Integer priority;

    // 계약과 무관하게 즉시 내리기 위한 수동 스위치
    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    // 계약 기간. 이 구간 밖이면 코드 수정 없이 자동으로 노출에서 빠진다
    @Column(name = "start_date", nullable = false)
    private Instant startDate;

    @Column(name = "end_date", nullable = false)
    private Instant endDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
