package com.pet.backend.walk;

import com.pet.backend.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequiredArgsConstructor
public class WalkRecordController {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;

    private final WalkRecordService walkRecordService;

    @PostMapping("/api/walk/records")
    public ApiResponse<WalkRecordResponse> create(@RequestBody @Valid WalkRecordCreateRequest request) {
        return ApiResponse.ok(walkRecordService.create(request));
    }

    @GetMapping("/api/walk/records")
    public ApiResponse<WalkRecordListResponse> list(
            @RequestParam(defaultValue = "" + DEFAULT_LIMIT)
            @Positive(message = "limit은 1 이상이어야 합니다.")
            @Max(value = MAX_LIMIT, message = "limit은 " + MAX_LIMIT + " 이하여야 합니다.")
            int limit
    ) {
        return ApiResponse.ok(new WalkRecordListResponse(walkRecordService.list(limit)));
    }
}
