package com.pet.backend.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
