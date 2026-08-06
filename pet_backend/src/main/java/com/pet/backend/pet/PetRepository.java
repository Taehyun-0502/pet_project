package com.pet.backend.pet;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 반려동물 저장소. 조회는 항상 MemberId 조건과 DeletedAtIsNull을 함께 걸어
 * "내 것만, 활성만" 원칙을 쿼리 레벨에서 강제한다 (docs/conventions.md 5절).
 */
public interface PetRepository extends JpaRepository<Pet, Long> {

    // 내 반려동물 목록 (최근 등록순). 등록(INSERT)은 상속받은 save()가 담당
    List<Pet> findByMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(Long memberId);
}
