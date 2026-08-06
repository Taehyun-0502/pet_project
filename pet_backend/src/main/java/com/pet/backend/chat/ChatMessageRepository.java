package com.pet.backend.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // 초기 로드: 최근 50개 (내림차순으로 뽑아 Service에서 시간순으로 뒤집는다)
    List<ChatMessage> findTop50ByRoomIdOrderByIdDesc(Long roomId);

    // 증분 조회: afterId 이후 전부 — 1차 폴링과 2차 WebSocket 복구가 같이 쓰는 핵심 쿼리
    List<ChatMessage> findByRoomIdAndIdGreaterThanOrderByIdAsc(Long roomId, Long afterId);
}
