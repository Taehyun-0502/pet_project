package com.pet.backend.chat;

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
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

// 오픈채팅방 — 누구나 생성 가능, 생성자가 방장(OWNER). 스키마 기준은 docs/schema.sql
@Entity
@Table(name = "chat_room")
/*
 * 변경된 컬럼만 UPDATE 문에 담는다 (리뷰 백로그 111번).
 *
 * 전 컬럼 UPDATE(Hibernate 기본)면 `updateRoom`이 로드한 스냅샷의 `deleted_at = null`이
 * `deleteRoom` 커밋 뒤에 기록되어 **삭제한 방이 되살아난다**. 방 수정 문에서 그 컬럼이 아예 빠지면
 * 그 경로가 구조적으로 사라진다 — ChatRoomMember가 82번에서 쓴 것과 같은 처방이다.
 *
 * `@Version`을 쓰지 않은 이유: 실제 결함은 잠금 부재가 아니라 전 컬럼 UPDATE이고,
 * @Version은 DDL(version 컬럼)이 필요한 데다 핀의 "마지막 공지가 이긴다"는 확정 설계
 * (docs/api-spec.md 7절 3차)를 409로 깨뜨린다. 아래 pin()의 주석과 짝이다.
 */
@DynamicUpdate
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Long id;

    @Column(name = "room_name", nullable = false, length = 100)
    private String name;

    // 방 생성자(방장)의 회원 id — pet_member.id 참조 FK.
    // chat_room_member.memberId(참여자)와 이름이 같지만, 여기서는 "이 방을 만든 회원"을 의미
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    // 방 프로필 (docs/api-spec.md 7절 3차, 2026-08-11)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ChatCategory category;

    // 소개. NULL = 없음 (빈 문자열은 저장 전 Service가 NULL로 통일)
    @Column(length = 200)
    private String description;

    // 정원. NULL = 무제한. 검사는 join 시점(Service) — 현 인원보다 작게 줄이는 것 허용(신규 입장만 차단)
    @Column(name = "max_members")
    private Integer maxMembers;

    // 공지로 고정된 메시지 id (chat_message.message_id FK). NULL = 공지 없음 (docs/api-spec.md 7절 3차)
    @Column(name = "pinned_message_id")
    private Long pinnedMessageId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // NULL = 활성. 방 삭제는 2차 기능이지만 소프트 삭제 규칙은 지금부터 적용
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private ChatRoom(String name, Long memberId, ChatCategory category,
                     String description, Integer maxMembers) {
        this.name = name;
        this.memberId = memberId;
        this.category = category;
        this.description = description;
        this.maxMembers = maxMembers;
    }

    // memberId = 생성자(방장)가 될 회원. 반드시 토큰에서 꺼낸 값이어야 한다
    public static ChatRoom create(String name, Long memberId, ChatCategory category,
                                  String description, Integer maxMembers) {
        return new ChatRoom(name, memberId, category, description, maxMembers);
    }

    /**
     * 방 정보 수정 — 전체 교체 (docs/api-spec.md 7절 3차, Pet.update와 같은 의미론).
     * description·maxMembers에 null이 오면 그대로 null — 값을 지우는 수단이기도 하다.
     * OWNER 검증은 Service(requireOwner)가 담당한다.
     * 공지 핀은 여기 포함하지 않는다 — 방 정보를 고쳐도 공지가 지워지면 안 된다 (pet 사진 분리와 같은 원칙).
     */
    public void updateProfile(String name, ChatCategory category,
                              String description, Integer maxMembers) {
        this.name = name;
        this.category = category;
        this.description = description;
        this.maxMembers = maxMembers;
    }

    // 공지 고정(교체 겸용)·해제 — 권한(OWNER·MANAGER)·메시지 소속 검증은 Service.
    // 동시 교체는 마지막 커밋 승리(lost update)를 의도적으로 수용한다 —
    // "마지막 공지가 이긴다"가 자연스러운 의미론이라 @Version을 두지 않는다 (docs/api-spec.md 7절 3차).
    // 클래스의 @DynamicUpdate 덕에 이 수용 범위가 pinned_message_id 한 컬럼으로 좁혀진다 —
    // 핀 교체가 그 사이 바뀐 방 이름이나 deleted_at까지 되돌리지는 않는다 (백로그 111번)
    public void pin(Long messageId) {
        this.pinnedMessageId = messageId;
    }

    public void unpin() {
        this.pinnedMessageId = null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    // 방 삭제(소프트) — OWNER 검증은 Service. 참여 행·메시지는 남기고 조회에서 걸러진다
    public void delete() {
        this.deletedAt = Instant.now();
    }
}
