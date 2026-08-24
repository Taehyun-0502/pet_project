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

    /**
     * 로그인: 활성 회원을 이메일로 조회 (리뷰 백로그 2번 — 대소문자 무시).
     *
     * <p>**파라미터는 이미 정규화된(소문자) 값이어야 한다** — {@code MemberService.normalizeEmail}을 거칠 것.
     * 원문을 그대로 넘기면 대문자가 섞인 입력이 조용히 조회 실패한다.
     *
     * <p>비교를 `lower(email)`로 하는 이유는 두 가지다. ① 저장값 정규화 이전에 만들어진 행(대문자 포함)도
     * 로그인이 되어야 한다. ② 부분 UNIQUE 인덱스가 `lower(email)` 식 인덱스라 조건을 같은 형태로 써야
     * 인덱스를 탄다(`email = ?`로 쓰면 못 탄다).
     */
    @Query("select m from Member m where lower(m.email) = :normalizedEmail and m.deletedAt is null")
    Optional<Member> findActiveByNormalizedEmail(@Param("normalizedEmail") String normalizedEmail);

    /** 회원가입: 이메일 중복 여부 (활성 회원 기준 — 최종 차단은 DB 부분 UNIQUE 인덱스). 위와 같은 정규화 규약. */
    @Query("select count(m) > 0 from Member m where lower(m.email) = :normalizedEmail and m.deletedAt is null")
    boolean existsActiveByNormalizedEmail(@Param("normalizedEmail") String normalizedEmail);

    /**
     * 이름(닉네임) 중복 여부 — 활성 회원 기준, 대소문자 무시.
     *
     * <p><b>파라미터는 이미 소문자로 정규화된 값이어야 한다</b> — 이메일 쪽과 같은 규약이다.
     * SQL에서 {@code lower(:name)}으로 감싸지 않는 이유: 파라미터에 함수를 씌우면 PostgreSQL이
     * 그 자리의 타입을 추론하지 못해 터지는 경우가 있다(채팅 검색에서 겪은 {@code function lower(bytea)
     * does not exist} 계열). 정규화를 Java 쪽에 두면 그 위험 자체가 없어진다.
     *
     * <p>비교 좌변만 {@code lower(m.name)}인 이유는 저장값이 원문이기 때문이고,
     * 이 형태가 곧 들어올 {@code lower(name)} 식 부분 UNIQUE 인덱스와도 맞는다.
     *
     * <p>지금 쓰는 곳은 카카오 가입의 임의 이름 생성뿐이다(중복이면 다시 뽑는다).
     * 이름에 UNIQUE 제약이 아직 없어 이 검사가 유일한 방어이며, 검사와 INSERT 사이의 경쟁은
     * 막지 못한다 — <b>최종 차단은 닉네임 유니크 인덱스를 넣는 F2</b>가 맡는다 (docs/plan-2026-08-13.md).
     */
    @Query("select count(m) > 0 from Member m where lower(m.name) = :normalizedName and m.deletedAt is null")
    boolean existsActiveByNormalizedName(@Param("normalizedName") String normalizedName);

    // 카카오 로그인: 외부 식별자로 활성 계정 조회 (ux_pet_member_provider_active 인덱스 사용)
    Optional<Member> findByProviderAndProviderIdAndDeletedAtIsNull(Provider provider, String providerId);

    // 활성 회원 조회 — 서비스 진입점의 공통 검증. 활성 조건이 쿼리에 있어
    // findById().filter(!isDeleted()) 복붙(백로그 95번)이 필요 없다 (pet 리포지토리와 같은 방식)
    Optional<Member> findByIdAndDeletedAtIsNull(Long id);

    // 활성 회원 존재 검사 — 다른 도메인(pet 등) 진입점용. 탈퇴 후 액세스 토큰이 살아 있는
    // 최대 15분 동안의 접근을 서비스 계층에서 차단한다 (백로그 8번, docs/api-spec.md 1절 6차)
    boolean existsByIdAndDeletedAtIsNull(Long id);

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

    /**
     * 기기 원격 로그아웃 전용 — 활성 회원 행을 **배타 잠금**으로 읽는다
     * (PostgreSQL `FOR UPDATE`, 리뷰 백로그 109번).
     *
     * <p>회원 행을 고치려는 것이 아니라 {@link #findByIdForShare}(재발급)와 **충돌시키는 것이 목적**이다.
     * 잠금이 없으면 "재발급이 새 토큰을 INSERT(아직 미커밋) → 원격 로그아웃의 일괄 UPDATE가 그 행을
     * 보지 못하고 지나감 → 둘 다 커밋" 순서가 성립해 **끊었다고 응답한 기기가 새 토큰으로 살아남는다.**
     * 사후 재확인은 이 순서를 잡지 못한다 — 그 시점엔 원격 로그아웃이 아직 커밋 전이다.
     *
     * <p>배타 잠금이라야 하는 이유: 공유 잠금끼리는 서로 막지 않아 재발급과 직렬화되지 않는다.
     * 비밀번호 변경이 회원 행 UPDATE로 얻던 직렬화를, 이 기능은 행을 안 고치므로 잠금으로 직접 얻는다.
     * 원격 로그아웃은 드물고 재발급끼리는 여전히 공유 잠금이라 서로 막지 않는다.
     *
     * <p>활성 조건을 쿼리에 넣어 기존 활성 검사 조회를 이 한 번으로 대체한다 (쿼리 추가 없음).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Member m where m.id = :id and m.deletedAt is null")
    Optional<Member> findActiveByIdForUpdate(@Param("id") Long id);
}
