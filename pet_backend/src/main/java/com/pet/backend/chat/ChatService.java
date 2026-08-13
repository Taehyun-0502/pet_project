package com.pet.backend.chat;

import com.pet.backend.chat.dto.ChatMemberResponse;
import com.pet.backend.chat.dto.ChatMessageCreateRequest;
import com.pet.backend.chat.dto.ChatMessageResponse;
import com.pet.backend.chat.dto.ChatRoomResponse;
import com.pet.backend.chat.dto.ChatRoomSaveRequest;
import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import com.pet.backend.common.ImageStorageClient;
import com.pet.backend.member.Member;
import com.pet.backend.member.MemberErrorCode;
import com.pet.backend.member.MemberRepository;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ChatService {

    // 한 사람이 고정할 수 있는 방 개수 (F7, 2026-08-13 확정). 넘으면 400 ROOM_PIN_LIMIT.
    // 상한을 바꾸면 ChatErrorCode.ROOM_PIN_LIMIT의 안내 문구도 함께 고칠 것
    private static final int MAX_PINNED_ROOMS = 5;

    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomMemberRepository chatRoomMemberRepository;
    private final ChatMessageRepository chatMessageRepository;
    // 발신자 이름 조회 + 탈퇴 회원 차단 (백로그 110번 — requireActiveMember 주석 참고)
    private final MemberRepository memberRepository;
    private final ImageStorageClient imageStorageClient; // 채팅 이미지 업로드 (F10b)
    // 이미지 메시지 저장만 담당하는 짧은 트랜잭션 — 업로드는 트랜잭션 밖이어야 한다 (클래스 주석 참고)
    private final ChatImageMessageWriter chatImageMessageWriter;
    // 실시간 통지는 이벤트로 넘긴다 — Service는 WebSocket을 모른다 (수신자는 ChatBroadcaster)
    private final ApplicationEventPublisher eventPublisher;

    // 방 생성 + 생성자의 OWNER 참여를 한 트랜잭션으로 — 참여자 없는 방이 생기지 않게
    @Transactional
    public ChatRoomResponse createRoom(Long memberId, ChatRoomSaveRequest request) {
        requireActiveMember(memberId);
        ChatRoom room = ChatRoom.create(request.name().trim(), memberId, request.category(),
                normalizeDescription(request.description()), request.maxMembers());
        chatRoomRepository.save(room);
        chatRoomMemberRepository.save(ChatRoomMember.owner(room.getId(), memberId));
        return ChatRoomResponse.of(room, 1, 0L); // 방금 만든 방 — 안 읽은 메시지가 있을 수 없다
    }

    /**
     * 방 정보 수정 — OWNER만, 생성과 같은 record의 전체 교체 (docs/api-spec.md 7절 3차).
     * 정원을 현재 인원보다 작게 줄이는 것은 허용한다 — 기존 참여자는 유지되고 신규 입장만 차단된다.
     */
    @Transactional
    public ChatRoomResponse updateRoom(Long actorId, Long roomId, ChatRoomSaveRequest request) {
        requireActiveMember(actorId);
        ChatRoom room = getActiveRoom(roomId);
        requireOwner(roomId, actorId);
        room.updateProfile(request.name().trim(), request.category(),
                normalizeDescription(request.description()), request.maxMembers());
        // unreadCount는 목록 조회의 몫 — 이 응답은 방 정보 갱신용이라 계산하지 않는다(null)
        return ChatRoomResponse.of(room, countActive(roomId), null);
    }

    /**
     * 방 목록 + 검색·필터 (docs/api-spec.md 7절 3차). 파라미터 없으면 종전과 동일(전체·최신순).
     * category·sort를 enum이 아니라 String으로 받는 이유: 잘못된 값의 enum 바인딩 실패는
     * 500이 되는 계열(백로그 13번)이라 여기서 400으로 판정한다 (기기 관리 sessionId 파싱과 같은 방식).
     */
    @Transactional(readOnly = true)
    public List<ChatRoomResponse> getRooms(Long memberId, String keyword, String category, String sort) {
        ChatCategory categoryFilter = parseCategory(category);
        boolean popular = parsePopularSort(sort);
        // "필터 없음"은 null이 아니라 "" — null이면 PG 파라미터 타입 추론이 깨진다 (searchActive 주석)
        String keywordFilter = (keyword == null || keyword.isBlank()) ? "" : keyword.trim();
        List<ChatRoom> rooms = chatRoomRepository.searchActive(keywordFilter, categoryFilter);
        if (rooms.isEmpty()) {
            return List.of();
        }
        // 참여자 수는 group by 쿼리 한 번으로 일괄 집계 (방마다 count하면 N+1)
        List<Long> roomIds = rooms.stream().map(ChatRoom::getId).toList();
        Map<Long, Long> counts = chatRoomMemberRepository.countActiveByRoomIds(roomIds).stream()
                .collect(Collectors.toMap(
                        ChatRoomMemberRepository.RoomParticipantCount::getRoomId,
                        ChatRoomMemberRepository.RoomParticipantCount::getParticipantCount));
        // 안 읽은 수도 쿼리 한 번 — 내가 참여 중인 방만 결과에 있고, 없는 방은 null(미참여, 배지 없음)
        Map<Long, Long> unreads = chatRoomMemberRepository.countUnreadByMember(memberId).stream()
                .collect(Collectors.toMap(
                        ChatRoomMemberRepository.RoomUnreadCount::getRoomId,
                        ChatRoomMemberRepository.RoomUnreadCount::getUnreadCount));
        // 참여자순은 메모리 정렬 — 정렬 키(참여자 수)를 위에서 어차피 전부 집계했으므로 쿼리 추가가 없다.
        // 같은 인원끼리는 쿼리의 최신 생성순이 유지된다 (sorted는 안정 정렬)
        if (popular) {
            rooms = rooms.stream()
                    .sorted(Comparator.comparingLong(
                            (ChatRoom room) -> counts.getOrDefault(room.getId(), 0L)).reversed())
                    .toList();
        }
        return rooms.stream()
                .map(room -> ChatRoomResponse.of(room, counts.getOrDefault(room.getId(), 0L),
                        unreads.get(room.getId())))
                .toList();
    }

    /**
     * 내가 참여 중인 방 목록 (F7 — docs/plan-2026-08-13.md).
     *
     * <p>정렬은 <b>고정된 방 먼저(최근 고정 순) → 마지막 대화가 최근인 순</b>이다.
     * 대화가 한 번도 없는 방은 방 생성 시각을 대신 쓴다 — 새로 만든 방이 목록 맨 아래로 가라앉지 않게.
     *
     * <p>전체 목록(getRooms)과 달리 검색·필터를 받지 않는다. 참여 중인 방은 대개 몇 개뿐이라
     * 거를 이유가 없고, 화면에서도 이 목록은 상단 고정 섹션이라 필터가 붙지 않는다.
     */
    @Transactional(readOnly = true)
    public List<ChatRoomResponse> getMyRooms(Long memberId) {
        List<ChatRoomMember> memberships = chatRoomMemberRepository.findActiveByMemberId(memberId);
        if (memberships.isEmpty()) {
            return List.of();
        }
        List<Long> roomIds = memberships.stream().map(ChatRoomMember::getRoomId).toList();
        Map<Long, ChatRoom> rooms = chatRoomRepository.findAllById(roomIds).stream()
                .collect(Collectors.toMap(ChatRoom::getId, room -> room));
        // 참여자 수·안 읽은 수는 전체 목록과 같은 일괄 집계를 재사용한다 (방마다 조회하면 N+1)
        Map<Long, Long> counts = chatRoomMemberRepository.countActiveByRoomIds(roomIds).stream()
                .collect(Collectors.toMap(
                        ChatRoomMemberRepository.RoomParticipantCount::getRoomId,
                        ChatRoomMemberRepository.RoomParticipantCount::getParticipantCount));
        Map<Long, Long> unreads = chatRoomMemberRepository.countUnreadByMember(memberId).stream()
                .collect(Collectors.toMap(
                        ChatRoomMemberRepository.RoomUnreadCount::getRoomId,
                        ChatRoomMemberRepository.RoomUnreadCount::getUnreadCount));
        Map<Long, Instant> lastMessages = chatMessageRepository.findLastMessageAtByRoomIds(roomIds).stream()
                .collect(Collectors.toMap(
                        ChatMessageRepository.RoomLastMessage::getRoomId,
                        ChatMessageRepository.RoomLastMessage::getLastMessageAt));

        // 정렬은 메모리에서 한다 — 정렬 키(고정 시각·마지막 대화)를 위에서 이미 전부 모았고,
        // 참여 방 수는 사람당 수십 개 수준이라 쿼리로 옮길 이득이 없다 (참여자순 정렬과 같은 판단)
        Comparator<ChatRoomMember> order = Comparator
                // 고정된 방이 먼저. 같은 고정끼리는 최근에 고정한 것이 위로
                .comparing((ChatRoomMember m) -> m.getPinnedAt() == null ? 1 : 0)
                .thenComparing(m -> m.getPinnedAt() == null ? Instant.EPOCH : m.getPinnedAt(),
                        Comparator.reverseOrder())
                .thenComparing(m -> lastActivityAt(m.getRoomId(), rooms, lastMessages),
                        Comparator.reverseOrder());

        return memberships.stream()
                .filter(m -> rooms.containsKey(m.getRoomId())) // 방이 사라진 행 방어 (조회 사이 삭제)
                .sorted(order)
                .map(m -> ChatRoomResponse.ofMine(rooms.get(m.getRoomId()),
                        counts.getOrDefault(m.getRoomId(), 0L),
                        unreads.get(m.getRoomId()),
                        m.isPinned()))
                .toList();
    }

    // 마지막 대화 시각 — 대화가 없으면 방 생성 시각으로 갈음한다
    private Instant lastActivityAt(Long roomId, Map<Long, ChatRoom> rooms,
                                   Map<Long, Instant> lastMessages) {
        Instant lastMessage = lastMessages.get(roomId);
        if (lastMessage != null) {
            return lastMessage;
        }
        ChatRoom room = rooms.get(roomId);
        return room == null ? Instant.EPOCH : room.getCreatedAt();
    }

    /**
     * 방 고정 (F7). 참여 중인 방만 고정할 수 있고, 상한은 {@link #MAX_PINNED_ROOMS}개다.
     *
     * <p><b>이미 고정된 방은 no-op</b>이다(멱등). 다시 눌렀을 때 pinnedAt만 갱신되면
     * 목록 순서가 이유 없이 바뀌고, 상한 검사도 자기 자신 때문에 걸린다.
     */
    @Transactional
    public void pinRoom(Long memberId, Long roomId) {
        requireActiveMember(memberId);
        // 방 활성 검사가 먼저다. 방을 지워도 참여 행은 활성으로 남는 설계라, 이 검사가 없으면
        // **삭제된 방을 고정할 수 있다**(검증에서 실측). 목록에도 안 보이고 상한 집계에도 안 잡히는
        // 유령 고정이 생기고, 오류도 403이 아닌 엉뚱한 것이 나간다
        getActiveRoom(roomId);
        ChatRoomMember membership = requireParticipantRow(roomId, memberId);
        if (membership.isPinned()) {
            return;
        }
        if (chatRoomMemberRepository.countActivePins(memberId) >= MAX_PINNED_ROOMS) {
            throw new BusinessException(ChatErrorCode.ROOM_PIN_LIMIT);
        }
        membership.pin();
    }

    /**
     * 고정 해제 — 이미 해제된 방도 200 (멱등, 공지 핀 해제와 같은 규칙).
     *
     * <p>고정과 달리 <b>방 활성 검사를 하지 않는다.</b> 지워진 방의 고정을 걷어내는 것까지 막으면
     * 정리할 방법이 없어진다 — 해제는 되돌리는 방향이라 막을 이유도 없다.
     */
    @Transactional
    public void unpinRoom(Long memberId, Long roomId) {
        requireActiveMember(memberId);
        requireParticipantRow(roomId, memberId).unpin();
    }

    /**
     * 탈퇴(또는 없는) 회원의 접근 차단 — {@code PetService}와 같은 404 `USER_NOT_FOUND` (리뷰 백로그 110번).
     *
     * <p>액세스 토큰은 탈퇴 뒤에도 최대 15분 유효하고 필터는 서명만 본다. 그동안 이 회원은
     * 방을 만들고 글을 쓸 수 있었다 — 특히 <b>탈퇴 뒤 만든 방</b>은 탈퇴가 막는 "방장인 방"
     * 검사(409 `WITHDRAW_CHAT_OWNER`)의 밖이라, 방장이 존재하지 않는 복구 불가 방이 생긴다.
     *
     * <p><b>조회에는 걸지 않는다 — 8번이 `PetService`에서 정한 규칙과 의도적으로 다르다.</b>
     * 채팅은 읽기 빈도가 압도적이라(메시지·참여자·방 목록) 매 조회에 회원 조회를 한 번씩 더하면
     * 원격 DB 왕복이 그만큼 늘어 14번(폴링 1회당 검증 SELECT 3회)의 병목과 정확히 겹친다.
     * 조회로 새는 것은 15분 창 안의 <b>열람</b>뿐이고, 그 사이 상태를 바꾸는 경로는 전부 여기서 막힌다.
     * 같은 이유로 {@link #markRead}도 제외했다 — mutation이지만 프론트가 1초 디바운스로 호출하는
     * 조회급 빈도이고, 탈퇴가 참여 행을 일괄 정리하므로 벌크 UPDATE가 어차피 0행 no-op이다.
     *
     * <p>전역 필터에서 검사하지 않는 이유도 같다: 인증된 모든 요청에 DB 왕복 1회를 더하는 비용이,
     * 최대 15분짜리 창(행위자는 방금 탈퇴한 본인)에 비해 과하다.
     */
    private void requireActiveMember(Long memberId) {
        if (!memberRepository.existsByIdAndDeletedAtIsNull(memberId)) {
            throw new BusinessException(MemberErrorCode.NOT_FOUND);
        }
    }

    /**
     * 참여 중인 행을 가져온다. 미참여·나간 방은 403 — 남의 참여 정보를 건드릴 수 없다.
     * 존재 검사만 하는 {@code requireParticipant}와 달리 <b>행을 고쳐야 할 때</b> 쓴다.
     */
    private ChatRoomMember requireParticipantRow(Long roomId, Long memberId) {
        return chatRoomMemberRepository.findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.NOT_PARTICIPANT));
    }

    // 카테고리 필터 파싱 — 빈 값은 전체(null), 목록에 없는 값은 400
    private ChatCategory parseCategory(String category) {
        if (category == null || category.isBlank()) {
            return null;
        }
        try {
            return ChatCategory.valueOf(category);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "category는 WALK·TRAINING·HEALTH·FREE 중 하나여야 합니다.");
        }
    }

    // 정렬 파싱 — 기본 recent(최신순, 2026-08-11 확정), popular = 참여자 많은 순
    private boolean parsePopularSort(String sort) {
        if (sort == null || sort.isBlank() || sort.equals("recent")) {
            return false;
        }
        if (sort.equals("popular")) {
            return true;
        }
        throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                "sort는 recent 또는 popular여야 합니다.");
    }

    /**
     * 읽음 위치 보고 (docs/api-spec.md 7절). 멱등 — 같은 값·과거 값 보고는 0행 갱신으로 조용히 끝난다.
     * 참여 검증은 벌크 UPDATE의 WHERE가 겸한다 (미참여자는 no-op — 자기 행 외에는 건드릴 수 없는 구조).
     */
    @Transactional
    public void markRead(Long memberId, Long roomId, Long lastReadMessageId) {
        getActiveRoom(roomId);
        chatRoomMemberRepository.markRead(roomId, memberId, lastReadMessageId);
    }

    /**
     * 입장 — 이미 참여 중이면 그대로 성공 (멱등, docs/api-spec.md 7절).
     * 의도적으로 @Transactional을 걸지 않았다: 각 단계가 독립된 단문이고,
     * 동시 입장 경쟁으로 DB 부분 UNIQUE가 INSERT를 거부해도 그 실패를
     * "이미 참여됨 = 성공"으로 흡수해야 하는데, 트랜잭션 안에서 제약 위반을 잡으면
     * 트랜잭션 전체가 롤백 전용으로 표시되어 이후 처리가 불가능하기 때문.
     *
     * <p>강퇴·정원 검사는 사전 검사 + **INSERT 후 재확인**의 2단이다 (7절 3차, 백로그 23번).
     * 비트랜잭션이라 사전 검사 통과와 INSERT 커밋 사이에 강퇴·다른 입장이 커밋될 수 있고,
     * 그 경쟁의 확정 판정은 INSERT가 끝난 뒤에만 가능하다 — {@link #revertIfJoinLost}.
     */
    public ChatRoomResponse join(Long memberId, Long roomId) {
        requireActiveMember(memberId);
        ChatRoom room = getActiveRoom(roomId);
        // 강퇴 이력이 있으면 재입장 불가 (docs/api-spec.md 7절 2차 정책)
        if (chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftReason(
                roomId, memberId, ChatLeftReason.KICKED)) {
            throw new BusinessException(ChatErrorCode.KICKED);
        }
        if (!chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)) {
            // 정원 사전 검사 — 가득 찬 방을 INSERT 없이 빠르게 거부. 이미 참여 중인 멱등 호출은
            // 재입장이 아니므로 검사 대상이 아니다 (docs/api-spec.md 7절 3차)
            if (room.getMaxMembers() != null && countActive(roomId) >= room.getMaxMembers()) {
                throw new BusinessException(ChatErrorCode.ROOM_FULL);
            }
            // 내가 INSERT한 행의 id — 보상은 이 행만 대상으로 한다 (백로그 114번)
            Long joinedId = null;
            try {
                // 입장 전 메시지는 읽은 것으로 취급 — 입장 시점의 최신 메시지 id로 읽음 위치 초기화
                // (없으면 null. 오래된 방 입장 직후 "안 읽음 수천 개" 배지를 막는다 — 2026-08-10 확정)
                Long latestMessageId = chatMessageRepository.findTopByRoomIdOrderByIdDesc(roomId)
                        .map(ChatMessage::getId)
                        .orElse(null);
                joinedId = chatRoomMemberRepository
                        .save(ChatRoomMember.join(roomId, memberId, latestMessageId))
                        .getId();
            } catch (DataIntegrityViolationException e) {
                // 흡수해도 되는 것은 **중복 입장**(ux_chat_room_member_active 위반)뿐이다 —
                // 다른 요청이 먼저 참여시킨 경우라 멱등 정책상 성공으로 취급한다.
                // FK·CHECK 위반까지 성공으로 처리하면 참여 행이 없는데 200 + participantCount를 돌려주고
                // 직후 메시지 API가 403이 되는 모순 상태가 된다 — 참여 행을 확인해 구분한다 (백로그 11번).
                // 되던진 예외는 공용 핸들러가 409 + ERROR 로그로 남긴다(백로그 66번) — 조용히 사라지지 않는다
                if (!chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)) {
                    throw e;
                }
            }
            if (joinedId != null) {
                revertIfJoinLost(room, memberId, joinedId);
                // 실제로 새로 참여했고 재확인까지 통과했을 때만 알린다
                eventPublisher.publishEvent(new ChatMembersChangedEvent(roomId));
            }
        }
        // 입장 직후는 읽을 게 없는 상태다 (신규 입장은 최신 id로 초기화, 기존 참여자는 방 화면이 곧 보고)
        return ChatRoomResponse.of(room, countActive(roomId), 0L);
    }

    /**
     * join 사후 재확인 (docs/api-spec.md 7절 3차 — 백로그 23번과 정원 경쟁을 같은 자리에서 처리).
     * 사전 검사 통과 → INSERT 커밋 사이에 ① 강퇴가 커밋되면 강퇴자가 활성 참여자로 남고(23번),
     * ② 다른 입장이 커밋되면 정원이 초과된다. 걸리면 방금 넣은 행을 left 처리하고 거부한다.
     * 정원 경계에서 경쟁이 겹치면 양쪽 다 되돌려 둘 다 409를 받을 수 있다 — 초과 입장을 허용하는 것보다
     * 안전한 쪽을 택했다(재시도하면 남은 자리만큼만 들어간다).
     *
     * <p>되돌리는 대상은 **내가 INSERT한 행(joinedId)**이다 (백로그 114번). 방·회원으로 다시 조회하면
     * 그 사이 다른 요청이 만든 행을 끊을 수 있는 형태가 된다 — 조회 조건에 memberId가 있어
     * 남의 행은 닿지 않지만, "자진 나가기 → 재입장"이 끼면 자기 계정의 **다른** 행을 끊는다.
     * `leftAtIsNull` 조건이 함께 붙는 이유는 리포지토리 주석 참조(이미 강퇴된 행을 덮으면 안 된다).
     */
    private void revertIfJoinLost(ChatRoom room, Long memberId, Long joinedId) {
        boolean kickedRace = chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftReason(
                room.getId(), memberId, ChatLeftReason.KICKED);
        boolean overCapacity = room.getMaxMembers() != null
                && countActive(room.getId()) > room.getMaxMembers();
        if (!kickedRace && !overCapacity) {
            return;
        }
        chatRoomMemberRepository.findByIdAndLeftAtIsNull(joinedId)
                .ifPresent(joined -> {
                    joined.leave();
                    chatRoomMemberRepository.save(joined);
                });
        throw new BusinessException(kickedRace ? ChatErrorCode.KICKED : ChatErrorCode.ROOM_FULL);
    }

    // 방 하나의 참여 중 인원 (일괄 집계 쿼리 재사용)
    private long countActive(Long roomId) {
        return chatRoomMemberRepository.countActiveByRoomIds(List.of(roomId)).stream()
                .mapToLong(ChatRoomMemberRepository.RoomParticipantCount::getParticipantCount)
                .findFirst()
                .orElse(0L);
    }

    @Transactional
    public ChatMessageResponse sendMessage(Long memberId, Long roomId, ChatMessageCreateRequest request) {
        requireActiveMember(memberId);
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        // 발신자 조회를 INSERT보다 먼저 — INSERT 후 추가 왕복이 있으면
        // id 채번과 커밋 사이 구간이 길어져, 그 사이 더 큰 id가 먼저 커밋되면
        // afterId 폴링이 이 메시지를 건너뛸 수 있다 (docs/troubleshooting.md 3번)
        Member sender = memberRepository.findById(memberId).orElse(null);
        ChatMessage message = ChatMessage.of(roomId, memberId, request.content().trim());
        chatMessageRepository.save(message);
        ChatMessageResponse response = ChatMessageResponse.of(message,
                sender != null ? sender.getName() : "알 수 없음",
                sender != null ? sender.getProfileImageUrl() : null);
        // 실제 push는 커밋 후에 일어난다 — 이벤트 발행 자체는 메모리 작업이라 위 구간을 넓히지 않는다
        eventPublisher.publishEvent(new ChatMessageCreatedEvent(roomId, response));
        return response;
    }

    /**
     * 이미지 메시지 전송 (F10b — docs/api-spec.md 7절 4차).
     *
     * <p><b>의도적으로 트랜잭션이 없다.</b> Storage 업로드가 외부 HTTP라, 트랜잭션 안에서 하면
     * 그 왕복 내내 DB 커넥션을 잡는다 — 풀이 작아(5) 몇 건만 겹쳐도 전면 장애가 된다
     * (conventions.md 1절 규약, 백로그 76번이 카카오 로그인에서 실측한 그 문제).
     * 저장은 {@link ChatImageMessageWriter}의 짧은 트랜잭션이 맡는다.
     *
     * <p>실패해도 남는 것은 <b>참조되지 않는 Storage 파일</b>뿐이다(메시지가 안 만들어지므로).
     * 반대 순서(먼저 저장 → 업로드)면 URL 없는 이미지 메시지가 남아 화면이 깨지므로 이쪽이 낫다.
     */
    public ChatMessageResponse sendImage(Long memberId, Long roomId, MultipartFile file) {
        requireActiveMember(memberId);
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        imageStorageClient.validateImage(file); // 형식·용량 — 프로필 사진과 같은 규칙
        // 경로는 UUID다. 공개 버킷이라 URL을 아는 사람은 방 밖에서도 볼 수 있으므로,
        // roomId-messageId 같은 열거 가능한 경로를 쓰면 남의 대화 사진이 전수 열람된다
        String path = "room-%d/%s".formatted(roomId, UUID.randomUUID());
        String imageUrl;
        try {
            imageUrl = imageStorageClient.uploadChatImage(path, file.getBytes(), file.getContentType());
        } catch (IOException e) {
            throw new BusinessException(CommonErrorCode.IMAGE_UPLOAD_FAILED);
        }
        return chatImageMessageWriter.write(roomId, memberId, imageUrl);
    }

    /**
     * 메시지 조회 (docs/api-spec.md 7절 3차) — 파라미터 없음: 최근 50개 / afterId: 이후 최대 500개(복구) /
     * beforeId: 그보다 오래된 50개(과거 스크롤). 둘 다 지정은 방향이 모호하므로 400.
     * 세 경로 모두 시간순(오름차순)으로 반환한다 — 프론트의 id 정렬 병합이 방향을 신경 쓰지 않게.
     */
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(Long memberId, Long roomId, Long afterId, Long beforeId) {
        if (afterId != null && beforeId != null) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "afterId와 beforeId는 함께 사용할 수 없습니다.");
        }
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);

        List<ChatMessage> messages;
        if (afterId != null) {
            messages = chatMessageRepository.findTop500ByRoomIdAndIdGreaterThanOrderByIdAsc(roomId, afterId);
        } else if (beforeId != null) {
            // 오래된 쪽 50개를 내림차순으로 뽑은 뒤 시간순으로 뒤집는다 (초기 로드와 같은 방식)
            messages = new ArrayList<>(
                    chatMessageRepository.findTop50ByRoomIdAndIdLessThanOrderByIdDesc(roomId, beforeId));
            Collections.reverse(messages);
        } else {
            // 최근 50개를 내림차순으로 뽑은 뒤 시간순(오름차순)으로 뒤집는다
            messages = new ArrayList<>(chatMessageRepository.findTop50ByRoomIdOrderByIdDesc(roomId));
            Collections.reverse(messages);
        }
        if (messages.isEmpty()) {
            return List.of();
        }

        // 발신자 일괄 조회 — 메시지마다 회원을 조회하면 N+1. 이름·프로필 사진을 같은 조회에서 얻는다
        Set<Long> senderIds = messages.stream().map(ChatMessage::getSenderId).collect(Collectors.toSet());
        Map<Long, Member> senders = memberRepository.findAllById(senderIds).stream()
                .collect(Collectors.toMap(Member::getId, member -> member));
        return messages.stream()
                .map(message -> {
                    Member sender = senders.get(message.getSenderId());
                    return ChatMessageResponse.of(message,
                            sender != null ? sender.getName() : "알 수 없음",
                            sender != null ? sender.getProfileImageUrl() : null);
                })
                .toList();
    }

    // 참여자 목록 — OWNER → MANAGER → MEMBER 순, 같은 role끼리는 입장순 (docs/api-spec.md 7절)
    @Transactional(readOnly = true)
    public List<ChatMemberResponse> getRoomMembers(Long memberId, Long roomId) {
        getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        List<ChatRoomMember> members = chatRoomMemberRepository
                .findByRoomIdAndLeftAtIsNullOrderByJoinedAtAsc(roomId);
        // 회원 일괄 조회 — 참여자마다 조회하면 N+1. 이름·프로필 사진을 같은 조회에서 얻는다
        Set<Long> memberIds = members.stream().map(ChatRoomMember::getMemberId).collect(Collectors.toSet());
        Map<Long, Member> memberById = memberRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Member::getId, member -> member));
        return members.stream()
                // enum 선언 순서(OWNER=0, MANAGER=1, MEMBER=2)가 곧 표시 순서. 정렬은 안정적이라 입장순 유지
                .sorted(Comparator.comparingInt(member -> member.getRole().ordinal()))
                .map(member -> {
                    Member found = memberById.get(member.getMemberId());
                    return new ChatMemberResponse(member.getMemberId(),
                            found != null ? found.getName() : "알 수 없음", member.getRole(),
                            found != null ? found.getProfileImageUrl() : null);
                })
                .toList();
    }

    // 나가기 — OWNER는 위임(delegate) 전에는 나갈 수 없다
    @Transactional
    public void leave(Long memberId, Long roomId) {
        requireActiveMember(memberId);
        getActiveRoom(roomId);
        ChatRoomMember me = chatRoomMemberRepository
                .findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.NOT_PARTICIPANT));
        if (me.getRole() == ChatRole.OWNER) {
            throw new BusinessException(ChatErrorCode.OWNER_CANNOT_LEAVE);
        }
        me.leave();
        eventPublisher.publishEvent(new ChatMembersChangedEvent(roomId));
    }

    // 강퇴 — 강퇴된 회원은 이 방에 재입장할 수 없다
    @Transactional
    public void kick(Long actorId, Long roomId, Long targetMemberId) {
        requireActiveMember(actorId);
        getActiveRoom(roomId);
        ChatRoomMember actor = chatRoomMemberRepository
                .findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, actorId)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.NOT_PARTICIPANT));
        if (actorId.equals(targetMemberId)) {
            // 자기 자신은 강퇴 대상이 아니다 — 나가기를 쓴다
            throw new BusinessException(ChatErrorCode.ROLE_FORBIDDEN);
        }
        ChatRoomMember target = getActiveMember(roomId, targetMemberId);
        if (!canKick(actor.getRole(), target.getRole())) {
            throw new BusinessException(ChatErrorCode.ROLE_FORBIDDEN);
        }
        target.kick();
        // 이미 구독 중인 강퇴자는 SUBSCRIBE 검사로 막을 수 없다 — 커밋 후 연결을 끊는다
        eventPublisher.publishEvent(new ChatMemberKickedEvent(roomId, targetMemberId));
        eventPublisher.publishEvent(new ChatMembersChangedEvent(roomId));
    }

    // MANAGER 지명·해제 — OWNER만. OWNER로의 변경은 delegate가 담당
    @Transactional
    public void changeRole(Long actorId, Long roomId, Long targetMemberId, ChatRole newRole) {
        requireActiveMember(actorId);
        getActiveRoom(roomId);
        requireOwner(roomId, actorId);
        if (newRole == ChatRole.OWNER) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "OWNER로의 변경은 위임 API(/delegate)를 사용해야 합니다.");
        }
        if (actorId.equals(targetMemberId)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "자기 자신의 역할은 변경할 수 없습니다.");
        }
        getActiveMember(roomId, targetMemberId).changeRole(newRole);
        // 지명된 본인의 화면에 권한 버튼이 바로 나타나야 한다
        eventPublisher.publishEvent(new ChatMembersChangedEvent(roomId));
    }

    // 방장 위임 — 대상이 OWNER가 되고 기존 방장은 MEMBER로. 한 트랜잭션이라 방마다 OWNER는 항상 1명
    @Transactional
    public void delegate(Long actorId, Long roomId, Long targetMemberId) {
        requireActiveMember(actorId);
        getActiveRoom(roomId);
        ChatRoomMember actor = requireOwner(roomId, actorId);
        if (actorId.equals(targetMemberId)) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "자기 자신에게는 위임할 수 없습니다.");
        }
        ChatRoomMember target = getActiveMember(roomId, targetMemberId);
        // 강등을 먼저 DB에 반영(flush)한 뒤 승격한다. 순서가 반대면 한 트랜잭션 안에서 OWNER가 잠깐
        // 2명이 되어 부분 UNIQUE 인덱스(ux_chat_room_owner)에 걸린다 — 쓰기 순서를 로드 순서에
        // 맡기지 않고 여기서 못 박는다
        actor.changeRole(ChatRole.MEMBER);
        chatRoomMemberRepository.saveAndFlush(actor);
        target.changeRole(ChatRole.OWNER);
        // 두 사람의 role이 한 번에 바뀐다 — 신호는 한 번이면 충분(받는 쪽이 전체를 다시 읽는다)
        eventPublisher.publishEvent(new ChatMembersChangedEvent(roomId));
    }

    // 방 삭제(소프트) — 참여 행·메시지는 그대로 두고, 모든 조회가 삭제된 방을 걸러낸다
    @Transactional
    public void deleteRoom(Long actorId, Long roomId) {
        requireActiveMember(actorId);
        ChatRoom room = getActiveRoom(roomId);
        requireOwner(roomId, actorId);
        room.delete();
    }

    // 공지 고정 — OWNER·MANAGER, 이미 있으면 교체 (docs/api-spec.md 7절 3차)
    @Transactional
    public void pinMessage(Long actorId, Long roomId, Long messageId) {
        requireActiveMember(actorId);
        ChatRoom room = getActiveRoom(roomId);
        requireOwnerOrManager(roomId, actorId);
        // 소속 검증을 쿼리에 — 다른 방 메시지·없는 id 모두 404 (존재 여부 비노출 규칙)
        chatMessageRepository.findByIdAndRoomId(messageId, roomId)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.MESSAGE_NOT_FOUND));
        room.pin(messageId);
        eventPublisher.publishEvent(new ChatPinChangedEvent(roomId));
    }

    // 공지 해제 — 핀이 없어도 성공 (멱등, 동시 해제 경쟁 무해화). 바뀐 게 없으면 신호도 안 보낸다
    @Transactional
    public void unpinMessage(Long actorId, Long roomId) {
        requireActiveMember(actorId);
        ChatRoom room = getActiveRoom(roomId);
        requireOwnerOrManager(roomId, actorId);
        if (room.getPinnedMessageId() == null) {
            return;
        }
        room.unpin();
        eventPublisher.publishEvent(new ChatPinChangedEvent(roomId));
    }

    // 공지 조회 — 참여자만. 핀이 없으면 null (응답 data: null)
    @Transactional(readOnly = true)
    public ChatMessageResponse getPinnedMessage(Long memberId, Long roomId) {
        ChatRoom room = getActiveRoom(roomId);
        requireParticipant(roomId, memberId);
        if (room.getPinnedMessageId() == null) {
            return null;
        }
        // FK 덕에 실제로는 항상 존재하지만, 없으면 "공지 없음"으로 조용히 처리한다 (조회가 500이 될 이유가 없다)
        ChatMessage message = chatMessageRepository.findById(room.getPinnedMessageId()).orElse(null);
        if (message == null) {
            return null;
        }
        Member sender = memberRepository.findById(message.getSenderId()).orElse(null);
        return ChatMessageResponse.of(message,
                sender != null ? sender.getName() : "알 수 없음",
                sender != null ? sender.getProfileImageUrl() : null);
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
                .orElseThrow(() -> new BusinessException(ChatErrorCode.ROLE_FORBIDDEN));
    }

    // OWNER·MANAGER 검증 — 공지 핀은 강퇴와 같은 권한 급 (docs/api-spec.md 7절 3차)
    private ChatRoomMember requireOwnerOrManager(Long roomId, Long memberId) {
        return chatRoomMemberRepository.findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .filter(member -> member.getRole() != ChatRole.MEMBER)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.ROLE_FORBIDDEN));
    }

    // 강퇴·지명·위임의 대상 행 조회 — 참여 중이 아니면 404
    private ChatRoomMember getActiveMember(Long roomId, Long memberId) {
        return chatRoomMemberRepository.findByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ChatErrorCode.MEMBER_NOT_FOUND));
    }

    // 빈 문자열("")로 온 선택 입력은 NULL로 통일 (pet의 normalizeBreed와 같은 원칙)
    private String normalizeDescription(String description) {
        return (description == null || description.isBlank()) ? null : description.trim();
    }

    // 없거나 소프트 삭제된 방은 동일하게 404 (docs/api-spec.md 5절의 존재 여부 은닉 규칙)
    private ChatRoom getActiveRoom(Long roomId) {
        return chatRoomRepository.findById(roomId)
                .filter(room -> !room.isDeleted())
                .orElseThrow(() -> new BusinessException(ChatErrorCode.ROOM_NOT_FOUND));
    }

    // 참여자 검증 — 이 도메인의 소유자 격리 (docs/conventions.md 5절 패턴)
    private void requireParticipant(Long roomId, Long memberId) {
        if (!chatRoomMemberRepository.existsByRoomIdAndMemberIdAndLeftAtIsNull(roomId, memberId)) {
            throw new BusinessException(ChatErrorCode.NOT_PARTICIPANT);
        }
    }
}
