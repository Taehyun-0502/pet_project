package com.pet.backend.pet;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PetService {

    private final PetRepository petRepository;

    // memberId는 컨트롤러가 토큰에서 꺼내 넘긴 값 — 소유자 격리의 출발점 (docs/conventions.md 5절)
    @Transactional
    public PetResponse register(Long memberId, PetSaveRequest request) {
        Pet pet = Pet.register(memberId, request.name().trim(),
                normalizeBreed(request.breed()), request.birthDate());
        petRepository.save(pet);
        return PetResponse.from(pet);
    }

    @Transactional(readOnly = true)
    public List<PetResponse> getMyPets(Long memberId) {
        return petRepository.findByMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(memberId)
                .stream()
                .map(PetResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PetResponse getPet(Long memberId, Long petId) {
        return PetResponse.from(getMyPetOrThrow(memberId, petId));
    }

    // 전체 교체 — 생략된 선택 항목은 null이 되어 값이 지워진다 (docs/api-spec.md 2절)
    @Transactional
    public PetResponse update(Long memberId, Long petId, PetSaveRequest request) {
        Pet pet = getMyPetOrThrow(memberId, petId);
        pet.update(request.name().trim(), normalizeBreed(request.breed()), request.birthDate());
        return PetResponse.from(pet);
    }

    // 소프트 삭제 — 생체정보 테이블이 pet_id를 참조하므로 행은 남긴다
    @Transactional
    public void delete(Long memberId, Long petId) {
        getMyPetOrThrow(memberId, petId).delete();
    }

    /**
     * 상세·수정·삭제의 공통 진입점.
     * 소유자·활성 조건을 **쿼리에** 걸어 조회하므로, 없는 id와 남의 id가 코드상 구분되지 않는다
     * — 타인 소유도 동일하게 404다 (docs/api-spec.md 5절의 존재 여부 은닉 규칙).
     */
    private Pet getMyPetOrThrow(Long memberId, Long petId) {
        return petRepository.findByIdAndMemberIdAndDeletedAtIsNull(petId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PET_NOT_FOUND));
    }

    // 빈 문자열("")로 온 선택 입력은 NULL로 통일 — "품종 없음"의 표현이 두 가지가 되는 것을 방지
    private String normalizeBreed(String breed) {
        return (breed == null || breed.isBlank()) ? null : breed.trim();
    }
}
