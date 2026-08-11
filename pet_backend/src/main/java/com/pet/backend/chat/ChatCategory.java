package com.pet.backend.chat;

/**
 * 방 카테고리 (docs/api-spec.md 7절 3차 — 2026-08-11 enum 4종 확정).
 * 자유 해시태그가 아니라 enum 고정인 이유: 목록 필터 칩 UI가 깔끔하고, 표기가 갈라져
 * 필터가 무력화되는 문제(pet breed 자유 입력의 "말티즈/몰티즈")가 없다. 확장은 값 추가 + DB CHECK 갱신.
 */
public enum ChatCategory {
    WALK,     // 산책
    TRAINING, // 훈련
    HEALTH,   // 건강
    FREE      // 자유 — 프로필 도입 전 기존 방의 백필 값이기도 하다
}
