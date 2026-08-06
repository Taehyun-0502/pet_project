package com.pet.backend.pet;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// 인증 필수 경로 — memberId는 JwtAuthenticationFilter가 토큰에서 꺼내 실어준 값
@RestController
@RequiredArgsConstructor
public class PetController {

    private final PetService petService;

    @PostMapping("/api/pets")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PetResponse> register(@AuthenticationPrincipal Long memberId,
                                             @Valid @RequestBody PetCreateRequest request) {
        return ApiResponse.ok(petService.register(memberId, request));
    }

    @GetMapping("/api/pets")
    public ApiResponse<List<PetResponse>> getMyPets(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(petService.getMyPets(memberId));
    }
}
