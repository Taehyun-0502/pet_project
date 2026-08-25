package com.pet.backend.chat;

import com.pet.backend.chat.dto.ChatDelegateRequest;
import com.pet.backend.chat.dto.ChatMemberResponse;
import com.pet.backend.chat.dto.ChatMessageCreateRequest;
import com.pet.backend.chat.dto.ChatMessageResponse;
import com.pet.backend.chat.dto.ChatPinRequest;
import com.pet.backend.chat.dto.ChatReadRequest;
import com.pet.backend.chat.dto.ChatRoleChangeRequest;
import com.pet.backend.chat.dto.ChatRoomResponse;
import com.pet.backend.chat.dto.ChatRoomSaveRequest;
import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

// 오픈채팅 API (docs/api-spec.md 7절). 전부 인증 필요 — memberId는 토큰에서
@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @PostMapping("/api/chat/rooms")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ChatRoomResponse> createRoom(@AuthenticationPrincipal Long memberId,
                                                    @Valid @RequestBody ChatRoomSaveRequest request) {
        return ApiResponse.ok(chatService.createRoom(memberId, request));
    }

    // 방 정보 수정 — OWNER만. 생성과 같은 record의 전체 교체 (docs/api-spec.md 7절 3차)
    @PutMapping("/api/chat/rooms/{roomId}")
    public ApiResponse<ChatRoomResponse> updateRoom(@AuthenticationPrincipal Long memberId,
                                                    @PathVariable Long roomId,
                                                    @Valid @RequestBody ChatRoomSaveRequest request) {
        return ApiResponse.ok(chatService.updateRoom(memberId, roomId, request));
    }

    // 방 목록 + 검색·필터 (3차) — 파라미터 전부 선택, 없으면 전체·최신순.
    // category·sort를 String으로 받는 이유는 Service의 파싱 주석 참조 (오값 400).
    // unreadCount(안 읽은 수)는 내 참여 방에만 값이 있고 미참여 방은 null
    @GetMapping("/api/chat/rooms")
    public ApiResponse<List<ChatRoomResponse>> getRooms(
            @AuthenticationPrincipal Long memberId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String sort) {
        return ApiResponse.ok(chatService.getRooms(memberId, keyword, category, sort));
    }

    /**
     * 이미지 메시지 전송 (F10b) — multipart, part 이름 {@code file}. 규칙은 프로필 사진과 같다
     * (jpeg·png·webp, 5MB 이하). 응답은 텍스트 전송과 <b>같은 메시지 객체</b>라
     * 프론트가 같은 경로로 화면에 붙인다.
     */
    @PostMapping(value = "/api/chat/rooms/{roomId}/images",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ChatMessageResponse> sendImage(@AuthenticationPrincipal Long memberId,
                                                      @PathVariable Long roomId,
                                                      @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(chatService.sendImage(memberId, roomId, file));
    }

    /**
     * 내가 참여 중인 방 목록 (F7). 고정된 방 먼저 → 마지막 대화가 최근인 순.
     * 전체 목록과 달리 검색·필터가 없다(ChatService.getMyRooms 주석 참조).
     */
    @GetMapping("/api/chat/rooms/mine")
    public ApiResponse<List<ChatRoomResponse>> getMyRooms(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(chatService.getMyRooms(memberId));
    }

    /**
     * 방 고정/해제 (F7). 경로가 {@code /pin}이 아니라 {@code /pin-room}인 이유는
     * <b>공지 핀({@code PUT /rooms/{roomId}/pin})과 다른 기능</b>이기 때문이다 —
     * 공지 핀은 방 전체에 걸리는 OWNER·MANAGER 권한이고, 이건 개인이 자기 목록을 정렬하는 기능이다.
     * 둘 다 멱등이다.
     */
    @PutMapping("/api/chat/rooms/{roomId}/pin-room")
    public ApiResponse<Void> pinRoom(@AuthenticationPrincipal Long memberId,
                                     @PathVariable Long roomId) {
        chatService.pinRoom(memberId, roomId);
        return ApiResponse.ok();
    }

    @DeleteMapping("/api/chat/rooms/{roomId}/pin-room")
    public ApiResponse<Void> unpinRoom(@AuthenticationPrincipal Long memberId,
                                       @PathVariable Long roomId) {
        chatService.unpinRoom(memberId, roomId);
        return ApiResponse.ok();
    }

    // 읽음 위치 보고 — 멱등, 과거 값은 무시된다 (docs/api-spec.md 7절)
    @PutMapping("/api/chat/rooms/{roomId}/read")
    public ApiResponse<Void> markRead(@AuthenticationPrincipal Long memberId,
                                      @PathVariable Long roomId,
                                      @Valid @RequestBody ChatReadRequest request) {
        chatService.markRead(memberId, roomId, request.lastReadMessageId());
        return ApiResponse.ok();
    }

    @PostMapping("/api/chat/rooms/{roomId}/join")
    public ApiResponse<ChatRoomResponse> join(@AuthenticationPrincipal Long memberId,
                                              @PathVariable Long roomId) {
        return ApiResponse.ok(chatService.join(memberId, roomId));
    }

    // 파라미터 없음 = 최근 50 / afterId = 이후 최대 500(복구) / beforeId = 과거 50 (3차 — api-spec.md 7절)
    @GetMapping("/api/chat/rooms/{roomId}/messages")
    public ApiResponse<List<ChatMessageResponse>> getMessages(@AuthenticationPrincipal Long memberId,
                                                              @PathVariable Long roomId,
                                                              @RequestParam(required = false) Long afterId,
                                                              @RequestParam(required = false) Long beforeId) {
        return ApiResponse.ok(chatService.getMessages(memberId, roomId, afterId, beforeId));
    }

    @PostMapping("/api/chat/rooms/{roomId}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ChatMessageResponse> sendMessage(@AuthenticationPrincipal Long memberId,
                                                        @PathVariable Long roomId,
                                                        @Valid @RequestBody ChatMessageCreateRequest request) {
        return ApiResponse.ok(chatService.sendMessage(memberId, roomId, request));
    }

    // ── 공지 핀 (3차 — docs/api-spec.md 7절) ──

    // 고정(교체 겸용) — OWNER·MANAGER만. 메시지는 그 방의 것이어야 한다
    @PutMapping("/api/chat/rooms/{roomId}/pin")
    public ApiResponse<Void> pinMessage(@AuthenticationPrincipal Long memberId,
                                        @PathVariable Long roomId,
                                        @Valid @RequestBody ChatPinRequest request) {
        chatService.pinMessage(memberId, roomId, request.messageId());
        return ApiResponse.ok();
    }

    // 해제 — 핀이 없어도 200 (멱등)
    @DeleteMapping("/api/chat/rooms/{roomId}/pin")
    public ApiResponse<Void> unpinMessage(@AuthenticationPrincipal Long memberId,
                                          @PathVariable Long roomId) {
        chatService.unpinMessage(memberId, roomId);
        return ApiResponse.ok();
    }

    // 공지 조회 (참여자만) — 없으면 data: null
    @GetMapping("/api/chat/rooms/{roomId}/pin")
    public ApiResponse<ChatMessageResponse> getPinnedMessage(@AuthenticationPrincipal Long memberId,
                                                             @PathVariable Long roomId) {
        return ApiResponse.ok(chatService.getPinnedMessage(memberId, roomId));
    }

    // ── 이하 2차: 권한 행사 기능 (docs/api-spec.md 7절 2차 정책) ──

    // 참여자 목록 — 강퇴·지명·위임 UI가 대상을 고르는 데 사용 (참여자만)
    @GetMapping("/api/chat/rooms/{roomId}/members")
    public ApiResponse<List<ChatMemberResponse>> getRoomMembers(@AuthenticationPrincipal Long memberId,
                                                                @PathVariable Long roomId) {
        return ApiResponse.ok(chatService.getRoomMembers(memberId, roomId));
    }

    @PostMapping("/api/chat/rooms/{roomId}/leave")
    public ApiResponse<Void> leave(@AuthenticationPrincipal Long memberId,
                                   @PathVariable Long roomId) {
        chatService.leave(memberId, roomId);
        return ApiResponse.ok();
    }

    @PostMapping("/api/chat/rooms/{roomId}/members/{memberId}/kick")
    public ApiResponse<Void> kick(@AuthenticationPrincipal Long actorId,
                                  @PathVariable Long roomId,
                                  @PathVariable("memberId") Long targetMemberId) {
        chatService.kick(actorId, roomId, targetMemberId);
        return ApiResponse.ok();
    }

    // MANAGER 지명(role=MANAGER)·해제(role=MEMBER). OWNER 값은 Service가 거부
    @PatchMapping("/api/chat/rooms/{roomId}/members/{memberId}/role")
    public ApiResponse<Void> changeRole(@AuthenticationPrincipal Long actorId,
                                        @PathVariable Long roomId,
                                        @PathVariable("memberId") Long targetMemberId,
                                        @Valid @RequestBody ChatRoleChangeRequest request) {
        chatService.changeRole(actorId, roomId, targetMemberId, request.role());
        return ApiResponse.ok();
    }

    @PostMapping("/api/chat/rooms/{roomId}/delegate")
    public ApiResponse<Void> delegate(@AuthenticationPrincipal Long actorId,
                                      @PathVariable Long roomId,
                                      @Valid @RequestBody ChatDelegateRequest request) {
        chatService.delegate(actorId, roomId, request.memberId());
        return ApiResponse.ok();
    }

    @DeleteMapping("/api/chat/rooms/{roomId}")
    public ApiResponse<Void> deleteRoom(@AuthenticationPrincipal Long memberId,
                                        @PathVariable Long roomId) {
        chatService.deleteRoom(memberId, roomId);
        return ApiResponse.ok();
    }
}
