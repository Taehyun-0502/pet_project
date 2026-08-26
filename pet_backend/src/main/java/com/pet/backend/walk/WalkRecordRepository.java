package com.pet.backend.walk;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WalkRecordRepository extends JpaRepository<WalkRecord, Long> {

    // 조회(GET /api/walk/records)는 인증된 memberId 소유의 petId 목록으로만 필터링한다
    // (QA H-1, IDOR 수정) — petId가 null인 레거시 행은 이 IN 조건에 걸리지 않아 자연히 제외된다.
    List<WalkRecord> findAllByPetIdInOrderByStartedAtDesc(List<Long> petIds, Pageable pageable);

    // 산책 브리핑 판정(WalkBriefingService)의 기준 좌표 조회용 — 전체 사용자 통틀어 마지막
    // 산책 기록 1건("단일 사용자 데모" 전제 — walk.briefing.pet-id 미설정 시의 기본 동작, QA M-1).
    Optional<WalkRecord> findFirstByOrderByStartedAtDesc();

    // walk.briefing.pet-id(선택)가 설정된 경우 — 그 반려동물의 최신 산책 기록 기준으로 판정한다(QA M-1).
    Optional<WalkRecord> findFirstByPetIdOrderByStartedAtDesc(Long petId);
}
