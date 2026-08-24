package com.pet.backend.walk;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * {@link WalkBriefingEvent} ↔ DB 소문자 코드 변환. {@code autoApply = false}로 두고
 * {@link WalkBriefing#event}에만 명시적으로 {@code @Convert}를 붙인다 — 이 enum이
 * walk 패키지 밖으로 노출될 일이 없어 자동 적용 범위를 넓힐 이유가 없다.
 */
@Converter(autoApply = false)
class WalkBriefingEventConverter implements AttributeConverter<WalkBriefingEvent, String> {

    @Override
    public String convertToDatabaseColumn(WalkBriefingEvent attribute) {
        return attribute == null ? null : attribute.code();
    }

    @Override
    public WalkBriefingEvent convertToEntityAttribute(String dbData) {
        return dbData == null ? null : WalkBriefingEvent.fromCode(dbData);
    }
}
