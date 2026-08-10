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

    // 강퇴 이력 검사 — 입장 시 재입장 차단 (부분 인덱스 ix_chat_room_member_kicked)
    boolean existsByRoomIdAndMemberIdAndLeftReason(Long roomId, Long memberId, ChatLeftReason leftReason);

    // 참여자 목록 — 입장순. role 우선 정렬은 Service가 담당
    List<ChatRoomMember> findByRoomIdAndLeftAtIsNullOrderByJoinedAtAsc(Long roomId);

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
