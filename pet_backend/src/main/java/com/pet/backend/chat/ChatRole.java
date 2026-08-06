package com.pet.backend.chat;

// 방 내 권한 — 회원 테이블의 Role(MEMBER/ADMIN)과 별개로, 같은 회원이 방마다 다른 권한을 가진다.
// 1차에서는 방장 지정까지만 사용하고, 권한 행사(강퇴·지명·방 삭제)는 2차 (docs/api-spec.md 7절)
public enum ChatRole {
    OWNER,    // 방장 (생성자)
    MANAGER,  // 부방장 — 2차에서 지명 기능 도입
    MEMBER    // 일반 참여자
}
