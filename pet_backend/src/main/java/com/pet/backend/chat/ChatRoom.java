package com.pet.backend.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

// 오픈채팅방 — 누구나 생성 가능, 생성자가 방장(OWNER). 스키마 기준은 docs/schema.sql
@Entity
@Table(name = "chat_room")
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

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // NULL = 활성. 방 삭제는 2차 기능이지만 소프트 삭제 규칙은 지금부터 적용
    @Column(name = "deleted_at")
    private Instant deletedAt;

    private ChatRoom(String name, Long memberId) {
        this.name = name;
        this.memberId = memberId;
    }

    // memberId = 생성자(방장)가 될 회원. 반드시 토큰에서 꺼낸 값이어야 한다
    public static ChatRoom create(String name, Long memberId) {
        return new ChatRoom(name, memberId);
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
