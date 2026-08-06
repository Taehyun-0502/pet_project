// 반려동물 API 호출 함수 모음 (docs/api-spec.md 2절과 1:1)

import { request } from '../common/apiClient'

// 성공 시 { id, name, breed, birthDate, createdAt }
export function registerPet({ name, breed, birthDate }) {
  return request('/api/pets', { method: 'POST', body: { name, breed, birthDate } })
}

// 성공 시 위 객체의 배열 (내 것만, 최근 등록순 — 서버가 보장)
export function getMyPets() {
  return request('/api/pets')
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
