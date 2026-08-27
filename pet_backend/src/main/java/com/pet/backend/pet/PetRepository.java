package com.pet.backend.pet;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/**
 * 반려동물 저장소. 조회는 항상 MemberId 조건과 DeletedAtIsNull을 함께 걸어
 * "내 것만, 활성만" 원칙을 쿼리 레벨에서 강제한다 (docs/conventions.md 5절).
 */
public interface PetRepository extends JpaRepository<Pet, Long> {

    /**
     * 내 반려동물 목록 — 저장된 노출 순서 우선, 순서 미지정(NULL)은 뒤에서 최근 등록순
     * (api-spec.md 2절, 2026-08-27). PostgreSQL은 ASC에서 NULL을 뒤로 보내지만
     * DB를 옮겨도 정렬이 안 바뀌게 nulls last를 명시한다.
     */
    @Query("select p from Pet p where p.memberId = :memberId and p.deletedAt is null "
            + "order by p.sortOrder asc nulls last, p.createdAt desc")
    List<Pet> findMyActiveOrdered(Long memberId);

    /**
     * 단건 조회 — 상세·수정·삭제가 모두 이 메서드를 거친다.
     * **소유자 조건을 쿼리에 포함**하는 것이 핵심이다. 먼저 id로 찾고 나서 소유자를 비교하면
     * "없음"과 "남의 것"이 코드상 갈라져 id 존재 여부가 새어나간다 (docs/conventions.md 5절).
     */
    Optional<Pet> findByIdAndMemberIdAndDeletedAtIsNull(Long petId, Long memberId);
}
