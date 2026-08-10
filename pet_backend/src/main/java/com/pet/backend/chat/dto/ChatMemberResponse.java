package com.pet.backend.chat.dto;

import com.pet.backend.chat.ChatRole;

// 참여자 목록 항목 (docs/api-spec.md 7절) — 강퇴·지명·위임 UI가 대상을 고르는 데 쓴다.
// profileImageUrl은 사진 없으면 null (프론트가 placeholder 표시)
public record ChatMemberResponse(Long memberId, String name, ChatRole role, String profileImageUrl) {}
