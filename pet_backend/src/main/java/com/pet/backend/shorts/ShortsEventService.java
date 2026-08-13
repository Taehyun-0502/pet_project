package com.pet.backend.shorts;

import com.pet.backend.common.BusinessException;
import com.pet.backend.common.CommonErrorCode;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 행동 이력 기록 (가이드 2절·6절). 저장만 하고 점수 계산은 하지 않는다 —
 * 랭킹은 C단계에서 조회 시점에 SQL이 계산한다.
 *
 * <p>입구가 두 개다.
 * <ul>
 *   <li>{@link #record} — 프론트가 보낸 시청 이벤트(view/watch/skip). 컨트롤러가 호출</li>
 *   <li>{@link #recordInteraction} — 좋아요·댓글 서비스가 자기 일을 하면서 함께 호출</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShortsEventService {

    /**
     * 클라이언트가 직접 보낼 수 있는 종류. like·comment·share를 뺀 이유는
     * 그 셋은 <b>실제 행위가 일어났을 때 서버가 기록</b>하기 때문이다.
     * 열어두면 shorts_like 행 없이 like 이벤트만 쌓는 요청이 가능해져 두 테이블이 어긋난다.
     */
    private static final Set<ShortsEventType> CLIENT_ALLOWED =
            Set.of(ShortsEventType.VIEW, ShortsEventType.WATCH, ShortsEventType.SKIP);

    private final ShortsEventRepository eventRepository;
    private final ShortsRepository shortsRepository;

    /**
     * 시청 이벤트 기록.
     *
     * @param memberId JWT에서 꺼낸 값. 이 엔드포인트는 인증 대상이라 null이 아니다
     * @param shortId  대상 영상. 없거나 삭제된 영상이면 404 — FK 위반으로 500이 나가는 것을 막는다
     */
    @Transactional
    public void record(Long memberId, Long shortId, ShortsEventCreateRequest request) {
        ShortsEventType type = ShortsEventType.from(request.type())
                .filter(CLIENT_ALLOWED::contains)
                .orElseThrow(() -> new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                        "기록할 수 없는 이벤트 종류입니다. view / watch / skip 중 하나여야 합니다."));

        if (!shortsRepository.existsByIdAndDeletedAtIsNull(shortId)) {
            throw new BusinessException(ShortsErrorCode.NOT_FOUND);
        }

        // 완료율을 계산할 수 없으면 watch/skip은 알고리즘에 쓸모가 없다 — 받는 시점에 막는다
        if (type != ShortsEventType.VIEW && request.watchMs() == null) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,
                    "%s 이벤트에는 watchMs가 필요합니다.".formatted(type.dbValue()));
        }
        // view는 '떴다'는 사실만 남긴다 (가이드 1절 — watch_ms는 시청 이벤트에만 채움)
        Integer watchMs = (type == ShortsEventType.VIEW) ? null : request.watchMs();

        eventRepository.save(ShortsEvent.watching(memberId, shortId, type, watchMs));
    }

    /**
     * 좋아요·댓글이 실제로 일어났을 때 이력을 남긴다 (가이드 2절 ③).
     *
     * <p><b>호출하는 서비스의 트랜잭션에 그대로 참여한다</b>(별도 @Transactional 없음) —
     * 좋아요는 성공했는데 이력만 남지 않는 어긋남을 만들지 않기 위해서다.
     * 뒤집어 말하면 이력 INSERT가 실패하면 좋아요도 롤백된다. FK가 보장된 단순 INSERT라
     * 실패 경로가 사실상 없고, 어긋난 데이터보다 함께 실패하는 쪽이 낫다고 판단했다.
     */
    void recordInteraction(Long memberId, Long shortId, ShortsEventType type) {
        eventRepository.save(ShortsEvent.interaction(memberId, shortId, type));
    }
}
