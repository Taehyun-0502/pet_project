package com.pet.backend.chat;

import com.pet.backend.chat.dto.ChatMessageResponse;
import com.pet.backend.member.MemberDisplay;
import com.pet.backend.member.MemberRepository;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이미지 메시지 저장만 담당하는 <b>짧은 트랜잭션</b> (F10b). MemberProfileImageUpdater와 같은 이유로
 * 별도 빈이다 — 업로드(외부 HTTP)는 트랜잭션 밖이어야 하고(conventions.md 1절, 백로그 76번),
 * 저장은 트랜잭션 안이어야 하기 때문이다.
 *
 * <p><b>저장이 트랜잭션 안이어야 하는 이유</b>는 실시간 브로드캐스트다.
 * {@code ChatBroadcaster.onMessageCreated}는 {@code fallbackExecution} 없이 AFTER_COMMIT으로 듣는다 —
 * 트랜잭션 없이 이벤트를 발행하면 <b>조용히 무시되어</b> 상대방 화면에 새로고침 전까지 사진이 뜨지 않는다.
 * (입장 신호가 같은 함정에 빠져 fallbackExecution을 달았던 그 자리다.)
 *
 * <p>ChatService 안의 메서드로 두지 않은 것은 자기 호출(self-invocation)로는 @Transactional이
 * 걸리지 않기 때문이다.
 */
@Component
@RequiredArgsConstructor
class ChatImageMessageWriter {

    private final ChatMessageRepository chatMessageRepository;
    private final MemberRepository memberRepository; // 발신자 이름·사진 조회용
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    ChatMessageResponse write(Long roomId, Long senderId, String imageUrl) {
        // 발신자 조회를 INSERT보다 먼저 두는 이유는 sendMessage와 같다 —
        // id 채번과 커밋 사이가 길어지면 afterId 복구가 이 메시지를 건너뛸 수 있다 (troubleshooting 3번)
        // 표시용 2필드 프로젝션 — 비밀번호 해시를 메모리에 올리지 않는다 (백로그 98번, MemberDisplay 주석)
        MemberDisplay sender = memberRepository.findDisplayByIdIn(Set.of(senderId))
                .stream().findFirst().orElse(null);
        ChatMessage message = ChatMessage.ofImage(roomId, senderId, imageUrl);
        chatMessageRepository.save(message);
        ChatMessageResponse response = ChatMessageResponse.of(message,
                sender != null ? sender.getName() : "알 수 없음",
                sender != null ? sender.getProfileImageUrl() : null);
        eventPublisher.publishEvent(new ChatMessageCreatedEvent(roomId, response));
        return response;
    }
}
