package com.pet.backend.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {

    // 참여자 검증 — 메시지 조회/전송 전 Service가 반드시 확인 (이 도메인의 소유자 격리)
    boolean existsByRoomIdAndMemberIdAndLeftAtIsNull(Long roomId, Long memberId);

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
