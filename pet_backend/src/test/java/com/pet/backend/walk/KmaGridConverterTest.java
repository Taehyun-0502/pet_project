package com.pet.backend.walk;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 기상청 LCC(DFS) 격자 변환 검증 — 공식 문서·개발자 커뮤니티에 널리 공유된 검증값(서울시청)으로
 * 변환식 자체의 정확성을 확인한다.
 */
class KmaGridConverterTest {

    @Test
    void 서울시청_좌표는_격자_60_127로_변환된다() {
        KmaGridConverter.Grid grid = KmaGridConverter.toGrid(37.5665, 126.9780);

        assertThat(grid.nx()).isEqualTo(60);
        assertThat(grid.ny()).isEqualTo(127);
    }
}
