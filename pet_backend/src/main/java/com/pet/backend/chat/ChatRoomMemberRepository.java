package com.pet.backend.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {

    // 참여자 검증 — 메시지 조회/전송 전 Service가 반드시 확인 (이 도메인의 소유자 격리)
    boolean existsByRoomIdAndMemberIdAndLeftAtIsNull(Long roomId, Long memberId);

    // 참여 중인 행 조회 — 나가기·강퇴·지명·위임의 대상 행
    Optional<ChatRoomMember> findByRoomIdAndMemberIdAndLeftAtIsNull(Long roomId, Long memberId);

    /**
     * 특정 행이 아직 참여 중인가 — join 보상(`revertIfJoinLost`)이 **자기가 INSERT한 행만** 되돌리기 위한 조회
     * (리뷰 백로그 114번).
     *
     * <p>`leftAtIsNull` 조건이 함께 있어야 한다. 그 사이 강퇴가 커밋돼 이미 종료된 행이라면
     * 보상이 `leave()`를 덮어써 **`KICKED` 이력이 `LEFT`로 바뀌고 재입장 차단이 풀린다** —
     * 보상 대상을 좁히려다 강퇴를 무력화하는 셈이라, id로 좁히는 것과 이 조건은 한 쌍이다.
     */
    Optional<ChatRoomMember> findByIdAndLeftAtIsNull(Long id);

    // 강퇴 이력 검사 — 입장 시 재입장 차단 (부분 인덱스 ix_chat_room_member_kicked)
    boolean existsByRoomIdAndMemberIdAndLeftReason(Long roomId, Long memberId, ChatLeftReason leftReason);

    // 참여자 목록 — 입장순. role 우선 정렬은 Service가 담당
    List<ChatRoomMember> findByRoomIdAndLeftAtIsNullOrderByJoinedAtAsc(Long roomId);

    /**
     * 내가 참여 중인 방들의 참여 행 (F7 — 내 방 목록).
     *
     * <p>삭제된 방은 제외한다. 방을 지워도 참여 행은 활성으로 남는 설계라
     * (existsActiveOwnedRoom 주석 참조) 이 조건이 없으면 없어진 방이 내 목록에 계속 보인다.
     */
    @Query("""
            select crm from ChatRoomMember crm
            where crm.memberId = :memberId and crm.leftAt is null
              and exists (select 1 from ChatRoom r where r.id = crm.roomId and r.deletedAt is null)
            """)
    List<ChatRoomMember> findActiveByMemberId(@Param("memberId") Long memberId);

    /**
     * 고정한 방 개수 (F7 — 상한 검사). 위와 같은 이유로 <b>삭제된 방의 고정은 세지 않는다</b> —
     * 없어진 방이 고정 한도를 조용히 잡아먹으면 사용자는 이유를 알 수 없다.
     */
    @Query("""
            select count(crm) from ChatRoomMember crm
            where crm.memberId = :memberId and crm.leftAt is null and crm.pinnedAt is not null
              and exists (select 1 from ChatRoom r where r.id = crm.roomId and r.deletedAt is null)
            """)
    long countActivePins(@Param("memberId") Long memberId);

    // 방 목록의 참여자 수 집계용 프로젝션
    interface RoomParticipantCount {
        Long getRoomId();
        long getParticipantCount();
    }

    // 방 여러 개의 참여 인원을 쿼리 한 번으로 집계 — 방마다 count를 따로 날리면 N+1
    @Query("""
            select crm.roomId as roomId, count(crm) as participantCount
            from ChatRoomMember crm
            where crm.leftAt is null and crm.roomId in :roomIds
            group by crm.roomId
            """)
    List<RoomParticipantCount> countActiveByRoomIds(@Param("roomIds") List<Long> roomIds);

    /**
     * 읽음 위치 갱신 (docs/api-spec.md 7절). 벌크 UPDATE인 이유 두 가지:
     * ① 단조 증가 조건(lastReadMessageId < :messageId)이 쿼리 안에 있어 동시 보고끼리 경쟁해도
     *    항상 큰 값이 남는다 — 읽고-비교하고-쓰는 방식의 lost update가 원천적으로 없다.
     * ② 엔티티 변경은 @Version을 올려, 잦은 읽음 보고가 위임·강퇴 같은 권한 변경과
     *    불필요한 409 충돌을 일으킨다. 벌크 UPDATE는 version을 건드리지 않는다(의도).
     * WHERE의 참여 조건이 검증을 겸한다 — 미참여자·과거 값 보고는 0행 갱신(무해한 no-op).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ChatRoomMember crm set crm.lastReadMessageId = :messageId
            where crm.roomId = :roomId and crm.memberId = :memberId and crm.leftAt is null
              and (crm.lastReadMessageId is null or crm.lastReadMessageId < :messageId)
            """)
    int markRead(@Param("roomId") Long roomId, @Param("memberId") Long memberId,
                 @Param("messageId") Long messageId);

    // 방 목록의 안 읽은 수 집계용 프로젝션
    interface RoomUnreadCount {
        Long getRoomId();
        long getUnreadCount();
    }

    /**
     * 활성 방의 OWNER인 참여 행이 있는가 — 회원 탈퇴 차단 검사 (docs/api-spec.md 1절 6차).
     * 삭제된 방의 참여 행은 설계상 활성으로 남으므로(조회 필터 방식) 방 활성을 exists로 함께 확인한다 —
     * 이미 삭제한 방의 방장이었다는 이유로 탈퇴가 막히면 안 된다.
     */
    @Query("""
            select count(crm) > 0 from ChatRoomMember crm
            where crm.memberId = :memberId and crm.role = com.pet.backend.chat.ChatRole.OWNER
              and crm.leftAt is null
              and exists (select 1 from ChatRoom r where r.id = crm.roomId and r.deletedAt is null)
            """)
    boolean existsActiveOwnedRoom(@Param("memberId") Long memberId);

    /**
     * 회원 탈퇴 시 참여 방 일괄 나가기 (docs/api-spec.md 1절 6차) — 탈퇴 회원이 참여자 목록에 남지 않게.
     * 벌크 UPDATE인 이유는 markRead와 같다(@Version 미충돌 + 왕복 1회). MEMBERS_CHANGED 신호는
     * 보내지 않는다 — 열려 있는 참여자 패널은 다음 재조회에 반영된다(명세에 기록된 감수 사항).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ChatRoomMember crm set crm.leftAt = :now, crm.leftReason = :reason
            where crm.memberId = :memberId and crm.leftAt is null
            """)
    int leaveAllByMemberId(@Param("memberId") Long memberId, @Param("now") java.time.Instant now,
                           @Param("reason") ChatLeftReason reason);

    /**
     * 내가 참여 중인 모든 방의 안 읽은 메시지 수를 쿼리 한 번으로 집계 (ix_chat_message_room 사용).
     * 내가 보낸 메시지는 세지 않는다 — 보낸 직후 읽음 보고가 도착하기 전에도 배지가 뜨지 않게.
     * left join이라 안 읽은 메시지가 없는 방도 0으로 돌아온다.
     */
    @Query("""
            select crm.roomId as roomId, count(msg.id) as unreadCount
            from ChatRoomMember crm
            left join ChatMessage msg
                on msg.roomId = crm.roomId
                and msg.id > coalesce(crm.lastReadMessageId, 0)
                and msg.senderId <> crm.memberId
            where crm.memberId = :memberId and crm.leftAt is null
            group by crm.roomId
            """)
    List<RoomUnreadCount> countUnreadByMember(@Param("memberId") Long memberId);
}
