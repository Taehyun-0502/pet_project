package com.pet.backend.common;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.nio.charset.StandardCharsets;

/**
 * 문자 수가 아니라 **UTF-8 바이트 수** 상한을 검증한다.
 * `@Size`는 글자 수 기준이라 한글처럼 글자당 여러 바이트인 입력에서는
 * 바이트 제한이 있는 처리(예: BCrypt의 72바이트)를 막아주지 못한다.
 */
@Documented
@Constraint(validatedBy = MaxBytes.Validator.class)
@Target({ElementType.METHOD, ElementType.FIELD, ElementType.ANNOTATION_TYPE,
        ElementType.CONSTRUCTOR, ElementType.PARAMETER, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface MaxBytes {

    int value();

    String message() default "입력이 허용된 바이트 수를 초과했습니다.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<MaxBytes, String> {

        private int max;

        @Override
        public void initialize(MaxBytes annotation) {
            this.max = annotation.value();
        }

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            // null·빈 값 판단은 @NotBlank의 몫 — 여기서는 길이만 본다
            return value == null || value.getBytes(StandardCharsets.UTF_8).length <= max;
        }
    }
}
