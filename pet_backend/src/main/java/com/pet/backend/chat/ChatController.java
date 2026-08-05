package com.pet.backend.chat;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

    @GetMapping("/api/chat/rooms")
    public ApiResponse<List<ChatRoomResponse>> getRooms() {
        return ApiResponse.ok(chatService.getRooms());
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
}
