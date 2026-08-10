package com.pet.backend.shorts;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 숏츠 저장소.
 *
 * <p><b>피드 조회가 2단으로 나뉘어 있다</b>(B단계). {@link #findRankedIds}가 점수 순서를 정하고,
 * {@link #findAllByIds}가 그 id들의 표시용 데이터를 채운다. 한 방에 하지 않는 이유:
 * <ul>
 *   <li>점수 계산에 {@code ln} / {@code power} / {@code extract(epoch ...)}가 필요해 <b>네이티브 SQL</b>이어야 한다</li>
 *   <li>그런데 네이티브 쿼리는 JPQL의 {@code select new ...} 생성자 표현식을 쓸 수 없고,
 *       인터페이스 프로젝션으로는 {@code tags}({@code text[]})가 {@code List<String>}으로 매핑되지 않는다</li>
 *   <li>나눠 두면 C단계에서 <b>랭킹 쿼리만 갈아끼우면</b> 되고 DTO 매핑 경로는 그대로 쓴다</li>
 * </ul>
 * 쿼리가 2번이지만 둘 다 인덱스를 타는 작은 조회(N ≤ 30)라 왕복 1회가 늘어나는 정도다.
 */
public interface ShortsRepository extends JpaRepository<Shorts, Long> {

    /**
     * 품질점수 상위 N개의 id를 순서대로 (가이드 4-a절).
     *
     * <pre>
     * quality = ( ln(1+like_count)*1.0 + ln(1+comment_count)*1.5 )
     *           / power( 나이_시간 + 2, 1.2 )
     * </pre>
     *
     * <p>설계 의도 — 분자는 참여도, 분모는 시간 감쇠다. {@code ln}을 쓰는 이유는 좋아요 1000개가
     * 10개의 100배로 세지 않게(포화) 하려는 것이고, 분모에 {@code +2}를 두는 이유는 방금 올린 영상의
     * 나이가 0이라 0으로 나누는 것을 막으면서 갓 올라온 영상이 과도하게 튀지 않게 하려는 것이다.
     *
     * <p>{@code order by}에 {@code s.id desc}를 함께 둔 것은 <b>동점 처리</b>다. 점수가 같은 영상들의
     * 순서가 요청마다 흔들리면 excludeIds 페이지네이션에서 중복·누락이 생긴다.
     *
     * @param excludeIds 제외할 id. <b>절대 비어 있으면 안 된다</b> — 이유는 ShortsService.withSentinel 참고
     * @param limit      가져올 개수. 서비스가 size+1을 넘겨 다음 페이지 유무를 판단한다
     */
    @Query(value = """
            select s.id
            from shorts s
            join pet_member m on m.id = s.member_id
            where s.deleted_at is null
              and m.deleted_at is null
              and s.id not in (:excludeIds)
            order by ( ln(1 + s.like_count::double precision) * 1.0
                     + ln(1 + s.comment_count::double precision) * 1.5 )
                     / power((extract(epoch from (now() - s.created_at)) / 3600 + 2)::double precision, 1.2)
                     desc,
                     s.id desc
            limit :limit
            """, nativeQuery = true)
    List<Long> findRankedIds(@Param("excludeIds") Collection<Long> excludeIds,
                             @Param("limit") int limit);

    /**
     * 개인화 랭킹 (C단계, 가이드 5절). 로그인 사용자 전용 — {@code memberId}는 null이면 안 된다.
     *
     * <p>B단계의 {@link #findRankedIds}에 세 가지가 더해진다.
     * <ol>
     *   <li><b>태그 선호 부스트</b> — 최근 30일 행동을 태그별로 집계해(tag_affinity) 품질점수에 곱한다</li>
     *   <li><b>본 영상 뒤로 밀기</b> — view 이벤트가 있는 영상을 두 번째 묶음으로 내린다</li>
     *   <li><b>내가 올린 영상 제외</b> — {@code s.member_id <> :memberId}</li>
     * </ol>
     *
     * <p>내 영상만은 "뒤로 밀기"가 아니라 <b>하드 제외</b>다. 위 2번을 뒤로 밀기로 정한 이유는
     * 영상이 적을 때 피드가 빈 화면이 되는 것을 막기 위해서인데, 내 영상은 다 봤다고 해서
     * 다시 보여줄 이유가 없다 — 내가 올린 것을 내 피드에서 다시 만나는 것 자체가 어색하다.
     *
     * <p>이 조건은 <b>로그인 조회에만 걸린다.</b> 비로그인({@link #findRankedIds})은 보는 사람이
     * 누구인지 알 수 없어 제외할 대상이 없다 — 같은 사람이 로그아웃 상태로 보면 자기 영상이 보인다.
     *
     * <p><b>가이드 4절의 "후보에서 제외"를 "뒤로 밀기"로 바꿨다.</b> 이유:
     * 페이지네이션은 B단계에서 이미 excludeIds가 맡았으므로(9절) 하드 제외의 남은 효과는
     * "본 것 숨기기"뿐인데, 영상 수가 적을 때 <b>피드가 영구히 빈 화면</b>이 된다
     * (영상 3개면 한 번 스크롤로 전부 소진). 2단 정렬은 안 본 것을 항상 먼저 주면서도
     * 다 봤을 때 조용히 재노출로 넘어간다. 되돌리려면 {@code case when exists(...)} 절을
     * {@code where not exists(...)}로 옮기면 된다.
     *
     * <p><b>부스트 배수를 {@code [0.2, 3.0]}으로 조인다</b>(가이드 원문에는 없는 방어).
     * skip이 −3이라 aff가 음수로 갈 수 있고, {@code 1 + aff*0.05}는 aff가 −20보다 작아지면
     * <b>음수 배수</b>가 된다. 그러면 품질점수가 높을수록 최종점수가 낮아져 순서가 뒤집힌다 —
     * 싫어하는 태그 중 가장 좋은 영상이 가장 아래로 가는 역전이다. 위쪽 3.0은 취향이 품질을
     * 완전히 덮어쓰지 않게 하는 상한이다.
     *
     * @param memberId   보는 사람. <b>null 금지</b> — 비로그인은 {@link #findRankedIds}를 쓴다
     * @param excludeIds 제외할 id. 비어 있으면 안 된다 (ShortsService.toExclusionList 참고)
     */
    @Query(value = """
            with tag_affinity as (
                select t.tag,
                       sum(
                           case e.type
                               when 'like' then 2
                               when 'comment' then 4
                               when 'share' then 5
                               when 'skip' then -3
                               else 0
                           end
                           + coalesce(ln(1 + least(coalesce(e.watch_ms, 0), es.duration_sec * 1000 * 3)
                                             ::double precision
                                         / nullif(es.duration_sec * 1000, 0)) * 6, 0)
                       ) as aff
                from shorts_event e
                join shorts es on es.id = e.short_id
                cross join lateral unnest(es.tags) as t(tag)
                where e.member_id = :memberId
                  and e.created_at > now() - interval '30 days'
                group by t.tag
            )
            select s.id
            from shorts s
            join pet_member m on m.id = s.member_id
            where s.deleted_at is null
              and m.deleted_at is null
              and s.member_id <> :memberId
              and s.id not in (:excludeIds)
            order by
                case when exists (
                    select 1 from shorts_event v
                    where v.member_id = :memberId and v.short_id = s.id and v.type = 'view'
                ) then 1 else 0 end,
                ( (ln(1 + s.like_count::double precision) * 1.0
                 + ln(1 + s.comment_count::double precision) * 1.5)
                  / power((extract(epoch from (now() - s.created_at)) / 3600 + 2)::double precision, 1.2) )
                * least(greatest(1 + coalesce(
                      (select sum(a.aff) from tag_affinity a where a.tag = any(s.tags)), 0) * 0.05,
                    0.2), 3.0)
                desc,
                s.id desc
            limit :limit
            """, nativeQuery = true)
    List<Long> findPersonalizedRankedIds(@Param("memberId") Long memberId,
                                         @Param("excludeIds") Collection<Long> excludeIds,
                                         @Param("limit") int limit);

    /**
     * 주어진 id들의 피드 표시 데이터. 회원 이름이 필요해 pet_member와 조인하고 바로 DTO로 뽑는다
     * (엔티티를 받아 나중에 이름을 채우면 N+1 쿼리가 된다).
     *
     * <p><b>순서를 보장하지 않는다.</b> {@code in} 절은 정렬과 무관하므로 점수 순서는
     * 호출한 쪽(ShortsService)이 다시 맞춰야 한다.
     */
    @Query("""
            select new com.pet.backend.shorts.ShortsResponse(
                s.id, m.name, s.videoUrl, s.thumbnailUrl, s.caption, s.tags,
                s.durationSec, s.viewCount, s.likeCount, s.commentCount, s.createdAt)
            from Shorts s
            join com.pet.backend.member.Member m on m.id = s.memberId
            where s.id in :ids
              and s.deletedAt is null
              and m.deletedAt is null
            """)
    List<ShortsResponse> findAllByIds(@Param("ids") Collection<Long> ids);

    Optional<Shorts> findByIdAndDeletedAtIsNull(Long id);

    boolean existsByIdAndDeletedAtIsNull(Long id);

    /**
     * 좋아요/댓글 수 증감. 엔티티를 읽어 +1 해서 저장하면 두 사람이 동시에 누를 때
     * 하나가 사라진다(읽기-수정-쓰기 경합). DB에서 직접 더하면 원자적으로 처리된다.
     */
    @Modifying
    @Query("update Shorts s set s.likeCount = s.likeCount + 1 where s.id = :id")
    void increaseLikeCount(@Param("id") Long id);

    // 0 미만으로 내려가지 않게 조건을 함께 건다
    @Modifying
    @Query("update Shorts s set s.likeCount = s.likeCount - 1 where s.id = :id and s.likeCount > 0")
    void decreaseLikeCount(@Param("id") Long id);

    @Modifying
    @Query("update Shorts s set s.commentCount = s.commentCount + 1 where s.id = :id")
    void increaseCommentCount(@Param("id") Long id);

    @Query("select s.likeCount from Shorts s where s.id = :id")
    Integer findLikeCount(@Param("id") Long id);
}
