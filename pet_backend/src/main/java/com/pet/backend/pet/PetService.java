package com.pet.backend.pet;

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
    public PetResponse register(Long memberId, PetCreateRequest request) {
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

    // 빈 문자열("")로 온 선택 입력은 NULL로 통일 — "품종 없음"의 표현이 두 가지가 되는 것을 방지
    private String normalizeBreed(String breed) {
        return (breed == null || breed.isBlank()) ? null : breed.trim();
    }
}
