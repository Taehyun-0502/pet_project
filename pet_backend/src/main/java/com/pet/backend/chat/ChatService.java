package com.pet.backend.chat;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.ErrorCode;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
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
        // 강퇴 이력이 있으면 재입장 불가 (docs/api-spec.md 7절 2차 정책)
        if (chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftReason(
                roomId, memberId, ChatLeftReason.KICKED)) {
            throw new BusinessException(ErrorCode.CHAT_KICKED);
        }
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
        // 발신자 이름 조회를 INSERT보다 먼저 — INSERT 후 추가 왕복이 있으면
        // id 채번과 커밋 사이 구간이 길어져, 그 사이 더 큰 id가 먼저 커밋되면
        // afterId 폴링이 이 메시지를 건너뛸 수 있다 (docs/troubleshooting.md 3번)
        String senderName = memberRepository.findById(memberId)
                .map(Member::getName)
                .orElse("알 수 없음");
        ChatMessage message = ChatMessage.of(roomId, memberId, request.content().trim());
        chatMessageRepository.save(message);
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

    // 참여자 목록 — OWNER → MANAGER → MEMBER 순, 같은 role끼리는 입장순 (docs/api-spec.md 7절)
    @Transactional(readOnly = true)
    public List<ChatMemberResponse> getRoomMembers(Long memberId, Long roomId) {
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        List<ChatRoomMember> members = chatRoomMemberRepository
                .findByRoomIdAndLeftAtIsNullOrderByJoinedAtAsc(roomId);
        // 이름 일괄 조회 — 참여자마다 회원을 조회하면 N+1
        Set<Long> memberIds = members.stream().map(ChatRoomMember::getMemberId).collect(Collectors.toSet());
        Map<Long, String> names = memberRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getName));
        return members.stream()
                // enum 선언 순서(OWNER=0, MANAGER=1, MEMBER=2)가 곧 표시 순서. 정렬은 안정적이라 입장순 유지
                .sorted(Comparator.comparingInt(member -> member.getRole().ordinal()))
                .map(member -> new ChatMemberResponse(member.getMemberId(),
                        names.getOrDefault(member.getMemberId(), "알 수 없음"), member.getRole()))
                .toList();
    }

    // 나가기 — OWNER는 위임(delegate) 전에는 나갈 수 없다
    @Transactional
    public void leave(Long memberId, Long roomId) {
        getActiveRoom(roomId);
        ChatRoomMember me = chatRoomMemberRepository
                .findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAT_NOT_PARTICIPANT));
        if (me.getRole() == ChatRole.OWNER) {
            throw new BusinessException(ErrorCode.CHAT_OWNER_CANNOT_LEAVE);
        }
        me.leave();
    }

    // 강퇴 — 강퇴된 회원은 이 방에 재입장할 수 없다
    @Transactional
    public void kick(Long actorId, Long roomId, Long targetMemberId) {
        getActiveRoom(roomId);
        ChatRoomMember actor = chatRoomMemberRepository
                .findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, actorId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAT_NOT_PARTICIPANT));
        if (actorId.equals(targetMemberId)) {
            // 자기 자신은 강퇴 대상이 아니다 — 나가기를 쓴다
            throw new BusinessException(ErrorCode.CHAT_ROLE_FORBIDDEN);
        }
        ChatRoomMember target = getActiveMember(roomId, targetMemberId);
        if (!canKick(actor.getRole(), target.getRole())) {
            throw new BusinessException(ErrorCode.CHAT_ROLE_FORBIDDEN);
        }
        target.kick();
    }

    // MANAGER 지명·해제 — OWNER만. OWNER로의 변경은 delegate가 담당
    @Transactional
    public void changeRole(Long actorId, Long roomId, Long targetMemberId, ChatRole newRole) {
        getActiveRoom(roomId);
        requireOwner(roomId, actorId);
        if (newRole == ChatRole.OWNER) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "OWNER로의 변경은 위임 API(/delegate)를 사용해야 합니다.");
        }
        if (actorId.equals(targetMemberId)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "자기 자신의 역할은 변경할 수 없습니다.");
        }
        getActiveMember(roomId, targetMemberId).changeRole(newRole);
    }

    // 방장 위임 — 대상이 OWNER가 되고 기존 방장은 MEMBER로. 한 트랜잭션이라 방마다 OWNER는 항상 1명
    @Transactional
    public void delegate(Long actorId, Long roomId, Long targetMemberId) {
        getActiveRoom(roomId);
        ChatRoomMember actor = requireOwner(roomId, actorId);
        if (actorId.equals(targetMemberId)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR,
                    "자기 자신에게는 위임할 수 없습니다.");
        }
        ChatRoomMember target = getActiveMember(roomId, targetMemberId);
        target.changeRole(ChatRole.OWNER);
        actor.changeRole(ChatRole.MEMBER);
    }

    // 방 삭제(소프트) — 참여 행·메시지는 그대로 두고, 모든 조회가 삭제된 방을 걸러낸다
    @Transactional
    public void deleteRoom(Long actorId, Long roomId) {
        ChatRoom room = getActiveRoom(roomId);
        requireOwner(roomId, actorId);
        room.delete();
    }

    // 강퇴 권한 매트릭스: OWNER는 MANAGER·MEMBER, MANAGER는 MEMBER만, MEMBER는 불가 (OWNER는 누구도 못 강퇴)
    private boolean canKick(ChatRole actor, ChatRole target) {
        return switch (actor) {
            case OWNER -> target != ChatRole.OWNER;
            case MANAGER -> target == ChatRole.MEMBER;
            case MEMBER -> false;
        };
    }

    // OWNER 검증 — 미참여든 권한 부족이든 동일하게 403 CHAT_ROLE_FORBIDDEN (docs/api-spec.md 7절)
    private ChatRoomMember requireOwner(Long roomId, Long memberId) {
        return chatRoomMemberRepository.findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .filter(member -> member.getRole() == ChatRole.OWNER)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAT_ROLE_FORBIDDEN));
    }

    // 강퇴·지명·위임의 대상 행 조회 — 참여 중이 아니면 404
    private ChatRoomMember getActiveMember(Long roomId, Long memberId) {
        return chatRoomMemberRepository.findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAT_MEMBER_NOT_FOUND));
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
