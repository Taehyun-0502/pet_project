package com.pet.backend.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * code가 상수명에서 분리되면서 컴파일러가 더 이상 지켜주지 않게 된 것들을 대신 검사한다.
 * 상수명 중복은 컴파일 에러지만, code 문자열은 둘을 같게 써도 컴파일이 통과한다 —
 * 그 경우 프론트가 두 실패를 구분할 수 없다.
 */
class ErrorCodeTest {

    @Test
    void code는_전역에서_유일하다() {
        long distinct = Arrays.stream(ErrorCode.values())
                .map(ErrorCode::getCode)
                .distinct()
                .count();

        assertThat(distinct).isEqualTo(ErrorCode.values().length);
    }

    @Test
    void code는_비어있지_않다() {
        assertThat(ErrorCode.values())
                .allSatisfy(code -> assertThat(code.getCode()).isNotBlank());
    }
}
