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

/**
 * 방 참여 관계 + 방 내 권한.
 * 나가기·강퇴는 leftAt 기록(소프트), 재입장은 새 행 — 참여 이력이 보존된다.
 * "참여 중 기준 같은 방 중복 입장 차단"은 DB 부분 UNIQUE 인덱스(ux_chat_room_member_active)가 담당.
 */
@Entity
@Table(name = "chat_room_member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatRoomMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_id", nullable = false)
    private Long roomId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ChatRole role;

    @CreationTimestamp
    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    // NULL = 참여 중
    @Column(name = "left_at")
    private Instant leftAt;

    private ChatRoomMember(Long roomId, Long memberId, ChatRole role) {
        this.roomId = roomId;
        this.memberId = memberId;
        this.role = role;
    }

    // 방 생성자용 — OWNER로 참여
    public static ChatRoomMember owner(Long roomId, Long memberId) {
        return new ChatRoomMember(roomId, memberId, ChatRole.OWNER);
    }

    // 일반 입장
    public static ChatRoomMember join(Long roomId, Long memberId) {
        return new ChatRoomMember(roomId, memberId, ChatRole.MEMBER);
    }

    // 나가기·강퇴 (2차 기능이지만 상태 변화 규칙은 엔티티에 정의)
    public void leave() {
        this.leftAt = Instant.now();
    }
}
