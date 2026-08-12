package com.pet.backend.member;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사진 URL만 반영하는 짧은 트랜잭션 (리뷰 백로그 80번). {@code PetProfileImageUpdater}와 같은 구조.
 *
 * <p>**별도 클래스로 분리한 이유**: 업로드는 외부 HTTP(Storage) 동안 커넥션을 점유하지 않으려고
 * 의도적으로 비트랜잭션인데, 저장까지 트랜잭션 밖에 두면 재조회한 엔티티가 **detached**라
 * {@code save()}가 {@code merge()}로 동작해 **전 컬럼을 덮어쓴다.** 회원 쪽은 되돌아가는 컬럼에
 * {@code password}와 {@code tokens_valid_from}이 포함돼 있어 단순한 데이터 유실이 아니라
 * **보안 보장을 되돌리는 경로**였다 — 사진 업로드가 방금 커밋된 비밀번호 변경을 무효화하면
 * 77번이 끊어낸 토큰이 되살아난다.
 * (같은 클래스 안에서 호출하면 프록시를 타지 않아 @Transactional이 무시되므로 빈을 따로 둔다)
 */
@Component
@RequiredArgsConstructor
class MemberProfileImageUpdater {

    private final MemberRepository memberRepository;

    @Transactional
    Member apply(Long memberId, String profileImageUrl) {
        Member member = memberRepository.findByIdAndDeletedAtIsNull(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        member.changeProfileImage(profileImageUrl);
        return member;
    }
}
