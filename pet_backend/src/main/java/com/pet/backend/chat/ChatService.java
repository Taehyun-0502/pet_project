package com.pet.backend.chat;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomMemberRepository chatRoomMemberRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final MemberRepository memberRepository; // 발신자 이름 조회용

    // 방 생성 + 생성자의 OWNER 참여를 한 트랜잭션으로 — 참여자 없는 방이 생기지 않게
    @Transactional
    public ChatRoomResponse createRoom(Long memberId, ChatRoomCreateRequest request) {
        ChatRoom room = ChatRoom.create(request.name().trim(), memberId);
        chatRoomRepository.save(room);
        chatRoomMemberRepository.save(ChatRoomMember.owner(room.getId(), memberId));
        return ChatRoomResponse.of(room, 1);
    }

    @Transactional(readOnly = true)
    public List<ChatRoomResponse> getRooms() {
        List<ChatRoom> rooms = chatRoomRepository.findByDeletedAtIsNullOrderByCreatedAtDesc();
        if (rooms.isEmpty()) {
            return List.of();
        }
        // 참여자 수는 group by 쿼리 한 번으로 일괄 집계 (방마다 count하면 N+1)
        List<Long> roomIds = rooms.stream().map(ChatRoom::getId).toList();
        Map<Long, Long> counts = chatRoomMemberRepository.countActiveByRoomIds(roomIds).stream()
                .collect(Collectors.toMap(
                        ChatRoomMemberRepository.RoomParticipantCount::getRoomId,
                        ChatRoomMemberRepository.RoomParticipantCount::getParticipantCount));
        return rooms.stream()
                .map(room -> ChatRoomResponse.of(room, counts.getOrDefault(room.getId(), 0L)))
                .toList();
    }

    /**
     * 입장 — 이미 참여 중이면 그대로 성공 (멱등, docs/api-spec.md 7절).
     * 의도적으로 @Transactional을 걸지 않았다: 각 단계가 독립된 단문이고,
     * 동시 입장 경쟁으로 DB 부분 UNIQUE가 INSERT를 거부해도 그 실패를
     * "이미 참여됨 = 성공"으로 흡수해야 하는데, 트랜잭션 안에서 제약 위반을 잡으면
     * 트랜잭션 전체가 롤백 전용으로 표시되어 이후 처리가 불가능하기 때문.
     */
    public ChatRoomResponse join(Long memberId, Long roomId) {
        ChatRoom room = getActiveRoom(roomId);
        if (!chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)) {
            try {
                chatRoomMemberRepository.save(ChatRoomMember.join(roomId, memberId));
            } catch (DataIntegrityViolationException e) {
                // 동시 입장 경쟁 — 다른 요청이 먼저 참여시킴. 멱등 정책상 성공으로 취급
            }
        }
        long count = chatRoomMemberRepository.countActiveByRoomIds(List.of(roomId)).stream()
                .mapToLong(ChatRoomMemberRepository.RoomParticipantCount::getParticipantCount)
                .findFirst()
                .orElse(0L);
        return ChatRoomResponse.of(room, count);
    }

    @Transactional
    public ChatMessageResponse sendMessage(Long memberId, Long roomId, ChatMessageCreateRequest request) {
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        ChatMessage message = ChatMessage.of(roomId, memberId, request.content().trim());
        chatMessageRepository.save(message);
        String senderName = memberRepository.findById(memberId)
                .map(Member::getName)
                .orElse("알 수 없음");
        return ChatMessageResponse.of(message, senderName);
    }

    // afterId 없으면 최근 50개, 있으면 그 이후 전부 (폴링·복구 공용 — docs/api-spec.md 7절)
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(Long memberId, Long roomId, Long afterId) {
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);

        List<ChatMessage> messages;
        if (afterId == null) {
            // 최근 50개를 내림차순으로 뽑은 뒤 시간순(오름차순)으로 뒤집는다
            messages = new ArrayList<>(chatMessageRepository.findTop50ByRoomIdOrderByIdDesc(roomId));
            Collections.reverse(messages);
        } else {
            messages = chatMessageRepository.findByRoomIdAndIdGreaterThanOrderByIdAsc(roomId, afterId);
        }
        if (messages.isEmpty()) {
            return List.of();
        }

        // 발신자 이름 일괄 조회 — 메시지마다 회원을 조회하면 N+1
        Set<Long> senderIds = messages.stream().map(ChatMessage::getSenderId).collect(Collectors.toSet());
        Map<Long, String> senderNames = memberRepository.findAllById(senderIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getName));
        return messages.stream()
                .map(message -> ChatMessageResponse.of(message,
                        senderNames.getOrDefault(message.getSenderId(), "알 수 없음")))
                .toList();
    }

    // 없거나 소프트 삭제된 방은 동일하게 404 (docs/api-spec.md 5절의 존재 여부 은닉 규칙)
    private ChatRoom getActiveRoom(Long roomId) {
        return chatRoomRepository.findById(roomId)
                .filter(room -> !room.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND));
    }

    // 참여자 검증 — 이 도메인의 소유자 격리 (docs/conventions.md 5절 패턴)
    private void requireParticipant(Long roomId, Long memberId) {
        if (!chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)) {
            throw new BusinessException(ErrorCode.CHAT_NOT_PARTICIPANT);
        }
    }
}
