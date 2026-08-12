package com.pet.backend.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // 초기 로드: 최근 50개 (내림차순으로 뽑아 Service에서 시간순으로 뒤집는다)
    List<ChatMessage> findTop50ByRoomIdOrderByIdDesc(Long roomId);

    // 증분 조회(WS 재연결 복구): afterId 이후 최대 500개 — 종전 무제한을 상한 (백로그 12번).
    // 상한에 걸리면(정확히 500개 응답) 클라이언트가 마지막 id로 이어서 재호출한다 (api-spec.md 7절 3차)
    List<ChatMessage> findTop500ByRoomIdAndIdGreaterThanOrderByIdAsc(Long roomId, Long afterId);

    // 과거 로드(위로 스크롤): beforeId보다 오래된 50개 — 초기 로드와 대칭 (3차, api-spec.md 7절)
    List<ChatMessage> findTop50ByRoomIdAndIdLessThanOrderByIdDesc(Long roomId, Long beforeId);

    // 입장 시 읽음 위치 초기화용 — 방의 최신 메시지 (없으면 empty)
    Optional<ChatMessage> findTopByRoomIdOrderByIdDesc(Long roomId);

    // 공지 핀의 메시지 소속 검증 (3차) — 방 조건을 쿼리에 걸어 다른 방 메시지·없는 id를 모두 404로 통일
    Optional<ChatMessage> findByIdAndRoomId(Long id, Long roomId);
}
