package com.pet.backend.walk;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WalkRecordService {

    private final WalkRecordRepository walkRecordRepository;

    @Transactional
    public WalkRecordResponse create(WalkRecordCreateRequest request) {
        WalkRecord record = WalkRecord.create(
                request.petId(),
                request.startedAt(),
                request.endedAt(),
                request.durationSeconds(),
                request.distanceMeters(),
                request.path(),
                request.airTemp(),
                request.asphaltTemp());
        return WalkRecordResponse.from(walkRecordRepository.save(record));
    }

    @Transactional(readOnly = true)
    public List<WalkRecordResponse> list(int limit) {
        return walkRecordRepository.findAllByOrderByStartedAtDesc(PageRequest.of(0, limit))
                .stream()
                .map(WalkRecordResponse::from)
                .toList();
    }
}
