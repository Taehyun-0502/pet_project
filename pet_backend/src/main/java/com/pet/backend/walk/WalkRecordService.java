package com.pet.backend.walk;

import com.pet.backend.pet.PetResponse;
import com.pet.backend.pet.PetService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 산책 기록 저장/조회. 소유권 검증·스코프 필터링(QA H-1, IDOR 수정)은 pet 도메인의 public API인
 * {@link PetService}를 재사용한다 — walk 도메인이 pet 소유권 판정 로직을 복제하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class WalkRecordService {

    private final WalkRecordRepository walkRecordRepository;
    private final PetService petService;

    @Transactional
    public WalkRecordResponse create(Long memberId, WalkRecordCreateRequest request) {
        // petService.getPet()이 memberId 소유(+활성)가 아니면 PetErrorCode.NOT_FOUND(404)를
        // 던진다 — 반환값 자체는 쓰지 않고 소유권 검증 용도로만 호출한다.
        petService.getPet(memberId, request.petId());

        WalkRecord record = WalkRecord.create(
                request.petId(),
                request.startedAt(),
                request.endedAt(),
                request.durationSeconds(),
                request.distanceMeters(),
                request.path(),
                request.airTemp(),
                request.asphaltTemp());
        return WalkRecordResponse.from(walkRecordRepository.save(record));
    }

    @Transactional(readOnly = true)
    public List<WalkRecordResponse> list(Long memberId, int limit) {
        List<Long> myPetIds = petService.getMyPets(memberId).stream()
                .map(PetResponse::id)
                .toList();
        if (myPetIds.isEmpty()) {
            return List.of();
        }
        return walkRecordRepository.findAllByPetIdInOrderByStartedAtDesc(myPetIds, PageRequest.of(0, limit))
                .stream()
                .map(WalkRecordResponse::from)
                .toList();
    }
}
