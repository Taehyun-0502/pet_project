package com.pet.backend.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    // 전체 활성 방 목록 (오픈채팅 — 참여 여부와 무관하게 공개, 최신 생성순)
    List<ChatRoom> findByDeletedAtIsNullOrderByCreatedAtDesc();

    /**
     * 방 검색·필터 (docs/api-spec.md 7절 3차). 필터가 없으면 조건이 통과해 위 전체 목록과 동일 —
     * 쿼리를 하나로 합쳤다 (ix_chat_room_active 사용).
     * keyword는 이름+소개 대소문자 무시 부분 일치. 사용자가 %·_를 입력하면 LIKE 와일드카드로
     * 동작하지만 검색 범위가 넓어질 뿐이라 이스케이프하지 않는다 (명세에 기록된 규모 판단).
     * 참여자순(popular) 정렬은 여기 없다 — 참여자 수는 Service가 어차피 일괄 집계하므로 메모리에서 정렬한다.
     *
     * <p>**keyword는 null이 아니라 빈 문자열("")로 "필터 없음"을 표현한다** — null을 넘기면
     * PG 드라이버가 파라미터 타입을 정하지 못해 `function lower(bytea) does not exist`로 쿼리가 깨진다
     * (구현 검증에서 실측한 함정). enum(:category)은 Hibernate가 타입을 알아 null이 안전하다.
     */
    @Query("""
            select r from ChatRoom r
            where r.deletedAt is null
              and (:category is null or r.category = :category)
              and (:keyword = ''
                   or lower(r.name) like lower(concat('%', :keyword, '%'))
                   or lower(coalesce(r.description, '')) like lower(concat('%', :keyword, '%')))
            order by r.createdAt desc
            """)
    List<ChatRoom> searchActive(@Param("keyword") String keyword,
                                @Param("category") ChatCategory category);
}
