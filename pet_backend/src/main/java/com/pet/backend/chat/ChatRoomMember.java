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
 * 나가기·강퇴는 leftAt + leftReason 기록(소프트) — 참여 이력이 보존된다.
 * 자진 나가기(LEFT)는 재입장 시 새 행, 강퇴(KICKED) 이력이 있으면 재입장 불가.
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

    // 참여 종료 사유 — leftAt과 반드시 함께 기록 (DB CHECK ck_chat_room_member_left)
    @Enumerated(EnumType.STRING)
    @Column(name = "left_reason", length = 10)
    private ChatLeftReason leftReason;

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

    // 자진 나가기 — 재입장하면 새 행이 생긴다
    public void leave() {
        this.leftAt = Instant.now();
        this.leftReason = ChatLeftReason.LEFT;
    }

    // 강퇴 — 이 이력이 남으면 그 방 재입장 불가
    public void kick() {
        this.leftAt = Instant.now();
        this.leftReason = ChatLeftReason.KICKED;
    }

    // MANAGER 지명·해제, 방장 위임의 role 전환 — 권한·대상 검증은 Service가 한다
    public void changeRole(ChatRole role) {
        this.role = role;
    }
}
