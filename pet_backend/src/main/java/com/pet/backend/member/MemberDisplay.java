package com.pet.backend.member;

/**
 * 화면 표시용 최소 프로젝션 (리뷰 백로그 98번) — 이름·프로필 사진만.
 * Member 엔티티 전체를 로드하면 비밀번호 해시까지 행 수만큼 메모리에 올라온다
 * (채팅 메시지 50건이면 최대 50행) — 표시에 쓰는 2필드만 DB에서 가져온다.
 */
public interface MemberDisplay {

    Long getId();

    String getName();

    String getProfileImageUrl();
}
