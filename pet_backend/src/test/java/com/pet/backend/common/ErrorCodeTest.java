package com.pet.backend.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

/**
 * ErrorCode가 도메인별 enum으로 나뉘면서 컴파일러가 더 이상 지켜주지 않게 된 것을 대신 검사한다.
 * 한 enum 안에 있을 때는 상수명 중복이 컴파일 에러였지만, 나뉜 뒤로는 {@code ChatErrorCode}와
 * {@code PetErrorCode}가 같은 코드 문자열을 써도 컴파일이 통과한다 — 그러면 프론트가 두 실패를
 * 구분할 수 없다.
 *
 * <p>구현체 목록을 손으로 적지 않고 클래스패스에서 찾는다. 손으로 적으면 새 도메인 enum을 만들고
 * 목록에 추가하는 걸 잊었을 때 검사가 조용히 비켜 간다 — 정작 그때가 가장 위험한 순간이다.
 */
class ErrorCodeTest {

    private static final String BASE_PACKAGE = "com.pet.backend";

    /** 도메인 enum이 하나라도 늘면 통과하되, 스캔 자체가 망가져 빈 목록이 오는 건 잡는 하한선. */
    private static final int KNOWN_ENUM_COUNT = 8;

    @Test
    void 코드는_전역에서_유일하다() throws ClassNotFoundException {
        assertThat(allErrorCodes())
                .extracting(ErrorCode::getCode)
                .doesNotHaveDuplicates();
    }

    @Test
    void 코드는_비어있지_않다() throws ClassNotFoundException {
        assertThat(allErrorCodes())
                .allSatisfy(code -> assertThat(code.getCode()).isNotBlank());
    }

    @Test
    void 모든_도메인_enum이_스캔된다() throws ClassNotFoundException {
        assertThat(errorCodeEnums()).hasSizeGreaterThanOrEqualTo(KNOWN_ENUM_COUNT);
    }

    private static List<ErrorCode> allErrorCodes() throws ClassNotFoundException {
        List<ErrorCode> codes = new ArrayList<>();
        for (Class<?> type : errorCodeEnums()) {
            for (Object constant : type.getEnumConstants()) {
                codes.add((ErrorCode) constant);
            }
        }
        return codes;
    }

    private static List<Class<?>> errorCodeEnums() throws ClassNotFoundException {
        // useDefaultFilters=false — @Component 같은 스테레오타입이 아니라 타입으로만 찾는다
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(ErrorCode.class));

        List<Class<?>> types = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents(BASE_PACKAGE)) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            if (type.isEnum()) {
                types.add(type);
            }
        }
        return types;
    }
}
