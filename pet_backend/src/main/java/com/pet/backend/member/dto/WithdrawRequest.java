package com.pet.backend.member.dto;

/**
 * 회원 탈퇴 본인 확인 (docs/api-spec.md 1절 6차). 계정 유형별로 쓰는 필드가 다르다 —
 * LOCAL은 password(현재 비밀번호), 소셜은 confirmPhrase("탈퇴합니다" 정확 일치).
 * 필드별 Bean Validation을 걸지 않는 이유: 어느 쪽이 필수인지가 provider에 달려 있어
 * 판정을 Service(MemberService.withdraw)가 한다.
 */
public record WithdrawRequest(
        String password,
        String confirmPhrase
) {}
