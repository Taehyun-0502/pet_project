package com.pet.backend.pet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * 반려동물 프로필. 스키마 기준은 docs/schema.sql (ddl-auto=validate).
 * 강아지 전용 서비스라 종(species) 컬럼이 없고,
 * 성별·체중 등 생체·의료 정보는 타 팀원의 별도 테이블이 pet_id를 참조해 관리한다.
 */
@Entity
@Table(name = "pet")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Pet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "pet_id")
    private Long id;

    // 보호자 (pet_member.id). 회원 객체가 필요한 유스케이스가 없어
    // @ManyToOne 연관 대신 값으로만 보관 — 지연 로딩 함정 회피
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "pet_name", nullable = false, length = 50)
    private String name;

    // 품종 (자유 입력, 선택)
    @Column(length = 50)
    private String breed;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    // Storage 공개 URL + ?v=타임스탬프 (캐시 무효화). NULL = 사진 없음 (프론트가 placeholder 표시)
    @Column(name = "profile_image_url", length = 500)
    private String profileImageUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // NULL = 활성. 생체정보 테이블이 pet을 참조하므로 물리 삭제 금지 (소프트 삭제)
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private Pet(Long memberId, String name, String breed, LocalDate birthDate) {
        this.memberId = memberId;
        this.name = name;
        this.breed = breed;
        this.birthDate = birthDate;
    }

    // 등록. memberId는 요청 바디가 아니라 반드시 토큰에서 꺼낸 값이어야 한다 (소유자 격리)
    public static Pet register(Long memberId, String name, String breed, LocalDate birthDate) {
        return new Pet(memberId, name, breed, birthDate);
    }

    /**
     * 수정 — 부분 수정이 아니라 전체 교체다(docs/api-spec.md 2절).
     * breed·birthDate에 null이 오면 그대로 null이 되어, 값을 지우는 수단이기도 하다.
     */
    public void update(String name, String breed, LocalDate birthDate) {
        this.name = name;
        this.breed = breed;
        this.birthDate = birthDate;
    }

    // update()에 포함하지 않는 이유: PUT 전체 교체 의미론에 사진이 섞이면
    // 사진 없이 정보만 수정해도 사진이 지워진다 — 사진은 전용 업로드 경로로만 바뀐다
    public void changeProfileImage(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void delete() {
        this.deletedAt = Instant.now();
    }
}
