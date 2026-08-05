package com.pet.backend.member;

// 회원 응답 (docs/api-spec.md 1절). password 등 내부 정보는 필드 자체를 두지 않는다
public record MemberResponse(Long id, String email, String name, Role role) {

    public static MemberResponse from(Member member) {
        return new MemberResponse(member.getId(), member.getEmail(),
                member.getName(), member.getRole());
    }
}
