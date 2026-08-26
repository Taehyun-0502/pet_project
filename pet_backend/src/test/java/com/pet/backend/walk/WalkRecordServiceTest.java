package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pet.backend.common.BusinessException;
import com.pet.backend.pet.PetErrorCode;
import com.pet.backend.pet.PetResponse;
import com.pet.backend.pet.PetService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * WalkRecordService 단위 테스트 — Repository·PetService는 mock 처리한다(실 DB 접속 테스트는
 * 만들지 않는다). 소유권 검증·조회 스코프 필터링(QA H-1, IDOR 수정)을 중심으로 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class WalkRecordServiceTest {

    @Mock
    private WalkRecordRepository walkRecordRepository;

    @Mock
    private PetService petService;

    private WalkRecordService walkRecordService;

    private WalkRecordCreateRequest createRequest(Long petId) {
        return new WalkRecordCreateRequest(
                petId,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5);
    }

    @Test
    void 내_반려동물_petId로_저장하면_소유권_검증_후_기록을_저장한다() {
        walkRecordService = new WalkRecordService(walkRecordRepository, petService);
        WalkRecord saved = WalkRecord.create(
                1L,
                Instant.parse("2026-08-12T05:00:00Z"),
                Instant.parse("2026-08-12T05:30:00Z"),
                1800, 1200.5,
                List.of(new GeoPoint(37.5665, 126.9780)),
                31.2, 47.5);
        when(walkRecordRepository.save(any())).thenReturn(saved);

        WalkRecordResponse response = walkRecordService.create(100L, createRequest(1L));

        verify(petService).getPet(100L, 1L);
        assertThat(response.petId()).isEqualTo(1L);
        assertThat(response.distanceMeters()).isEqualTo(1200.5);
        assertThat(response.path()).hasSize(1);
    }

    // QA H-1 ② — 타인 petId로 저장을 시도하면 거부돼야 한다. petService.getPet()은 소유가
    // 아니면(또는 존재하지 않으면) PetErrorCode.NOT_FOUND(404)를 던진다 — walk가 소유권 판정을
    // 복제하지 않고 pet 도메인의 public API를 그대로 신뢰한다.
    @Test
    void 타인_petId로_저장하면_거부되고_기록을_저장하지_않는다() {
        walkRecordService = new WalkRecordService(walkRecordRepository, petService);
        when(petService.getPet(100L, 999L)).thenThrow(new BusinessException(PetErrorCode.NOT_FOUND));

        assertThatThrownBy(() -> walkRecordService.create(100L, createRequest(999L)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(PetErrorCode.NOT_FOUND));

        verify(walkRecordRepository, never()).save(any());
    }

    // QA H-1 ① — 조회는 인증된 memberId 소유의 petId 목록으로만 필터링해야 한다(다른 사용자
    // 기록은 조회 결과에 포함되지 않음).
    @Test
    void 목록_조회는_내_반려동물_petId_목록으로만_필터링한다() {
        walkRecordService = new WalkRecordService(walkRecordRepository, petService);
        when(petService.getMyPets(100L)).thenReturn(List.of(
                petResponse(1L), petResponse(2L)));
        when(walkRecordRepository.findAllByPetIdInOrderByStartedAtDesc(any(), any())).thenReturn(List.of());

        walkRecordService.list(100L, 5);

        verify(walkRecordRepository)
                .findAllByPetIdInOrderByStartedAtDesc(List.of(1L, 2L), PageRequest.of(0, 5));
    }

    @Test
    void 내_반려동물이_없으면_레포지토리_조회_없이_빈_목록을_반환한다() {
        walkRecordService = new WalkRecordService(walkRecordRepository, petService);
        when(petService.getMyPets(100L)).thenReturn(List.of());

        List<WalkRecordResponse> result = walkRecordService.list(100L, 5);

        assertThat(result).isEmpty();
        verify(walkRecordRepository, never()).findAllByPetIdInOrderByStartedAtDesc(any(), any());
    }

    private PetResponse petResponse(Long id) {
        return new PetResponse(id, "이름", null, null, null, Instant.now());
    }
}
