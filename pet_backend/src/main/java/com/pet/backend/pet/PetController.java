package com.pet.backend.pet;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
                                             @Valid @RequestBody PetSaveRequest request) {
        return ApiResponse.ok(petService.register(memberId, request));
    }

    @GetMapping("/api/pets")
    public ApiResponse<List<PetResponse>> getMyPets(@AuthenticationPrincipal Long memberId) {
        return ApiResponse.ok(petService.getMyPets(memberId));
    }

    // 타인 소유·삭제됨도 모두 404 — id 존재 여부를 노출하지 않는다
    @GetMapping("/api/pets/{petId}")
    public ApiResponse<PetResponse> getPet(@AuthenticationPrincipal Long memberId,
                                           @PathVariable Long petId) {
        return ApiResponse.ok(petService.getPet(memberId, petId));
    }

    // 전체 교체 (PUT) — 생략된 선택 항목은 지워진다
    @PutMapping("/api/pets/{petId}")
    public ApiResponse<PetResponse> update(@AuthenticationPrincipal Long memberId,
                                           @PathVariable Long petId,
                                           @Valid @RequestBody PetSaveRequest request) {
        return ApiResponse.ok(petService.update(memberId, petId, request));
    }

    @DeleteMapping("/api/pets/{petId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Long memberId,
                                    @PathVariable Long petId) {
        petService.delete(memberId, petId);
        return ApiResponse.ok();
    }
}
