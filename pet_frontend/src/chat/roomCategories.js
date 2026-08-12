// 방 카테고리 — 서버 ChatCategory enum과 계약 (docs/api-spec.md 7절 3차).
// 생성 폼·수정 폼·목록 뱃지가 전부 이 파일을 쓴다 (petForm.js와 같은 단일 출처 원칙)
export const ROOM_CATEGORIES = [
  { value: 'WALK', label: '산책' },
  { value: 'TRAINING', label: '훈련' },
  { value: 'HEALTH', label: '건강' },
  { value: 'FREE', label: '자유' },
]

// 모르는 값이 와도 깨지지 않게 원문 폴백 — 서버에 카테고리가 추가돼도 목록이 죽지 않는다
export function categoryLabel(value) {
  return ROOM_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
