package com.pet.backend.member.dto;

import com.pet.backend.member.Member;

/**
 * 공개 회원 프로필 (docs/api-spec.md 1절 7차) — 타인에게 보여도 되는 **최소 집합의 단일 출처**.
 *
 * MemberResponse를 재사용하지 않는 이유: 그쪽엔 email·provider가 있어 매핑 실수 한 번이
 * 곧 정보 노출이다. 이 record에 비공개 필드가 아예 없는 것 자체가 방어이므로,
 * 필드를 추가하려면 명세 개정(api-spec 1절 7차)을 먼저 거쳐야 한다.
 */
public record MemberProfileResponse(Long id, String name, String profileImageUrl) {

    public static MemberProfileResponse from(Member member) {
        return new MemberProfileResponse(
                member.getId(), member.getName(), member.getProfileImageUrl());
    }
}
