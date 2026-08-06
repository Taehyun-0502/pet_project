// 지도 메뉴 API 호출 함수 모음.
// - askChat: 멤버 4의 기존 POST /api/chat 재사용. 응답 스키마: { message, places[] }
// - getNearbyPlaces: 진입 시 초기 마커 노출용 GET /api/places (병렬 구현, 스키마 확정본)
// 두 API 모두 places[] 항목 형태가 동일하다: { name, category, lat, lng, address, placeUrl }.

import { request } from '../../common/apiClient'

// TODO(멤버 1 JWT 인증 연동 후 제거): 로그인 사용자의 반려견 ID를 아직 식별할 방법이
// 없어(petId 소유권 검증도 백엔드 쪽 보류 항목) 테스트용으로 고정한다.
// 루트 CLAUDE.md 158행 — "인증 연동 전에는 테스트 pet_id 하드코딩으로 개발".
export const TEST_PET_ID = 1

// 성공 시 { message: string, places: [{ name, category, lat, lng, address, placeUrl }] }
// lat/lng는 선택 — 없으면(위치 미동의/실패) 백엔드가 메시지의 지역명으로 폴백 처리한다.
export function askChat({ message, lat, lng }) {
  return request('/api/chat', {
    method: 'POST',
    body: { message, petId: TEST_PET_ID, lat, lng },
  })
}

// 성공 시 { places: [{ name, category, lat, lng, address, placeUrl }] }
// categories 생략 시 백엔드가 전체 카테고리(HOSPITAL/CAFE/HOTEL)로 조회한다.
export function getNearbyPlaces(lat, lng, categories) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (categories?.length) {
    params.set('categories', categories.join(','))
  }
  return request(`/api/places?${params.toString()}`)
}
