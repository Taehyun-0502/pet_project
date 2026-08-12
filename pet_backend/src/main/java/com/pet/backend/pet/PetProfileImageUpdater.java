package com.pet.backend.pet;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사진 URL만 반영하는 짧은 트랜잭션 (리뷰 백로그 80번).
 *
 * <p>**별도 클래스로 분리한 이유**: 업로드 자체는 외부 HTTP(Storage) 동안 커넥션을 점유하지 않으려고
 * 의도적으로 비트랜잭션이다. 그런데 그 상태로 저장까지 하면 재조회한 엔티티가 **detached**라
 * {@code save()}가 {@code merge()}로 동작해 **전 컬럼을 덮어쓴다** — 재조회와 저장 사이에 커밋된
 * 이름·품종 수정이 옛 값으로 되돌아갔다(lost update). 읽기와 쓰기를 하나의 짧은 트랜잭션 안에 넣으면
 * 관리 상태 엔티티의 더티 체킹으로 저장되어 그 창이 사라지고, merge가 추가로 하던 SELECT도 없어진다.
 * (같은 클래스 안에서 호출하면 프록시를 타지 않아 @Transactional이 무시되므로 빈을 따로 둔다 —
 *  {@code RefreshTokenReuseHandler}와 같은 이유)
 */
@Component
@RequiredArgsConstructor
class PetProfileImageUpdater {

    private final PetRepository petRepository;

    /**
     * 소유자·활성 조건은 여기서 다시 확인한다 — 업로드가 진행되는 동안 pet이 삭제됐다면 404다
     * (Storage에는 파일이 남지만 고정 경로 덮어쓰기라 고아가 되지 않는다).
     */
    @Transactional
    Pet apply(Long memberId, Long petId, String profileImageUrl) {
        Pet pet = petRepository.findByIdAndMemberIdAndDeletedAtIsNull(petId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PET_NOT_FOUND));
        pet.changeProfileImage(profileImageUrl);
        return pet;
    }
}
