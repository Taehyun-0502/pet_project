package com.pet.backend.walk;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WalkRecordRepository extends JpaRepository<WalkRecord, Long> {

    List<WalkRecord> findAllByOrderByStartedAtDesc(Pageable pageable);

    // 산책 브리핑 판정(WalkBriefingService)의 기준 좌표 조회용 — 마지막 산책 기록 1건.
    Optional<WalkRecord> findFirstByOrderByStartedAtDesc();
}
