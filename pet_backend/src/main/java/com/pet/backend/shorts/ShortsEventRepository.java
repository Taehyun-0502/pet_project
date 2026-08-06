package com.pet.backend.shorts;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 행동 이력 저장소. A단계에서는 <b>INSERT만</b> 한다 — 집계는 C단계에서
 * 가이드 5절의 네이티브 쿼리(ShortsRepository)가 이 테이블을 조인해 직접 수행한다.
 *
 * <p>조회 메서드를 미리 만들어 두지 않은 이유: 점수 계산은 배열(unnest)과 시간 감쇠가 섞여
 * JPQL로 표현하기 어렵고, 결국 네이티브 SQL로 가게 된다. 지금 추측해서 만들면 쓰이지 않는다.
 */
public interface ShortsEventRepository extends JpaRepository<ShortsEvent, Long> {
}
