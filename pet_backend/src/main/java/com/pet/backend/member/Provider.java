package com.pet.backend.member;

// 가입 경로. DB 컬럼은 CHECK 없는 VARCHAR라 값 추가 시 이 enum만 수정하면 된다
public enum Provider {
    LOCAL,
    GOOGLE,
    KAKAO
}
