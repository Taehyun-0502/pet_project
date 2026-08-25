package com.pet.backend.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

// 채팅 메시지 — append-only (수정·삭제 없음). message_id 오름차순이 곧 시간 순서
@Entity
@Table(name = "chat_message")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "message_id")
    private Long id;

    @Column(name = "room_id", nullable = false)
    private Long roomId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    // 이미지 메시지에서는 NULL이다 (F10b). "둘 중 정확히 하나"는 DB CHECK(ck_chat_message_body)가 보장한다
    @Column(length = 1000)
    private String content;

    /**
     * 이미지 메시지의 Storage 공개 URL (F10b). 텍스트 메시지에서는 NULL.
     *
     * <p>경로에 <b>추측 불가능한 값(UUID)</b>을 쓴다 — 공개 버킷이라 URL을 아는 사람은
     * 방 밖에서도 열람할 수 있고, 순차 id 경로면 남의 대화 사진이 전수 열람된다(백로그 87번 계열).
     *
     * <p>v1은 <b>이미지 단독 메시지</b>다 (2026-08-13 확정) — 캡션을 함께 보내는 것은 범위 밖이라
     * content와 image_url이 동시에 채워지는 일이 없다.
     */
    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private ChatMessage(Long roomId, Long senderId, String content, String imageUrl) {
        this.roomId = roomId;
        this.senderId = senderId;
        this.content = content;
        this.imageUrl = imageUrl;
    }

    public static ChatMessage of(Long roomId, Long senderId, String content) {
        return new ChatMessage(roomId, senderId, content, null);
    }

    // 이미지 메시지 (F10b) — 본문은 없다
    public static ChatMessage ofImage(Long roomId, Long senderId, String imageUrl) {
        return new ChatMessage(roomId, senderId, null, imageUrl);
    }
}
