package com.pet.backend.aisearch;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AiSearchController {

    private final AiSearchService aiSearchService;

    @PostMapping("/api/ai-search")
    public ApiResponse<AiSearchResponse> ask(@Valid @RequestBody AiSearchRequest request) {
        return ApiResponse.ok(aiSearchService.ask(request));
    }
}
