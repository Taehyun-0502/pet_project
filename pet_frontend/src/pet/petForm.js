// 반려동물 폼의 공통 규칙 — 등록·수정 화면이 같은 것을 쓴다.
// 서버도 등록·수정이 같은 record(PetSaveRequest)를 쓰므로, 여기서 갈라지면 화면마다 규칙이 어긋난다.

// 오늘 날짜(YYYY-MM-DD) — 생년월일 미래 입력 방지용
export function today() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

// 서버(PetSaveRequest)와 같은 규칙으로 1차 검증 — 최종 차단은 서버가 한다
export function validatePetForm(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = '이름은 필수입니다.'
  else if (form.name.trim().length > 50) errors.name = '이름은 50자 이하여야 합니다.'
  if (form.breed.trim().length > 50) errors.breed = '품종은 50자 이하여야 합니다.'
  if (form.birthDate && form.birthDate > today()) errors.birthDate = '생년월일은 미래 날짜일 수 없습니다.'
  return errors
}

// 폼 입력 → 요청 바디. 빈 선택 입력은 null로 통일한다(서버 normalizeBreed와 같은 원칙)
export function toPetRequest(form) {
  return {
    name: form.name.trim(),
    breed: form.breed.trim() || null,
    birthDate: form.birthDate || null,
  }
}
