package com.pet.backend.member.dto;

import com.pet.backend.member.Member;
import com.pet.backend.member.Provider;
import com.pet.backend.member.Role;

// 회원 응답 (docs/api-spec.md 1절). password 등 내부 정보는 필드 자체를 두지 않는다.
// email은 소셜 계정이 이메일 미동의면 null. provider는 프론트가 소셜 계정을 구분하는 용도
// (비밀번호 변경 폼 숨김 등 — 4차)
public record MemberResponse(Long id, String email, String name, Role role, Provider provider) {

    public static MemberResponse from(Member member) {
        return new MemberResponse(member.getId(), member.getEmail(),
                member.getName(), member.getRole(), member.getProvider());
    }
}
