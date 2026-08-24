package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * WalkBriefingScheduler 단위 테스트 — 스케줄 스레드 보호(어떤 예외든 밖으로 던지지 않음)만 검증한다.
 * cron 표현식 자체는 @Scheduled 어노테이션 값이라 별도 단위 테스트 대상이 아니다.
 */
@ExtendWith(MockitoExtension.class)
class WalkBriefingSchedulerTest {

    @Mock
    private WalkBriefingService walkBriefingService;

    @Test
    void 판정_서비스가_예외를_던져도_스케줄러는_예외를_전파하지_않는다() {
        WalkBriefingScheduler scheduler = new WalkBriefingScheduler(walkBriefingService);
        doThrow(new RuntimeException("boom")).when(walkBriefingService).runBriefing();

        assertThatCode(scheduler::run).doesNotThrowAnyException();

        verify(walkBriefingService).runBriefing();
    }
}
