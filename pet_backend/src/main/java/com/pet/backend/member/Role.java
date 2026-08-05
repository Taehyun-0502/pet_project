package com.pet.backend.member;

// 한 계정 = 역할 1개. 현재 가입자는 전원 MEMBER, ADMIN은 DB에서 직접 지정 (docs/erd.md)
public enum Role {
    MEMBER,
    ADMIN
}
