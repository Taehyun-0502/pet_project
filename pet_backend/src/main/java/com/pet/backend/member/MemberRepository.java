package com.pet.backend.member;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 회원 저장소. 모든 조회에 DeletedAtIsNull 조건을 붙여
 * 탈퇴 회원을 "없는 것처럼" 취급한다 (재가입 허용, 로그인 불가 — docs/api-spec.md).
 */
public interface MemberRepository extends JpaRepository<Member, Long> {

    // 로그인: 활성 회원을 이메일로 조회
    Optional<Member> findByEmailAndDeletedAtIsNull(String email);

    // 회원가입: 이메일 중복 여부 (활성 회원 기준 — 최종 차단은 DB 부분 UNIQUE 인덱스)
    boolean existsByEmailAndDeletedAtIsNull(String email);

    // 카카오 로그인: 외부 식별자로 활성 계정 조회 (ux_pet_member_provider_active 인덱스 사용)
    Optional<Member> findByProviderAndProviderIdAndDeletedAtIsNull(Provider provider, String providerId);

    /**
     * 재발급 전용 — 회원 행을 **공유 잠금**으로 읽는다 (PostgreSQL `FOR SHARE`, 리뷰 백로그 77번).
     *
     * <p>비밀번호 변경은 이 행을 UPDATE하므로, 잠금이 없으면 "재발급이 검사를 통과한 뒤 변경이 커밋되고
     * 그 다음에 새 토큰이 INSERT되는" 순서가 성립해 **폐기를 빠져나간 토큰**이 남는다.
     * 공유 잠금이 둘을 직렬화한다 — 재발급이 먼저면 변경의 일괄 폐기가 새 토큰까지 잡고,
     * 변경이 먼저면 재발급이 갱신된 tokens_valid_from을 보고 거부한다.
     *
     * <p>공유(배타 아님)라 **재발급끼리는 서로 막지 않고**, 다른 회원과도 무관하다.
     * 잠금 구간은 이 짧은 트랜잭션 안이며 외부 HTTP가 끼지 않는다 (76번과 상황이 다르다).
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select m from Member m where m.id = :id")
    Optional<Member> findByIdForShare(@Param("id") Long id);
}
