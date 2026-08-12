package com.pet.backend.walk;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WalkRecordRepository extends JpaRepository<WalkRecord, Long> {

    List<WalkRecord> findAllByOrderByStartedAtDesc(Pageable pageable);
}
