package com.pet.backend.pet;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 반려동물 저장소. 조회는 항상 MemberId 조건과 DeletedAtIsNull을 함께 걸어
 * "내 것만, 활성만" 원칙을 쿼리 레벨에서 강제한다 (docs/conventions.md 5절).
 */
public interface PetRepository extends JpaRepository<Pet, Long> {

    // 내 반려동물 목록 (최근 등록순). 등록(INSERT)은 상속받은 save()가 담당
    List<Pet> findByMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(Long memberId);

    /**
     * 단건 조회 — 상세·수정·삭제가 모두 이 메서드를 거친다.
     * **소유자 조건을 쿼리에 포함**하는 것이 핵심이다. 먼저 id로 찾고 나서 소유자를 비교하면
     * "없음"과 "남의 것"이 코드상 갈라져 id 존재 여부가 새어나간다 (docs/conventions.md 5절).
     */
    Optional<Pet> findByIdAndMemberIdAndDeletedAtIsNull(Long petId, Long memberId);
}
