package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * WalkRecordService 단위 테스트 — Repository는 mock 처리한다(실 DB 접속 테스트는 만들지 않는다).
 */
@ExtendWith(MockitoExtension.class)
class WalkRecordServiceTest {

    @Mock
    private WalkRecordRepository walkRecordRepository;

    private WalkRecordService walkRecordService;

    @Test
    void 기록을_저장하고_응답_DTO로_변환한다() {
        walkRecordService = new WalkRecordService(walkRecordRepository);
        WalkRecord saved = WalkRecord.create(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5);
        when(walkRecordRepository.save(any())).thenReturn(saved);

        WalkRecordCreateRequest request = new WalkRecordCreateRequest(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5);

        WalkRecordResponse response = walkRecordService.create(request);

        assertThat(response.petId()).isEqualTo(1L);
        assertThat(response.distanceMeters()).isEqualTo(1200.5);
        assertThat(response.path()).hasSize(1);
    }

    @Test
    void 목록_조회는_최신순_repository_메서드에_limit을_그대로_전달한다() {
        walkRecordService = new WalkRecordService(walkRecordRepository);
        when(walkRecordRepository.findAllByOrderByStartedAtDesc(any())).thenReturn(List.of());

        walkRecordService.list(5);

        verify(walkRecordRepository).findAllByOrderByStartedAtDesc(PageRequest.of(0, 5));
    }
}
