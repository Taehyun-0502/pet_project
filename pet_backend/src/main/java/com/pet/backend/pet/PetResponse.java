package com.pet.backend.pet;

import java.time.Instant;
import java.time.LocalDate;

// 반려동물 응답 (docs/api-spec.md 2절). DB는 pet_id/pet_name이지만 API 필드는 id/name — DTO가 경계
public record PetResponse(
        Long id,
        String name,
        String breed,
        LocalDate birthDate,
        String profileImageUrl,  // 사진 없으면 null — 프론트가 placeholder 표시
        Instant createdAt
) {

    public static PetResponse from(Pet pet) {
        return new PetResponse(pet.getId(), pet.getName(), pet.getBreed(),
                pet.getBirthDate(), pet.getProfileImageUrl(), pet.getCreatedAt());
    }
}
