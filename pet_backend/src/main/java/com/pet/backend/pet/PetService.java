package com.pet.backend.pet;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import com.pet.backend.common.ImageStorageClient;
import com.pet.backend.member.MemberErrorCode;
import com.pet.backend.member.MemberRepository;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class PetService {

    private final PetRepository petRepository;
    private final ImageStorageClient imageStorageClient;
    // 사진 URL 저장만 담당하는 짧은 트랜잭션 (백로그 80번 — 클래스 주석 참고)
    private final PetProfileImageUpdater petProfileImageUpdater;
    // 탈퇴 회원 차단용 (백로그 8번) — 탈퇴 후에도 액세스 토큰이 최대 15분 유효하므로
    // 토큰만 믿으면 그동안 pet CRUD가 열린다. 모든 진입점이 requireActiveMember를 먼저 탄다
    private final MemberRepository memberRepository;

    // memberId는 컨트롤러가 토큰에서 꺼내 넘긴 값 — 소유자 격리의 출발점 (docs/conventions.md 5절)
    @Transactional
    public PetResponse register(Long memberId, PetSaveRequest request) {
        requireActiveMember(memberId);
        Pet pet = Pet.register(memberId, request.name().trim(),
                normalizeBreed(request.breed()), request.birthDate());
        petRepository.save(pet);
        return PetResponse.from(pet);
    }

    @Transactional(readOnly = true)
    public List<PetResponse> getMyPets(Long memberId) {
        requireActiveMember(memberId);
        return petRepository.findByMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc(memberId)
                .stream()
                .map(PetResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PetResponse getPet(Long memberId, Long petId) {
        requireActiveMember(memberId);
        return PetResponse.from(getMyPetOrThrow(memberId, petId));
    }

    // 전체 교체 — 생략된 선택 항목은 null이 되어 값이 지워진다 (docs/api-spec.md 2절)
    @Transactional
    public PetResponse update(Long memberId, Long petId, PetSaveRequest request) {
        requireActiveMember(memberId);
        Pet pet = getMyPetOrThrow(memberId, petId);
        pet.update(request.name().trim(), normalizeBreed(request.breed()), request.birthDate());
        return PetResponse.from(pet);
    }

    // 소프트 삭제 — 생체정보 테이블이 pet_id를 참조하므로 행은 남긴다
    @Transactional
    public void delete(Long memberId, Long petId) {
        requireActiveMember(memberId);
        getMyPetOrThrow(memberId, petId).delete();
    }

    /**
     * 프로필 사진 업로드 (docs/api-spec.md 2절).
     *
     * 의도적으로 **비트랜잭션**이다 — Storage 업로드(외부 HTTP, 수 초 가능)를 트랜잭션 안에서 하면
     * 그동안 커넥션을 점유한다(풀이 작은 환경의 병목). 소유자 검증 → 업로드 → 짧은 저장 순서로 가고,
     * 저장만 {@link PetProfileImageUpdater}의 짧은 트랜잭션에 맡긴다 (리뷰 백로그 80번 —
     * 저장까지 트랜잭션 밖에 두면 detached merge가 전 컬럼을 덮어써 그 사이의 이름·품종 수정을 되돌린다).
     * 검증과 저장 사이에 pet이 삭제되는 극단 경쟁은 저장 단계의 재조회가 404로 걸러낸다
     * (Storage에 파일만 남고 DB에는 반영되지 않음 — 고정 경로 덮어쓰기라 무해).
     */
    public PetResponse uploadProfileImage(Long memberId, Long petId, MultipartFile file) {
        imageStorageClient.validateImage(file); // 형식·용량 규칙은 회원 사진과 공유 (ImageStorageClient)
        requireActiveMember(memberId);
        // 업로드 전에 소유자 확인 — 타인 pet 경로에 스토리지 쓰기가 일어나지 않게
        getMyPetOrThrow(memberId, petId);

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }
        // 확장자 없는 고정 경로 — 형식이 바뀌어도 같은 객체를 덮어써 고아 파일이 없다.
        // 경로에 HMAC 접미사가 붙어 열거되지 않는다 (백로그 87번 — ImageStorageClient.profilePath 주석)
        String url = imageStorageClient.upload(
                imageStorageClient.profilePath("pet", petId), bytes, file.getContentType());

        // ?v=업로드시각 — 같은 URL 덮어쓰기의 브라우저 캐시를 무효화한다
        Pet pet = petProfileImageUpdater.apply(
                memberId, petId, url + "?v=" + Instant.now().toEpochMilli());
        return PetResponse.from(pet);
    }

    // 탈퇴(또는 없는) 회원의 접근 차단 — MemberService의 조회와 같은 404 USER_NOT_FOUND
    private void requireActiveMember(Long memberId) {
        if (!memberRepository.existsByIdAndDeletedAtIsNull(memberId)) {
            throw new BusinessException(MemberErrorCode.NOT_FOUND);
        }
    }

    /**
     * 상세·수정·삭제의 공통 진입점.
     * 소유자·활성 조건을 **쿼리에** 걸어 조회하므로, 없는 id와 남의 id가 코드상 구분되지 않는다
     * — 타인 소유도 동일하게 404다 (docs/api-spec.md 5절의 존재 여부 은닉 규칙).
     */
    private Pet getMyPetOrThrow(Long memberId, Long petId) {
        return petRepository.findByIdAndMemberIdAndDeletedAtIsNull(petId, memberId)
                .orElseThrow(() -> new BusinessException(PetErrorCode.NOT_FOUND));
    }

    // 빈 문자열("")로 온 선택 입력은 NULL로 통일 — "품종 없음"의 표현이 두 가지가 되는 것을 방지
    private String normalizeBreed(String breed) {
        return (breed == null || breed.isBlank()) ? null : breed.trim();
    }
}
