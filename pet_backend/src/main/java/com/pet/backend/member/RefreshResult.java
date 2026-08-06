package com.pet.backend.member;

import com.pet.backend.member.dto.TokenResponse;

// 재발급 결과 — 바디로 나갈 액세스 토큰과 쿠키로 나갈 새 리프레시 토큰 (LoginResult와 같은 역할)
record RefreshResult(TokenResponse response, String refreshToken) {}
