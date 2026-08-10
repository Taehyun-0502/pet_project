package com.pet.backend.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * 회원. 스키마의 기준은 docs/schema.sql이며 이 엔티티는 매핑만 담당한다 (ddl-auto=validate).
 * CHECK 제약(LOCAL이면 password 필수 등)과 부분 UNIQUE 인덱스(활성 회원 기준 email 중복 방지)는
 * DB에만 존재하므로, 애플리케이션 검증을 통과해도 최종 차단은 DB에서 일어날 수 있다.
 */
@Entity
@Table(name = "pet_member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // LOCAL의 로그인 ID. 소셜 계정은 이메일 미동의 시 NULL — "이메일 없는 계정은 소셜뿐"은
    // DB CHECK(ck_pet_member_provider_integrity)가 보장한다 (2026-08-10 개정)
    @Column(length = 255)
    private String email;

    // BCrypt 해시(60자)만 저장. 소셜 계정은 NULL
    @Column(length = 60)
    private String password;

    @Column(nullable = false, length = 50)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Provider provider;

    @Column(name = "provider_id", length = 255)
    private String providerId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // NULL = 활성 회원. 탈퇴 시각 기록 (소프트 삭제)
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private Member(String email, String password, String name,
                   Role role, Provider provider, String providerId) {
        this.email = email;
        this.password = password;
        this.name = name;
        this.role = role;
        this.provider = provider;
        this.providerId = providerId;
    }

    // 자체(이메일) 가입 회원. password는 반드시 BCrypt로 인코딩된 값이어야 한다
    public static Member createLocalMember(String email, String encodedPassword, String name) {
        return new Member(email, encodedPassword, name, Role.MEMBER, Provider.LOCAL, null);
    }

    // 카카오 첫 로그인 = 가입. password NULL은 DB CHECK(ck_pet_member_provider_integrity)와 짝이고,
    // email은 미동의 시 null일 수 있다 (2026-08-10 개정)
    public static Member createKakaoMember(String email, String name, String providerId) {
        return new Member(email, null, name, Role.MEMBER, Provider.KAKAO, providerId);
    }

    // password는 반드시 BCrypt로 인코딩된 값이어야 한다 (createLocalMember와 같은 계약)
    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    public void changeName(String name) {
        this.name = name;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void withdraw() {
        this.deletedAt = Instant.now();
    }
}
