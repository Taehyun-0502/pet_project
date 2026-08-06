package com.pet.backend.chat;

// 참여 종료 사유 — KICKED 이력이 있는 회원은 그 방에 재입장할 수 없다 (docs/api-spec.md 7절 2차 정책)
public enum ChatLeftReason {
    LEFT,   // 자진 나가기 — 재입장 가능 (새 행)
    KICKED  // 강퇴 — 재입장 불가
}
