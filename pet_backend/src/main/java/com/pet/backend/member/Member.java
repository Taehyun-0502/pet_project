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

    @Column(nullable = false, length = 255)
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

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void withdraw() {
        this.deletedAt = Instant.now();
    }
}
