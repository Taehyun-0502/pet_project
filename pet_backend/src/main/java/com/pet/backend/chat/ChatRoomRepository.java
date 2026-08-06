package com.pet.backend.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    // 전체 활성 방 목록 (오픈채팅 — 참여 여부와 무관하게 공개, 최신 생성순)
    List<ChatRoom> findByDeletedAtIsNullOrderByCreatedAtDesc();
}
