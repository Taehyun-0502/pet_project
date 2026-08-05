package com.pet.backend.member;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 회원 저장소. 모든 조회에 DeletedAtIsNull 조건을 붙여
 * 탈퇴 회원을 "없는 것처럼" 취급한다 (재가입 허용, 로그인 불가 — docs/api-spec.md).
 */
public interface MemberRepository extends JpaRepository<Member, Long> {

    // 로그인: 활성 회원을 이메일로 조회
    Optional<Member> findByEmailAndDeletedAtIsNull(String email);

    // 회원가입: 이메일 중복 여부 (활성 회원 기준 — 최종 차단은 DB 부분 UNIQUE 인덱스)
    boolean existsByEmailAndDeletedAtIsNull(String email);
}
