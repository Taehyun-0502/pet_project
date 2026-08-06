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
