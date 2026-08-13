package com.pet.backend.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicUpdate;

/**
 * 방 참여 관계 + 방 내 권한.
 * 나가기·강퇴는 leftAt + leftReason 기록(소프트) — 참여 이력이 보존된다.
 * 자진 나가기(LEFT)는 재입장 시 새 행, 강퇴(KICKED) 이력이 있으면 재입장 불가.
 * "참여 중 기준 같은 방 중복 입장 차단"은 DB 부분 UNIQUE 인덱스(ux_chat_room_member_active)가 담당.
 */
@Entity
@Table(name = "chat_room_member")
// 변경된 컬럼만 UPDATE 문에 담는다 (리뷰 백로그 82번).
// last_read_message_id는 벌크 UPDATE(markRead) 전용이라 @Version이 올라가지 않는다 —
// 전 컬럼 UPDATE라면 지명·위임이 자기 스냅샷의 옛 읽음 위치를 다시 써서 배지를 되살리는데,
// version이 그대로라 낙관적 잠금도 이 충돌을 잡지 못했다. 이제 role 변경 문에 그 컬럼이 아예 없다
@DynamicUpdate
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

    /**
     * 마지막으로 읽은 메시지 id (안 읽은 수 집계 기준 — docs/api-spec.md 7절).
     * 입장 시점의 방 최신 메시지 id로 초기화한다 — 입장 전 메시지는 읽은 것으로 취급 (2026-08-10 확정).
     * NULL은 "메시지가 없던 방에 입장" 상태이며 집계에서 0으로 취급(coalesce)한다.
     * 갱신은 엔티티가 아니라 벌크 UPDATE(markRead)로만 한다 — 읽음 보고가 @Version을 올리면
     * 권한 변경(위임·강퇴)과 불필요한 409 충돌을 만들기 때문.
     * 그 대가로 이 컬럼은 낙관적 잠금의 보호를 받지 못하므로, 클래스의 @DynamicUpdate가
     * "권한 변경 UPDATE에는 이 컬럼을 넣지 않는다"로 반대편을 막는다 (백로그 82번).
     */
    @Column(name = "last_read_message_id")
    private Long lastReadMessageId;

    /**
     * 이 방을 목록 위에 고정한 시각 (F7 — docs/plan-2026-08-13.md). NULL = 고정 안 함.
     *
     * <p>고정은 <b>방이 아니라 참여 관계의 속성</b>이다. {@code chat_room}에 두면 한 사람이 고정한 방이
     * 다른 사람 화면에서도 위로 올라간다.
     *
     * <p>불리언이 아니라 시각인 이유: 여러 개를 고정했을 때 "최근에 고정한 것부터"라는 순서가
     * 컬럼 하나로 공짜로 나온다.
     *
     * <p>이 컬럼은 lastReadMessageId와 달리 <b>엔티티 변경</b>으로 갱신한다(@Version이 올라간다).
     * 읽음 보고처럼 잦은 갱신이 아니라 사용자가 직접 누르는 드문 동작이라, 권한 변경과 겹쳐
     * 409가 나더라도 재시도가 자연스럽다.
     */
    @Column(name = "pinned_at")
    private Instant pinnedAt;

    /**
     * 낙관적 잠금 (리뷰 백로그 22번).
     * 위임·나가기·강퇴·지명이 같은 행을 동시에 고치면 나중 커밋이 앞 커밋을 통째로 덮어써
     * "나간 사람이 방장으로 부활"·"활성 OWNER 0명/2명" 같은 상태가 만들어졌다.
     * 이제 늦게 커밋하는 쪽이 실패하고 409로 응답한다.
     * 방마다 활성 OWNER 1명 제약은 DB 부분 UNIQUE(ux_chat_room_owner)가 최종 백스톱.
     */
    @Version
    @Column(nullable = false)
    private Long version;

    private ChatRoomMember(Long roomId, Long memberId, ChatRole role) {
        this.roomId = roomId;
        this.memberId = memberId;
        this.role = role;
    }

    // 방 생성자용 — OWNER로 참여
    public static ChatRoomMember owner(Long roomId, Long memberId) {
        return new ChatRoomMember(roomId, memberId, ChatRole.OWNER);
    }

    // 일반 입장. latestMessageId = 입장 시점의 방 최신 메시지 id (없으면 null)
    public static ChatRoomMember join(Long roomId, Long memberId, Long latestMessageId) {
        ChatRoomMember member = new ChatRoomMember(roomId, memberId, ChatRole.MEMBER);
        member.lastReadMessageId = latestMessageId;
        return member;
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

    // 방 고정 (F7). 개수 상한 검사는 Service가 한다. 이미 고정된 방에 다시 부르면 시각만 갱신되므로
    // Service가 먼저 걸러 "다시 눌러도 순서가 바뀌지 않게" 한다
    public void pin() {
        this.pinnedAt = Instant.now();
    }

    public void unpin() {
        this.pinnedAt = null;
    }

    public boolean isPinned() {
        return pinnedAt != null;
    }
}
