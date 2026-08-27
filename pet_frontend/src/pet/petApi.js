// 반려동물 API 호출 함수 모음 (docs/api-spec.md 2절과 1:1)

import { request } from '../common/apiClient'

// 성공 시 { id, name, breed, birthDate, createdAt }
export function registerPet({ name, breed, birthDate }) {
  return request('/api/pets', { method: 'POST', body: { name, breed, birthDate } })
}

// 성공 시 위 객체의 배열 (내 것만 — 서버가 보장).
// 정렬: 저장된 노출 순서 우선, 순서 미지정은 뒤에서 최근 등록순 (2026-08-27, api-spec.md 2절)
export function getMyPets() {
  return request('/api/pets')
}

/**
 * 노출 순서 저장 (마이페이지 펫 탭의 "설정" 드래그 정렬 — api-spec.md 2절).
 * petIds 배열 순서가 곧 노출 순서이고, 홈은 상위 2마리를 우선 노출한다.
 * **내 활성 반려동물 전체의 id가 정확히 한 번씩** 와야 한다 — 다른 기기의 등록·삭제와
 * 어긋난 상태로 저장하면 400 VALIDATION_ERROR가 오고, 목록을 다시 읽어 다시 정렬해야 한다.
 * 성공 시 갱신된 목록(getMyPets와 동일 형식·정렬)을 돌려주므로 재조회 없이 그대로 쓴다.
 */
export function updatePetOrder(petIds) {
  return request('/api/pets/order', { method: 'PUT', body: { petIds } })
}

// 상세. 없거나 타인 소유거나 삭제됐으면 전부 404 PET_NOT_FOUND (서버가 구분하지 않는다)
export function getPet(petId) {
  return request(`/api/pets/${petId}`)
}

// 전체 교체 — breed·birthDate를 비우면 서버에서 값이 지워진다 (부분 수정이 아니다)
export function updatePet(petId, { name, breed, birthDate }) {
  return request(`/api/pets/${petId}`, { method: 'PUT', body: { name, breed, birthDate } })
}

// 소프트 삭제. 목록·상세에서 사라지고 같은 id로 다시 접근하면 404
export function deletePet(petId) {
  return request(`/api/pets/${petId}`, { method: 'DELETE' })
}

// 프로필 사진 업로드 (jpeg/png/webp, 5MB 이하 — 서버가 최종 검증).
// 성공 시 갱신된 pet 객체 (profileImageUrl에 ?v=가 붙어 교체 즉시 새 이미지가 보인다)
export function uploadPetImage(petId, file) {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/pets/${petId}/image`, { method: 'POST', body: form })
}
