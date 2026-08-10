package com.pet.backend.chat;

import com.pet.backend.chat.dto.ChatDelegateRequest;
import com.pet.backend.chat.dto.ChatMemberResponse;
import com.pet.backend.chat.dto.ChatMessageCreateRequest;
import com.pet.backend.chat.dto.ChatMessageResponse;
import com.pet.backend.chat.dto.ChatReadRequest;
import com.pet.backend.chat.dto.ChatRoleChangeRequest;
import com.pet.backend.chat.dto.ChatRoomCreateRequest;
import com.pet.backend.chat.dto.ChatRoomResponse;
import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// 오픈채팅 API (docs/api-spec.md 7절). 전부 인증 필요 — memberId는 토큰에서
@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @PostMapping("/api/chat/rooms")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ChatRoomResponse> createRoom(@AuthenticationPrincipal Long memberId,
                                                    @Valid @RequestBody ChatRoomCreateRequest request) {
        return ApiResponse.ok(chatService.createRoom(memberId, request));
    }

    // 방 목록 — unreadCount(안 읽은 수)는 내 참여 방에만 값이 있고 미참여 방은 null
    @GetMapping("/api/chat/rooms")
    public ApiResponse<List<ChatRoomResponse>> getRooms(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(chatService.getRooms(memberId));
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

    // afterId 생략 = 최근 50개, 지정 = 그 이후 전부 (폴링용)
    @GetMapping("/api/chat/rooms/{roomId}/messages")
    public ApiResponse<List<ChatMessageResponse>> getMessages(@AuthenticationPrincipal Long memberId,
                                                              @PathVariable Long roomId,
                                                              @RequestParam(required = false) Long afterId) {
        return ApiResponse.ok(chatService.getMessages(memberId, roomId, afterId));
    }

    @PostMapping("/api/chat/rooms/{roomId}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ChatMessageResponse> sendMessage(@AuthenticationPrincipal Long memberId,
                                                        @PathVariable Long roomId,
                                                        @Valid @RequestBody ChatMessageCreateRequest request) {
        return ApiResponse.ok(chatService.sendMessage(memberId, roomId, request));
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
